/**
 * WorkBuddy → DSH skill importer (the write half).
 *
 * Copies the scanned candidates into the DSH skills root. Every write is
 * explicit:
 *
 *   - `status: same` is skipped (the target already holds exactly the
 *     rebuilt content — no timestamp churn, no needless backup);
 *   - `status: update` needs `overwrite` — otherwise it is skipped;
 *   - `overwrite` + `backup` moves the current target folder to
 *     `<targetRoot>/.backup/<id>-<stamp>/` before replacing it;
 *   - `dryRun` performs no filesystem write at all and reports the actions
 *     it would take;
 *   - excluded WorkBuddy files never travel (see scan.js), and the SKILL.md
 *     that lands is the rebuilt one, not the WorkBuddy original.
 *
 * The manifest (`<dshHome>/storages/workbuddy-skills/manifest.json`) records
 * which source folder and content hash produced each imported skill, so the
 * panel can show provenance and a later sync can tell "ours" from "someone
 * else's".
 */

import { cp, lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { isExcludedRelative } from './scan.js'
import { errorMessage } from './util.js'

/** Load the import manifest (missing/corrupt → empty, never fatal). */
export async function readManifest(manifestPath) {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist the import manifest (best effort). */
export async function writeManifest(manifestPath, manifest) {
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Filesystem-safe local timestamp for backup folder names. */
function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * Apply an import plan.
 *
 * @param {object} state - a FRESH scanSkills() result (it carries the rebuilt SKILL.md)
 * @param {{ names: string[], overwrite?: boolean, backup?: boolean, dryRun?: boolean }} plan
 * @param {{ manifestPath: string }} options
 * @returns {Promise<{ results: object[], summary: object, manifest: object }>}
 */
export async function importSkills(state, plan, { manifestPath }) {
  const wanted = new Set((plan.names ?? []).map((name) => String(name)))
  const overwrite = plan.overwrite === true
  const backup = plan.backup !== false
  const dryRun = plan.dryRun === true
  const manifest = await readManifest(manifestPath)
  const results = []
  const backupStamp = stamp()

  for (const skill of state.skills) {
    if (!wanted.has(skill.id)) continue

    if (skill.status === 'duplicate') {
      results.push({ id: skill.id, action: 'skipped', reason: `重复副本（${skill.sourceDir}）` })
      continue
    }
    if (skill.status === 'blocked') {
      results.push({ id: skill.id, action: 'skipped', reason: skill.note || '不可导入' })
      continue
    }
    if (skill.status === 'same') {
      results.push({ id: skill.id, action: 'skipped', reason: '已是最新（内容一致）' })
      continue
    }

    const exists = skill.status === 'update'
    if (exists && !overwrite) {
      results.push({ id: skill.id, action: 'skipped', reason: '目标已存在，未勾选覆盖' })
      continue
    }

    if (dryRun) {
      results.push({ id: skill.id, action: exists ? 'would-update' : 'would-import', reason: '' })
      continue
    }

    const targetPath = join(state.targetRoot, skill.id)
    let backupPath = ''
    try {
      await mkdir(state.targetRoot, { recursive: true })
      if (exists) {
        if (backup) {
          backupPath = join(state.targetRoot, '.backup', `${skill.id}-${backupStamp}`)
          await cp(targetPath, backupPath, { recursive: true })
        }
        await rm(targetPath, { recursive: true, force: true })
      }
      await mkdir(targetPath, { recursive: true })
      await cp(skill.sourcePath, targetPath, {
        recursive: true,
        force: true,
        filter: (src) => !isExcludedRelative(relative(skill.sourcePath, src)),
      })
      // The rebuilt frontmatter is the point of the whole exercise.
      await writeFile(join(targetPath, 'SKILL.md'), skill.generated, 'utf8')
      manifest[skill.id] = {
        sourceDir: skill.sourceDir,
        sourcePath: skill.sourcePath,
        hash: skill.hash,
        version: skill.version,
        importedAt: new Date().toISOString(),
      }
      results.push({
        id: skill.id,
        action: exists ? 'updated' : 'imported',
        fileCount: skill.fileCount,
        backupPath,
      })
    } catch (error) {
      results.push({ id: skill.id, action: 'failed', reason: errorMessage(error) })
    }
  }

  if (!dryRun) {
    try {
      await writeManifest(manifestPath, manifest)
    } catch {
      // A manifest write failure must not roll back a successful copy.
    }
  }

  const summary = { imported: 0, updated: 0, skipped: 0, failed: 0, planned: 0 }
  for (const result of results) {
    if (result.action === 'imported') summary.imported += 1
    else if (result.action === 'updated') summary.updated += 1
    else if (result.action === 'skipped') summary.skipped += 1
    else if (result.action === 'failed') summary.failed += 1
    else summary.planned += 1
  }
  return { results, summary, manifest, dryRun }
}

/** DSH skill ids — the same shape scan.js enforces, re-checked before any delete. */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/

/**
 * Remove skills from the DSH skills root.
 *
 * Safety contract (deleting is the one irreversible action here):
 *   - only ids matching the safe-id shape, and only a target that resolves to
 *     a DIRECT child of the DSH skills root (never `.`/`..`/separators);
 *   - a symlinked target is refused outright — that link belongs to another
 *     tool chain and removing it would be a surprise;
 *   - by default the folder is MOVED into `<targetRoot>/.backup/<id>-removed-<stamp>/`
 *     instead of being deleted, so a mis-click stays recoverable;
 *   - `dryRun` reports the intent and touches nothing.
 *
 * @param {{ targetRoot: string, skills: object[] }} state - a fresh scan result
 * @param {{ names: string[], backup?: boolean, dryRun?: boolean }} plan
 * @param {{ manifestPath: string }} options
 * @returns {Promise<{ results: object[], summary: object, manifest: object, dryRun: boolean }>}
 */
export async function removeSkills(state, plan, { manifestPath }) {
  const names = Array.from(new Set((plan.names ?? []).map((name) => String(name))))
  const backup = plan.backup !== false
  const dryRun = plan.dryRun === true
  const manifest = await readManifest(manifestPath)
  const results = []
  const backupStamp = stamp()
  const root = resolve(state.targetRoot)

  const installed = new Map()
  for (const skill of state.skills ?? []) {
    if (skill?.installed === true) installed.set(skill.id, skill)
  }

  for (const name of names) {
    if (!ID_RE.test(name)) {
      results.push({ id: name, action: 'skipped', reason: '技能 id 不合法' })
      continue
    }
    const targetPath = resolve(root, name)
    if (targetPath === root || !targetPath.startsWith(root + sep)) {
      results.push({ id: name, action: 'skipped', reason: '目标路径越界' })
      continue
    }

    let info = null
    let linkInfo = null
    try {
      linkInfo = await lstat(targetPath)
      info = await stat(targetPath)
    } catch {
      results.push({ id: name, action: 'skipped', reason: '目标目录不存在' })
      continue
    }
    if (linkInfo.isSymbolicLink()) {
      results.push({ id: name, action: 'skipped', reason: '目标目录是符号链接（可能来自其它工具链），未删除' })
      continue
    }
    if (!info.isDirectory()) {
      results.push({ id: name, action: 'skipped', reason: '目标不是目录' })
      continue
    }
    const skill = installed.get(name)
    if (skill === undefined) {
      results.push({ id: name, action: 'skipped', reason: '目标存在但不是本次扫描的可管理技能' })
      continue
    }

    if (dryRun) {
      results.push({ id: name, action: 'would-remove', reason: backup ? '将移动到 .backup/' : '将直接删除' })
      continue
    }

    try {
      let trashedTo = ''
      if (backup) {
        trashedTo = join(root, '.backup', `${name}-removed-${backupStamp}`)
        await mkdir(dirname(trashedTo), { recursive: true })
        await cp(targetPath, trashedTo, { recursive: true })
      }
      await rm(targetPath, { recursive: true, force: true })
      delete manifest[name]
      results.push({ id: name, action: 'removed', backupPath: trashedTo })
    } catch (error) {
      results.push({ id: name, action: 'failed', reason: errorMessage(error) })
    }
  }

  if (!dryRun) {
    try {
      await writeManifest(manifestPath, manifest)
    } catch {
      // Same rule as the import path: a manifest write must not undo the removal.
    }
  }

  const summary = { removed: 0, skipped: 0, failed: 0, planned: 0 }
  for (const result of results) {
    if (result.action === 'removed') summary.removed += 1
    else if (result.action === 'skipped') summary.skipped += 1
    else if (result.action === 'failed') summary.failed += 1
    else summary.planned += 1
  }
  return { results, summary, manifest, dryRun }
}
