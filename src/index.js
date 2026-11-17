/**
 * dsh-workbuddy-skills host entry.
 *
 * Scans the WorkBuddy skills folder (`~/.workbuddy/skills` by default) and
 * copies selected skills into the DSH skills root (`<dshHome>/skills`), with
 * DSH-native ids and frontmatter. The Settings panel ("WorkBuddy 技能")
 * drives it over the routes in ./routes.js.
 *
 * Config (all optional, patch-level — no settings form on purpose, this
 * plugin must install with zero dependencies):
 *   sourcePath  WorkBuddy skills root   (default ~/.workbuddy/skills)
 *   targetPath  DSH skills root         (default <dshHome>/skills)
 *   dshHome     harness home            (default $DSH_HOME || ~/.dsh)
 *   overwrite   pre-tick "overwrite existing skills" (default false)
 *   backup      pre-tick "back up before overwrite"  (default true)
 *
 * These are DEFAULTS: the panel can override the two paths at runtime and the
 * override is stored in `<dshHome>/storages/workbuddy-skills/settings.json`
 * (see ./settings.js). Precedence: panel > patch config > built-in default.
 */

import { join } from 'node:path'

import { mountRoutes } from './routes.js'
import { DEFAULT_SOURCE_PATH } from './scan.js'
import { settingsFile } from './settings.js'
import { expandHomePath, resolveDshHome } from './util.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-workbuddy-skills'

/**
 * Register the market routes against the host context.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context
 * @param {{sourcePath?: string, targetPath?: string, dshHome?: string, overwrite?: boolean, backup?: boolean}} [config]
 */
export function apply(ctx, config = {}) {
  const warn = (message) => ctx.logger?.warn?.(`dsh-workbuddy-skills: ${message}`)
  const dshHome = resolveDshHome(config.dshHome)
  const sourcePath = expandHomePath(config.sourcePath ?? DEFAULT_SOURCE_PATH)
  const targetRoot = config.targetPath !== undefined && String(config.targetPath).trim() !== ''
    ? expandHomePath(config.targetPath)
    : join(dshHome, 'skills')
  const manifestPath = join(dshHome, 'storages', 'workbuddy-skills', 'manifest.json')
  // Panel-editable overrides (source root / target root); empty means "use the
  // patch config or the built-in default resolved above".
  const settingsPath = settingsFile(dshHome)

  // Staged inject: the webServer may register after this plugin applies, and a
  // synchronous ctx.get would silently skip the routes (the classic 404).
  ctx.inject(['webServer'], (webServerCtx) => {
    ctx.effect(() => {
      const webServer = webServerCtx.webServer
      if (typeof webServer?.register !== 'function') {
        warn('webServer is unavailable — the market panel routes were not mounted')
        return () => {}
      }
      return mountRoutes(
        { webServer },
        {
          sourcePath,
          targetRoot,
          manifestPath,
          settingsPath,
          dshHome,
          defaults: { overwrite: config.overwrite === true, backup: config.backup !== false },
        },
      )
    }, 'dsh-workbuddy-skills:routes')
  })
}
