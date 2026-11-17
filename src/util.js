/**
 * Shared helpers: home expansion, dshHome resolution, error rendering.
 * Zero dependencies — this plugin must install offline.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Render any thrown value as a one-line message for JSON error payloads. */
export function errorMessage(error) {
  return String(error?.message ?? error)
}

/** Expand `~` / `~/` / `~\` against the OS home; anything else passes through. */
export function expandHomePath(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '~') return trimmed === '' ? '' : homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return trimmed
}

/**
 * Resolve the harness home: explicit config > `$DSH_HOME` (when non-blank) >
 * `~/.dsh` — the same precedence the harness itself uses.
 */
export function resolveDshHome(configured, env = process.env) {
  const fromEnv = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== '' ? env.DSH_HOME : undefined
  return resolve(expandHomePath(configured ?? fromEnv ?? join(homedir(), '.dsh')))
}
