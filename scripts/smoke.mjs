/**
 * Offline smoke check for the scan/import/remove half (no DSH runtime needed).
 * Run: node scripts/smoke.mjs [--target <dir>]
 */

import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { importSkills, readManifest, removeSkills } from '../src/importer.js'
import { DEFAULT_SOURCE_PATH, scanSkills, splitFrontmatter, parseFrontmatter, resolveSkillId } from '../src/scan.js'

function line(...args) { console.log(...args) }

// ── unit: frontmatter parsing on the three real shapes ─────────────────────
const folded = splitFrontmatter('---\nname: demo\nversion: 1.2.0\ndescription: >-\n  line one\n  line two\n---\n\n# Body\ntext\n')
const fm = parseFrontmatter(folded.frontmatter)
line('parse:', JSON.stringify({ name: fm.name, version: fm.version, description: fm.description }))
line('id(from name):', resolveSkillId({ name: 'kingdee-dev' }, 'kingdee-dev__skillhub').id)
line('id(from folder):', resolveSkillId({}, 'guandata-cli-suite__skillhub').id)
line('id(user suffix):', resolveSkillId({}, 'kingdee-dev__user_03e6265c__skillhub').id)

// ── scan the real WorkBuddy root against a temp target ────────────────────
const target = await mkdtemp(join(tmpdir(), 'wbs-target-'))
const manifestPath = join(target, '.manifest', 'manifest.json')
const state = await scanSkills({ sourcePath: DEFAULT_SOURCE_PATH, targetRoot: target, manifest: {} })

line('\nsource:', state.sourcePath, 'exists=', state.pathExists)
line('counts:', JSON.stringify(state.counts))
line('with icon:', state.skills.filter((skill) => skill.icon !== '').length, '/', state.skills.length)
line('warnings:', state.warnings.length)
for (const warning of state.warnings.slice(0, 6)) line('  !', warning)

for (const skill of state.skills) {
  line(
    `  ${skill.status.padEnd(9)} ${skill.id.padEnd(34)} v${(skill.version || '-').padEnd(8)} ${String(skill.fileCount).padStart(3)}f ${skill.icon === '' ? '-' : skill.icon} <- ${skill.sourceDir}`,
  )
}

// ── dry run then a real import of two rows ────────────────────────────────
const picks = state.skills.filter((s) => s.status === 'new').slice(0, 2).map((s) => s.id)
if (picks.length > 0) {
  const dry = await importSkills(state, { names: picks, dryRun: true }, { manifestPath })
  line('\ndry run summary:', JSON.stringify(dry.summary), picks.join(','))
  const real = await importSkills(state, { names: picks, overwrite: true, backup: true }, { manifestPath })
  line('real summary:', JSON.stringify(real.summary))
  for (const result of real.results) line('  ', result.action, result.id, result.reason || '')
  line('target now:', (await readdir(target)).join(', '))
  const second = await scanSkills({ sourcePath: DEFAULT_SOURCE_PATH, targetRoot: target, manifest: {} })
  line('rescan counts:', JSON.stringify(second.counts))
  for (const id of picks) {
    const row = second.skills.find((s) => s.id === id)
    line('  after import:', id, '->', row ? row.status : 'missing', 'installed=', row ? row.installed : '-')
  }

  // ── removal: dry run, real remove (backup), rescan, then a hostile name ──
  const removeDry = await removeSkills(second, { names: [picks[0]], dryRun: true }, { manifestPath })
  line('\nremove dry run:', JSON.stringify(removeDry.summary), JSON.stringify(removeDry.results[0]))
  const removed = await removeSkills(second, { names: [picks[0]], backup: true }, { manifestPath })
  line('remove real:', JSON.stringify(removed.summary), JSON.stringify(removed.results[0]))
  const third = await scanSkills({ sourcePath: DEFAULT_SOURCE_PATH, targetRoot: target, manifest: {} })
  const back = third.skills.find((s) => s.id === picks[0])
  line('  after remove:', picks[0], '->', back ? back.status : 'missing', 'installed=', back ? back.installed : '-')
  line('  backup dirs:', (await readdir(join(target, '.backup'))).join(', '))
  line('  manifest keys:', Object.keys(await readManifest(manifestPath)).join(', '))

  const hostile = await removeSkills(third, { names: ['../escape', 'not/valid', 'nonexistent-skill'], backup: false }, { manifestPath })
  line('hostile names:', JSON.stringify(hostile.summary), hostile.results.map((r) => `${r.id}:${r.reason}`).join(' | '))
}

await rm(target, { recursive: true, force: true })
line('\nOK')
