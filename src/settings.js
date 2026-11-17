/**
 * Panel-editable settings (source root / target root).
 *
 * Precedence: panel settings file  >  patch config  >  built-in defaults.
 *
 * The file lives under `<dshHome>/storages/workbuddy-skills/settings.json` and
 * is read on every request, so a save takes effect on the next scan — no
 * process restart and no Loader re-apply (which would reload this module and
 * drop the in-flight response).
 *
 * Only the two paths are user-editable on purpose: everything else ships with
 * a default that fits the normal case (see README).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const SETTINGS_VERSION = 1

/** Absolute path of the settings file for a harness home. */
export function settingsFile(dshHome) {
  return join(dshHome, 'storages', 'workbuddy-skills', 'settings.json')
}

/**
 * Read the settings file, tolerating absence and corruption.
 * @param {string} path
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readSettings(path) {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * Merge `patch` into the settings file and persist it.
 * @param {string} path
 * @param {Record<string, unknown>} patch
 */
export async function writeSettings(path, patch) {
  const current = await readSettings(path)
  const next = { ...current, ...patch, version: SETTINGS_VERSION, updatedAt: new Date().toISOString() }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

const MAX_PATH_LENGTH = 1024
/** Absolute Windows drive, UNC share, POSIX root, or a `~` home prefix. */
const ABSOLUTE_RE = /^(?:~|[A-Za-z]:[\\/]|\\\\|\/)/

/**
 * Validate one path field coming from the panel.
 * An empty string means "fall back to the default" and is allowed.
 * @param {unknown} value
 * @returns {{ value: string } | { error: string }}
 */
export function cleanPathInput(value) {
  if (typeof value !== 'string') return { error: 'path must be a string' }
  const trimmed = value.trim()
  if (trimmed === '') return { value: '' }
  if (trimmed.length > MAX_PATH_LENGTH) return { error: 'path is too long' }
  if (/[\u0000-\u001f]/.test(trimmed)) return { error: 'path contains control characters' }
  if (!ABSOLUTE_RE.test(trimmed)) return { error: 'path must be absolute (or start with ~)' }
  return { value: trimmed }
}

/** A stored path is usable only when it is a non-empty string. */
function storedPath(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/**
 * Resolve the paths a request should use.
 * @param {{ settingsPath: string, defaultSourcePath: string, defaultTargetRoot: string, expand: (value: string) => string }} options
 */
export async function resolvePaths(options) {
  const settings = await readSettings(options.settingsPath)
  const sourceOverride = storedPath(settings.sourcePath)
  const targetOverride = storedPath(settings.targetPath)
  return {
    settings,
    sourcePath: sourceOverride === '' ? options.defaultSourcePath : options.expand(sourceOverride),
    targetRoot: targetRootFor(targetOverride, options),
    targetOverride,
    sourceOverride,
  }
}

function targetRootFor(targetOverride, options) {
  return targetOverride === '' ? options.defaultTargetRoot : options.expand(targetOverride)
}
