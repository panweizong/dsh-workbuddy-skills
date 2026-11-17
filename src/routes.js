/**
 * HTTP surface of the WorkBuddy skill market (Settings panel transport).
 *
 *   GET  /dsh-workbuddy-skills/api/state           → the current scan
 *   GET  /dsh-workbuddy-skills/api/icon?dir=&name=  → one skill's icon bytes
 *   POST /dsh-workbuddy-skills/api/import          → { names, overwrite,
 *                                                      backup, dryRun }
 *                                                    → { summary, results,
 *                                                        state }
 *   POST /dsh-workbuddy-skills/api/remove          → { names, backup, dryRun }
 *                                                    → { summary, results,
 *                                                        state }
 *   POST /dsh-workbuddy-skills/api/settings        → { sourcePath, targetPath }
 *                                                    → { state }
 *
 * `sourcePath` / `targetPath` in the state payload are the EFFECTIVE paths
 * (panel setting > patch config > default); `settings.sourceDefault` /
 * `settings.targetDefault` are the defaults an empty field falls back to.
 *
 * Security baseline (same contract as the sibling WorkBuddy plugins):
 * mutating routes accept same-origin POSTs only (405 otherwise); a PRESENT
 * Host must name a loopback authority (DNS-rebinding defence), a present
 * Origin must equal Host, an ABSENT Origin passes (the Desktop proxy strips
 * it), `sec-fetch-site: cross-site` is refused; JSON bodies are capped at
 * 16 KiB; every response carries `cache-control: no-store`; mutating calls
 * are single-flight (a concurrent one gets 409).
 *
 * The icon route is read-only and takes its two inputs from an allow-list
 * (`dir` must be a plain sibling folder name, `name` must be one of the icon
 * spellings scan.js knows), so no path can be steered outside the source root.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { importSkills, readManifest, removeSkills } from './importer.js'
import { ICON_CANDIDATES, scanSkills, toPublicState } from './scan.js'
import { cleanPathInput, resolvePaths, writeSettings } from './settings.js'
import { errorMessage, expandHomePath } from './util.js'

const ROUTE_BASE = '/dsh-workbuddy-skills'

/** A skill folder name coming from the source root: no separators, no dotfiles. */
const SAFE_DIR_RE = /^[^\\/\u0000]+$/

const ICON_TYPES = new Map([
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

/** Write a JSON payload with no-store caching. */
function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

/** Whether a `Host` header names a loopback authority. */
function loopbackAuthority(host) {
  if (host === undefined) return false
  const lower = host.toLowerCase()
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

/** True when the request's origin statement is compatible with this host. */
function sameOrigin(request) {
  const host = request.headers.host
  if (host !== undefined && !loopbackAuthority(host)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Read and parse a JSON body, rejecting anything over `maxBytes`. */
async function readJsonBody(request, maxBytes = 16384) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/**
 * Register every market route on the host webServer.
 * @param {object} hostCtx - context exposing `webServer`
 * @param {{ sourcePath: string, targetRoot: string, manifestPath: string,
 *           settingsPath: string, dshHome?: string,
 *           defaults?: { overwrite?: boolean, backup?: boolean } }} options
 * @returns {() => void} disposer dropping every route
 */
export function mountRoutes(hostCtx, options) {
  const disposers = []
  const register = (route) => {
    const off = hostCtx.webServer.register(route)
    if (typeof off === 'function') disposers.push(off)
  }

  /**
   * Effective paths for one request: the panel settings file wins over the
   * patch config, which wins over the built-in defaults carried in `options`.
   */
  const paths = async () => resolvePaths({
    settingsPath: options.settingsPath,
    defaultSourcePath: options.sourcePath,
    defaultTargetRoot: options.targetRoot,
    expand: expandHomePath,
  })

  /** One full scan + manifest read: the single source of truth for callers. */
  const currentState = async () => {
    const resolved = await paths()
    const manifest = await readManifest(options.manifestPath)
    const state = await scanSkills({ sourcePath: resolved.sourcePath, targetRoot: resolved.targetRoot, manifest })
    return { state, paths: resolved }
  }

  /** The JSON body every caller of GET state / POST settings receives. */
  const statePayload = ({ state, paths: resolved }) => ({
    ...toPublicState(state),
    sourcePath: resolved.sourcePath,
    targetRoot: resolved.targetRoot,
    defaults: {
      overwrite: options.defaults?.overwrite === true,
      backup: options.defaults?.backup !== false,
    },
    settings: {
      sourcePath: resolved.sourcePath,
      targetPath: resolved.targetRoot,
      sourceDefault: options.sourcePath,
      targetDefault: options.targetRoot,
      customSource: resolved.sourceOverride,
      customTarget: resolved.targetOverride,
      dshHome: options.dshHome ?? '',
      file: options.settingsPath,
    },
  })

  let mutating = false

  register({
    kind: 'exact',
    path: `${ROUTE_BASE}/api/state`,
    handler: async (request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      try {
        sendJson(response, 200, statePayload(await currentState()))
      } catch (error) {
        sendJson(response, 500, { error: errorMessage(error) })
      }
    },
  })

  register({
    kind: 'exact',
    path: `${ROUTE_BASE}/api/settings`,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: 'same-origin required' })
        return
      }
      if (mutating) {
        sendJson(response, 409, { error: 'another operation is in progress' })
        return
      }
      mutating = true
      try {
        const body = await readJsonBody(request)
        const patch = {}
        for (const [field, key] of [['sourcePath', 'sourcePath'], ['targetPath', 'targetPath']]) {
          if (body?.[field] === undefined) continue
          const cleaned = cleanPathInput(body[field])
          if (cleaned.error !== undefined) {
            sendJson(response, 400, { error: `${field}: ${cleaned.error}` })
            return
          }
          patch[key] = cleaned.value
        }
        if (Object.keys(patch).length === 0) {
          sendJson(response, 400, { error: 'nothing to save' })
          return
        }
        await writeSettings(options.settingsPath, patch)
        sendJson(response, 200, { state: statePayload(await currentState()) })
      } catch (error) {
        sendJson(response, 500, { error: errorMessage(error) })
      } finally {
        mutating = false
      }
    },
  })

  register({
    kind: 'exact',
    path: `${ROUTE_BASE}/api/import`,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: 'same-origin required' })
        return
      }
      if (mutating) {
        sendJson(response, 409, { error: 'another import is in progress' })
        return
      }
      mutating = true
      try {
        const body = await readJsonBody(request)
        const names = Array.isArray(body?.names) ? body.names.filter((name) => typeof name === 'string') : []
        if (names.length === 0) {
          sendJson(response, 400, { error: 'names must be a non-empty string array' })
          return
        }
        const loaded = await currentState()
        const outcome = await importSkills(
          loaded.state,
          {
            names,
            overwrite: body?.overwrite === true,
            backup: body?.backup !== false,
            dryRun: body?.dryRun === true,
          },
          { manifestPath: options.manifestPath },
        )
        const next = await currentState()
        sendJson(response, 200, {
          summary: outcome.summary,
          results: outcome.results,
          dryRun: outcome.dryRun,
          state: statePayload(next),
        })
      } catch (error) {
        sendJson(response, 500, { error: errorMessage(error) })
      } finally {
        mutating = false
      }
    },
  })

  register({
    kind: 'exact',
    path: `${ROUTE_BASE}/api/icon`,
    handler: async (request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      let dir = ''
      let name = ''
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        dir = url.searchParams.get('dir') ?? ''
        name = url.searchParams.get('name') ?? ''
      } catch {
        sendJson(response, 400, { error: 'bad request' })
        return
      }
      if (dir === '' || dir.startsWith('.') || !SAFE_DIR_RE.test(dir) || !ICON_CANDIDATES.includes(name)) {
        sendJson(response, 400, { error: 'icon not addressable' })
        return
      }
      const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
      const type = ICON_TYPES.get(extension)
      if (type === undefined) {
        sendJson(response, 400, { error: 'unsupported icon type' })
        return
      }
      try {
        const resolved = await paths()
        const bytes = await readFile(join(resolved.sourcePath, dir, name))
        response.writeHead(200, {
          'cache-control': 'private, max-age=300',
          'content-type': type,
          'content-length': String(bytes.length),
        })
        response.end(request.method === 'HEAD' ? undefined : bytes)
      } catch {
        sendJson(response, 404, { error: 'icon not found' })
      }
    },
  })

  register({
    kind: 'exact',
    path: `${ROUTE_BASE}/api/remove`,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: 'same-origin required' })
        return
      }
      if (mutating) {
        sendJson(response, 409, { error: 'another operation is in progress' })
        return
      }
      mutating = true
      try {
        const body = await readJsonBody(request)
        const names = Array.isArray(body?.names) ? body.names.filter((name) => typeof name === 'string') : []
        if (names.length === 0) {
          sendJson(response, 400, { error: 'names must be a non-empty string array' })
          return
        }
        const loaded = await currentState()
        const outcome = await removeSkills(
          loaded.state,
          { names, backup: body?.backup !== false, dryRun: body?.dryRun === true },
          { manifestPath: options.manifestPath },
        )
        const next = await currentState()
        sendJson(response, 200, {
          summary: outcome.summary,
          results: outcome.results,
          dryRun: outcome.dryRun,
          state: statePayload(next),
        })
      } catch (error) {
        sendJson(response, 500, { error: errorMessage(error) })
      } finally {
        mutating = false
      }
    },
  })

  return () => {
    for (const off of disposers) off()
  }
}
