/**
 * Offline route check: mounts src/routes.js against a stub webServer and
 * drives the HTTP surface with fake request/response objects. Verifies the
 * new /api/icon and /api/remove endpoints, the origin fence and the icon
 * allow-list — none of which need a running DSH host.
 *
 * Run: node scripts/routes-smoke.mjs
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mountRoutes } from '../src/routes.js'
import { DEFAULT_SOURCE_PATH } from '../src/scan.js'

function request(method, url, { headers = {}, body = null } = {}) {
  const chunks = body === null ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:13641', 'x-test-auth': 'ok', ...headers },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
}

function response() {
  const out = { status: 0, headers: {}, body: Buffer.alloc(0), text: () => '' }
  out.writeHead = (status, headers) => { out.status = status; out.headers = headers ?? {} }
  out.end = (payload) => {
    if (payload === undefined) { out.body = Buffer.alloc(0); return }
    out.body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')
    out.text = () => out.body.toString('utf8')
  }
  out.json = () => JSON.parse(out.text())
  return out
}

/**
 * Stub for `ctx.connection`: `requestRejection` is the DSH trust gate every
 * route starts with. `x-test-auth: ok` stands in for the browser's session,
 * `forbidden` for a refused origin, anything else for a missing credential.
 */
const connection = {
  requestRejection({ headers }) {
    const level = headers['x-test-auth']
    if (level === 'ok') return undefined
    if (level === 'forbidden') return 403
    return 401
  },
}

function stubServer() {
  const routes = new Map()
  return {
    routes,
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => routes.delete(route.path)
      },
    },
  }
}

const primary = stubServer()
const routes = primary.routes
const webServer = primary.webServer

const target = await mkdtemp(join(tmpdir(), 'wbs-routes-'))
const settingsPath = join(target, '.settings', 'settings.json')
const dispose = mountRoutes(
  { webServer },
  {
    connection,
    sourcePath: DEFAULT_SOURCE_PATH,
    targetRoot: target,
    manifestPath: join(target, '.manifest', 'manifest.json'),
    settingsPath,
    dshHome: target,
    defaults: { overwrite: false, backup: true },
  },
)

const call = async (method, path, options) => {
  const handler = routes.get(path.split('?')[0])
  if (handler === undefined) throw new Error(`no route for ${path}`)
  const res = response()
  await handler(request(method, path, options), res)
  return res
}

let failures = 0
const check = (label, condition, extra) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${extra === undefined ? '' : ` — ${extra}`}`)
  if (!condition) failures += 1
}

const BASE = '/dsh-workbuddy-skills/api'

// ── state ──────────────────────────────────────────────────────────────────
const state = await call('GET', `${BASE}/state`)
const stateBody = state.json()
check('GET state 200', state.status === 200)
check('state carries installed counter', typeof stateBody.counts.installed === 'number', JSON.stringify(stateBody.counts))
check('skills carry icon + installed fields', stateBody.skills.every((s) => 'icon' in s && 'installed' in s))
const withIcon = stateBody.skills.find((s) => s.icon !== '')
check('at least one skill ships an icon', withIcon !== undefined, withIcon?.icon)

// ── DSH trust gate: ctx.connection.requestRejection ───────────────────────
const noSession = await call('GET', `${BASE}/state`, { headers: { 'x-test-auth': 'none' } })
check('state refuses a request with no browser session', noSession.status === 401, String(noSession.status))
const gatedImport = await call('POST', `${BASE}/import`, {
  headers: { 'x-test-auth': 'forbidden', 'content-type': 'application/json' },
  body: { names: ['brainstorming'] },
})
check('import refuses what the trust gate rejects', gatedImport.status === 403, String(gatedImport.status))
const gatedIcon = await call('GET', `${BASE}/icon?dir=x&name=_icon.png`, { headers: { 'x-test-auth': 'none' } })
check('icon route is gated as well', gatedIcon.status === 401, String(gatedIcon.status))

// ── icon ───────────────────────────────────────────────────────────────────
const icon = await call('GET', `${BASE}/icon?dir=${encodeURIComponent(withIcon.sourceDir)}&name=${encodeURIComponent(withIcon.icon)}`)
check('GET icon 200', icon.status === 200, `${icon.headers['content-type']} ${icon.body.length}B`)
check('icon carries image bytes', icon.body.length > 0)
const traversal = await call('GET', `${BASE}/icon?dir=${encodeURIComponent('../../..')}&name=_icon.png`)
check('icon rejects traversal dir', traversal.status === 400, String(traversal.status))
const badName = await call('GET', `${BASE}/icon?dir=${encodeURIComponent(withIcon.sourceDir)}&name=SKILL.md`)
check('icon rejects non-icon file name', badName.status === 400, String(badName.status))
const dotDir = await call('GET', `${BASE}/icon?dir=.backup&name=icon.png`)
check('icon rejects dotfolder', dotDir.status === 400, String(dotDir.status))

// ── origin fence ───────────────────────────────────────────────────────────
const crossSite = await call('POST', `${BASE}/remove`, {
  headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
  body: { names: ['brainstorming'] },
})
check('remove refuses cross-site', crossSite.status === 403, String(crossSite.status))
const badOrigin = await call('POST', `${BASE}/import`, {
  headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
  body: { names: ['brainstorming'] },
})
check('import refuses foreign Origin', badOrigin.status === 403, String(badOrigin.status))
const emptyNames = await call('POST', `${BASE}/remove`, { headers: { 'content-type': 'application/json' }, body: { names: [] } })
check('remove rejects empty names', emptyNames.status === 400, String(emptyNames.status))

// ── import then remove, end to end over HTTP ──────────────────────────────
const pick = stateBody.skills.find((s) => s.status === 'new')
const imported = await call('POST', `${BASE}/import`, {
  headers: { 'content-type': 'application/json' },
  body: { names: [pick.id], overwrite: true, backup: true, dryRun: false },
})
const importedBody = imported.json()
check('import 200 + imported 1', imported.status === 200 && importedBody.summary.imported === 1, JSON.stringify(importedBody.summary))
check('import returns fresh state', importedBody.state.counts.installed === 1, JSON.stringify(importedBody.state.counts))

const removeDry = await call('POST', `${BASE}/remove`, {
  headers: { 'content-type': 'application/json' },
  body: { names: [pick.id], backup: true, dryRun: true },
})
check('remove dry run plans 1', removeDry.status === 200 && removeDry.json().summary.planned === 1, JSON.stringify(removeDry.json().summary))

const removed = await call('POST', `${BASE}/remove`, {
  headers: { 'content-type': 'application/json' },
  body: { names: [pick.id], backup: true, dryRun: false },
})
const removedBody = removed.json()
check('remove 200 + removed 1', removed.status === 200 && removedBody.summary.removed === 1, JSON.stringify(removedBody.summary))
check('remove returns state without the skill', removedBody.state.counts.installed === 0 && removedBody.state.skills.find((s) => s.id === pick.id).status === 'new')

// ── settings: panel overrides for source / target ─────────────────────────
check('state carries settings block', stateBody.settings !== undefined && typeof stateBody.settings.sourceDefault === 'string', JSON.stringify(stateBody.settings))
check('state settings points at the settings file', stateBody.settings?.file === settingsPath, stateBody.settings?.file)
check('state defaults to the bundled source path', stateBody.sourcePath === DEFAULT_SOURCE_PATH, stateBody.sourcePath)

const customSource = join(target, 'custom-source')
const savedSource = await call('POST', `${BASE}/settings`, {
  headers: { 'content-type': 'application/json' },
  body: { sourcePath: customSource },
})
const savedBody = savedSource.json()
check('settings save 200', savedSource.status === 200, String(savedSource.status))
check('settings save overrides the source path', savedBody.state.sourcePath === customSource, savedBody.state.sourcePath)
check('settings save is reflected in the custom field', savedBody.state.settings.customSource === customSource, savedBody.state.settings.customSource)

const savedTarget = await call('POST', `${BASE}/settings`, {
  headers: { 'content-type': 'application/json' },
  body: { targetPath: join(target, 'custom-target') },
})
check('settings save keeps the previous source', savedTarget.json().state.sourcePath === customSource, savedTarget.json().state.sourcePath)

const cleared = await call('POST', `${BASE}/settings`, {
  headers: { 'content-type': 'application/json' },
  body: { sourcePath: '', targetPath: '' },
})
const clearedBody = cleared.json()
check('settings reset falls back to the default source', cleared.status === 200 && clearedBody.state.sourcePath === DEFAULT_SOURCE_PATH, clearedBody.state.sourcePath)
check('settings reset clears the custom fields', clearedBody.state.settings.customSource === '' && clearedBody.state.settings.customTarget === '')

const relativePath = await call('POST', `${BASE}/settings`, {
  headers: { 'content-type': 'application/json' },
  body: { sourcePath: 'relative/path' },
})
check('settings rejects a relative path', relativePath.status === 400, String(relativePath.status))
const emptyBody = await call('POST', `${BASE}/settings`, {
  headers: { 'content-type': 'application/json' },
  body: {},
})
check('settings rejects an empty change set', emptyBody.status === 400, String(emptyBody.status))
const crossSiteSettings = await call('POST', `${BASE}/settings`, {
  headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
  body: { sourcePath: customSource },
})
check('settings refuses cross-site', crossSiteSettings.status === 403, String(crossSiteSettings.status))
const getSettings = await call('GET', `${BASE}/settings`)
check('settings rejects GET', getSettings.status === 405, String(getSettings.status))

// ── fail closed when the connection service is missing ────────────────────
const bare = stubServer()
const disposeBare = mountRoutes(
  { webServer: bare.webServer },
  {
    sourcePath: DEFAULT_SOURCE_PATH,
    targetRoot: target,
    manifestPath: join(target, '.manifest', 'manifest.json'),
    settingsPath,
    dshHome: target,
  },
)
const bareRes = response()
await bare.routes.get(`${BASE}/state`)(request('GET', `${BASE}/state`), bareRes)
check('routes fail closed without the connection service', bareRes.status === 503, String(bareRes.status))
disposeBare()

dispose()
await rm(target, { recursive: true, force: true })
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
