/**
 * WorkBuddy → DSH skill scanner.
 *
 * Reads every skill folder under the WorkBuddy skills root (`SKILL.md` at the
 * folder root, WorkBuddy's own convention), and derives what the SAME skill
 * would look like inside the DSH skills root:
 *
 *   - the DSH skill id (the target FOLDER name) comes from the frontmatter
 *     `name` — NOT from the WorkBuddy folder name, which may carry the
 *     skillhub suffixes `__skillhub` / `__user_<hash>__skillhub`;
 *   - the SKILL.md that gets written is REBUILT: only the frontmatter keys
 *     DSH understands are kept (`name` / `description` / `version` /
 *     `license`), WorkBuddy-only keys (`slug`, `displayName`, `summary`,
 *     `description_zh`, `argument-hint`, `intent`, `theme`, `best_for`, …)
 *     are dropped, and a `description_zh`-only skill is promoted to
 *     `description` so DSH still sees a description;
 *   - the body after the frontmatter is copied verbatim.
 *
 * The rebuilt SKILL.md is hashed, which is what status detection compares:
 * `same` means the target already holds exactly what we would write.
 *
 * Everything here is pure/read-only; the write half lives in importer.js.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'

import { errorMessage } from './util.js'

/** The WorkBuddy skills root (overridable through the plugin config). */
export const DEFAULT_SOURCE_PATH = join(homedir(), '.workbuddy', 'skills')

/** Frontmatter keys carried into the DSH copy, in write order. */
export const KEPT_FRONTMATTER_KEYS = ['name', 'description', 'version', 'license']

/**
 * WorkBuddy-only files: skillhub/user metadata, store listings and the
 * preview pages. Dropped from the DSH copy — they mean nothing to DSH and
 * the store blurbs are plain noise inside a skill folder.
 */
export const EXCLUDED_FILES = new Set([
  '_meta.json',
  '_skillhub_meta.json',
  '_user_meta.json',
  'skill-card.md',
  '上架说明.md',
  '使用指南.md',
  '开发者声明.md',
  '.DS_Store',
  'Thumbs.db',
])

/** Preview-page twins that carry a locale suffix (`示例页.html`, `示例页-zh.svg`). */
const EXCLUDED_FILE_PATTERNS = [/^示例页[.-]/, /^demo-page[.-]/i]

/**
 * Icon files WorkBuddy ships beside SKILL.md, in preference order. The panel
 * renders a card per skill, so the icon is what makes it look like the store.
 */
export const ICON_CANDIDATES = [
  '_icon.png',
  'icon.png',
  '_icon.svg',
  'icon.svg',
  '_icon.jpg',
  'icon.jpg',
  'logo.png',
]

/** Never descended into, never copied. */
export const EXCLUDED_DIRS = new Set(['__MACOSX', '.git', 'node_modules', '.svn'])

/** Copy limits — the same class of guard the store-installed managers use. */
export const LIMITS = {
  maxFiles: 500,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
}

/** DSH skill ids: lower-case, no leading dot/dash, no path separators. */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/

/** The WorkBuddy folder-suffix shapes that must never reach the skill id. */
const WB_SUFFIX_RE = /(__user_[0-9a-z]+__skillhub|__skillhub|__user_skillhub)$/i

/** sha256 of a Buffer/string, hex. */
export function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Split a SKILL.md into its frontmatter block (delimiters stripped) and body.
 * Tolerates a BOM, CRLF and a missing frontmatter block (body = whole text).
 * @returns {{ frontmatter: string|null, body: string }}
 */
export function splitFrontmatter(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const lines = source.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trim() !== '---') return { frontmatter: null, body: source }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      return {
        frontmatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      }
    }
  }
  return { frontmatter: null, body: source }
}

/** Strip one layer of matching quotes and unescape the YAML-lite escapes. */
function unquote(value) {
  const text = value.trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' || first === "'") && last === first) {
      const inner = text.slice(1, -1)
      return inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(new RegExp(`\\\\${first}`, 'g'), first)
    }
  }
  return text
}

/**
 * Parse the flat top-level `key: value` pairs of a frontmatter block.
 * Handles quoted values, folded (`>`) / literal (`|`) block scalars and
 * indented continuation lines. Nested maps and lists collapse to '' — no
 * skill field this plugin needs is nested.
 * @returns {Record<string, string>}
 */
export function parseFrontmatter(frontmatter) {
  const out = {}
  if (typeof frontmatter !== 'string') return out
  const lines = frontmatter.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line) || /^\s/.test(line)) { i += 1; continue }
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) { i += 1; continue }
    const key = match[1]
    const rawValue = match[2]
    i += 1
    const blockMarker = /^([>|])[+-]?\s*$/.exec(rawValue.trim())
    if (blockMarker !== null) {
      const collected = []
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        collected.push(lines[i])
        i += 1
      }
      const stripped = collected.map((entry) => entry.replace(/^\s+/, ''))
      while (stripped.length > 0 && stripped[stripped.length - 1].trim() === '') stripped.pop()
      const text = blockMarker[1] === '>'
        ? stripped.join('\n').replace(/\n{2,}/g, '\u0000').replace(/\n/g, ' ').replace(/\u0000/g, '\n')
        : stripped.join('\n')
      out[key] = text.trim()
      continue
    }
    if (rawValue.trim() === '') {
      // Nested map / list: consume its indented block, keep the key empty.
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) i += 1
      out[key] = ''
      continue
    }
    let value = rawValue
    // Folded continuation: further indented lines belong to this scalar.
    while (i < lines.length && /^\s+\S/.test(lines[i])) {
      value += ` ${lines[i].trim()}`
      i += 1
    }
    out[key] = unquote(value)
  }
  return out
}

/**
 * Resolve the DSH skill id for one WorkBuddy folder.
 * Preference: frontmatter `name` → `slug` → folder name with the skillhub
 * suffixes stripped. Invalid characters are folded to `-`; a value that
 * still cannot form a safe id reports `error` instead.
 * @returns {{ id: string, error?: string, from: string }}
 */
export function resolveSkillId(frontmatter, dirName) {
  const candidates = [frontmatter?.name, frontmatter?.slug, String(dirName ?? '').replace(WB_SUFFIX_RE, '')]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim().replace(WB_SUFFIX_RE, '').trim()
    if (trimmed === '') continue
    const folded = trimmed.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+/, '').replace(/[-._]+$/, '')
    if (folded === '') continue
    if (ID_RE.test(folded)) return { id: folded, from: candidate === frontmatter?.name ? 'name' : 'folder' }
    return { id: folded, error: `技能 id 不合法：${folded}`, from: 'name' }
  }
  return { id: String(dirName ?? '').replace(WB_SUFFIX_RE, '') || 'unnamed', error: '无法从 frontmatter 解析技能 id', from: 'none' }
}

/** Pick the description DSH should see (WB carries three spellings of it). */
export function pickDescription(frontmatter, body) {
  const direct = [frontmatter?.description, frontmatter?.description_zh, frontmatter?.description_en, frontmatter?.summary]
  for (const value of direct) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim().replace(/\s*\n\s*/g, ' ')
  }
  const paragraph = String(body ?? '')
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.replace(/^#+\s.*$/gm, '').trim())
    .find((chunk) => chunk !== '')
  return paragraph === undefined ? '' : paragraph.replace(/\s*\n\s*/g, ' ').slice(0, 500)
}

/**
 * Rebuild the SKILL.md that lands in the DSH skills root: DSH's own
 * frontmatter, verbatim body.
 */
export function buildSkillMd(id, description, version, license, body) {
  const lines = ['---', `name: ${JSON.stringify(id)}`, `description: ${JSON.stringify(description ?? '')}`]
  if (typeof version === 'string' && version.trim() !== '') lines.push(`version: ${JSON.stringify(version.trim())}`)
  if (typeof license === 'string' && license.trim() !== '') lines.push(`license: ${JSON.stringify(license.trim())}`)
  lines.push('---', '')
  const rest = String(body ?? '').replace(/^\r?\n/, '')
  return `${lines.join('\n')}${rest}`
}

/** First icon file present in a skill folder ('' when there is none). */
export async function findIcon(root) {
  for (const candidate of ICON_CANDIDATES) {
    try {
      const info = await stat(join(root, candidate))
      if (info.isFile()) return candidate
    } catch {
      // Missing candidate: try the next spelling.
    }
  }
  return ''
}

/** Whether a relative path inside a skill folder is dropped from the copy. */
export function isExcludedRelative(relPath) {
  const rel = String(relPath ?? '')
  if (rel === '') return false
  const segments = rel.split(/[\\/]/).filter((segment) => segment !== '')
  if (segments.some((segment) => EXCLUDED_DIRS.has(segment))) return true
  const name = segments[segments.length - 1]
  if (EXCLUDED_FILES.has(name)) return true
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Walk one skill folder, applying the exclusion rules and the copy limits.
 * @returns {Promise<{files: Array<{path: string, size: number}>, count: number, totalBytes: number, problems: string[]}>}
 */
export async function listSkillFiles(root) {
  const files = []
  const problems = []
  let totalBytes = 0

  async function walk(dir, depth) {
    if (depth > 12) { problems.push(`目录层级过深，已跳过：${relative(root, dir) || '.'}`); return }
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      problems.push(`目录不可读：${relative(root, dir) || '.'}（${errorMessage(error)}）`)
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      const rel = relative(root, abs)
      if (isExcludedRelative(rel)) continue
      if (entry.isDirectory()) {
        await walk(abs, depth + 1)
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      let info
      try {
        info = await stat(abs)
      } catch (error) {
        problems.push(`文件不可读：${rel}（${errorMessage(error)}）`)
        continue
      }
      if (!info.isFile()) continue
      if (info.size > LIMITS.maxFileBytes) {
        problems.push(`文件超过 ${LIMITS.maxFileBytes / 1024 / 1024} MiB，已排除：${rel}`)
        continue
      }
      totalBytes += info.size
      files.push({ path: rel.split(sep).join('/'), size: info.size })
    }
  }

  await walk(root, 0)
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (files.length > LIMITS.maxFiles) problems.push(`文件数 ${files.length} 超过上限 ${LIMITS.maxFiles}`)
  if (totalBytes > LIMITS.maxTotalBytes) problems.push(`总体积 ${Math.round(totalBytes / 1024)} KiB 超过上限 ${LIMITS.maxTotalBytes / 1024 / 1024} MiB`)
  return { files, count: files.length, totalBytes, problems }
}

/** Index the existing DSH skills root: id → { hash, symlink, hasSkillMd }. */
async function indexTargetRoot(targetRoot) {
  const index = new Map()
  let entries
  try {
    entries = await readdir(targetRoot, { withFileTypes: true })
  } catch {
    return index
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const abs = join(targetRoot, entry.name)
    let hash = null
    let symlink = entry.isSymbolicLink()
    try {
      const info = await stat(abs)
      if (info.isSymbolicLink()) symlink = true
      const target = await stat(join(abs, 'SKILL.md'))
      if (target.isFile()) hash = sha256(await readFile(join(abs, 'SKILL.md')))
      else symlink = symlink || false
    } catch {
      hash = null
    }
    index.set(entry.name, { hash, symlink, hasSkillMd: hash !== null })
  }
  return index
}

/**
 * Scan the WorkBuddy skills root and project every folder onto the DSH
 * skills root.
 *
 * @param {{ sourcePath: string, targetRoot: string, manifest?: Record<string, any> }} options
 * @returns {Promise<object>} the state the panel renders
 */
export async function scanSkills({ sourcePath, targetRoot, manifest = {} }) {
  const warnings = []
  const skills = []
  let pathExists = false
  let dirNames = []

  try {
    const entries = await readdir(sourcePath, { withFileTypes: true })
    pathExists = true
    dirNames = entries
      .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    warnings.push(`源目录不可读：${errorMessage(error)}`)
  }

  const existing = await indexTargetRoot(targetRoot)

  for (const dirName of dirNames) {
    const abs = join(sourcePath, dirName)
    let raw
    try {
      raw = await readFile(join(abs, 'SKILL.md'), 'utf8')
    } catch {
      warnings.push(`${dirName}：根目录没有 SKILL.md，已跳过`)
      continue
    }

    let mtimeMs = 0
    try {
      mtimeMs = (await stat(join(abs, 'SKILL.md'))).mtimeMs
    } catch { /* keep 0 */ }

    const { frontmatter, body } = splitFrontmatter(raw)
    const fields = parseFrontmatter(frontmatter)
    const idInfo = resolveSkillId(fields, dirName)
    const description = pickDescription(fields, body)
    const version = typeof fields.version === 'string' ? fields.version : ''
    const generated = buildSkillMd(idInfo.id, description, version, fields.license, body)
    const hash = sha256(generated)
    const listing = await listSkillFiles(abs)
    const icon = await findIcon(abs)
    const problems = [...listing.problems]
    if (description === '') problems.push('缺少 description（DSH 技能目录会显示为空）')

    skills.push({
      id: idInfo.id,
      idFrom: idInfo.from,
      idError: idInfo.error,
      sourceDir: dirName,
      sourcePath: abs,
      description,
      version,
      hash,
      mtimeMs,
      fileCount: listing.count,
      totalBytes: listing.totalBytes,
      files: listing.files,
      problems,
      icon,
      status: 'new',
      installed: false,
      note: '',
      duplicateOf: '',
      lastImportedAt: typeof manifest?.[idInfo.id]?.importedAt === 'string' ? manifest[idInfo.id].importedAt : '',
      generated,
    })
  }

  // One skill id can come from several WorkBuddy folders (skillhub copies the
  // same skill under `<id>__skillhub` and `<id>__user_<hash>__skillhub`). Keep
  // the newest SKILL.md as the import source, flag the rest as duplicates.
  const byId = new Map()
  for (const skill of skills) {
    const current = byId.get(skill.id)
    if (current === undefined) byId.set(skill.id, [skill])
    else current.push(skill)
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue
    group.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.sourceDir < b.sourceDir ? -1 : 1))
    for (const duplicate of group.slice(1)) {
      duplicate.status = 'duplicate'
      duplicate.duplicateOf = id
      duplicate.note = `与 ${group[0].sourceDir} 同 id，仅导入较新的一份`
    }
  }

  // Status against the DSH skills root.
  for (const skill of skills) {
    if (skill.status === 'duplicate') continue
    if (skill.idError !== undefined) { skill.status = 'blocked'; skill.note = skill.idError; continue }
    if (skill.problems.length > 0) {
      const fatal = skill.problems.some((problem) => problem.includes('超过上限') || problem.includes('层级过深'))
      if (fatal) { skill.status = 'blocked'; skill.note = skill.problems.join('；'); continue }
    }
    const target = existing.get(skill.id)
    if (target === undefined) { skill.status = 'new'; continue }
    skill.installed = true
    if (target.symlink) {
      skill.status = 'blocked'
      skill.note = '目标目录是符号链接，可能是别的工具链进来的，请手工处理'
      continue
    }
    if (target.hash !== null && target.hash === skill.hash) { skill.status = 'same'; continue }
    skill.status = 'update'
    skill.note = target.hash === null ? '目标目录已存在但没有 SKILL.md' : '目标内容与 WorkBuddy 源不一致'
  }

  const counts = { total: skills.length, importable: 0, new: 0, update: 0, same: 0, blocked: 0, duplicate: 0, installed: 0 }
  for (const skill of skills) {
    if (skill.installed === true) counts.installed += 1
    if (skill.status === 'new') { counts.new += 1; counts.importable += 1 }
    else if (skill.status === 'update') { counts.update += 1; counts.importable += 1 }
    else if (skill.status === 'same') counts.same += 1
    else if (skill.status === 'blocked') counts.blocked += 1
    else if (skill.status === 'duplicate') counts.duplicate += 1
  }

  skills.sort((a, b) => {
    const rank = { new: 0, update: 1, same: 2, blocked: 3, duplicate: 4 }
    const delta = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (delta !== 0) return delta
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return {
    sourcePath,
    targetRoot,
    pathExists,
    skills,
    warnings,
    counts,
    limits: LIMITS,
    scannedAt: new Date().toISOString(),
  }
}

/** Drop fields the panel does not need (the rebuilt SKILL.md stays server-side). */
export function toPublicState(state) {
  return {
    ...state,
    // `files` / `generated` are host-side only: the per-file listing is large
    // (a 76-file skill alone) and the panel never renders it.
    skills: state.skills.map(({ generated, files, ...rest }) => rest),
  }
}
