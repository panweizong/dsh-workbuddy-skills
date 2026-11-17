/**
 * dsh-workbuddy-skills browser client: the Settings → 「WorkBuddy 技能」
 * panel, laid out like the WorkBuddy store page — a searchable, filterable
 * CARD GRID (icon + name + one-line description + status chip + actions)
 * instead of a table, plus a delete action for skills already copied into
 * the DSH skills root.
 *
 * Hand-written in the harness client-bundle format
 * (`window.__ModuleLoader__.load({ id, factory })`, CJS-style, zero build
 * step) — this file IS the artifact package.json exports as "./client".
 *
 * One seat: `settings.section` (owned by dsh-client-ui-settings). The page
 * pulls GET /api/state once per mount; every mutating action POSTs
 * /api/import or /api/remove and adopts the fresh state those answers carry,
 * so the grid updates without a second round trip. Icons stream from
 * GET /api/icon?dir=<folder>&name=<file>.
 *
 * API_BASE is DOCUMENT-RELATIVE ('dsh-workbuddy-skills/api'): the web shell
 * carries <base href="./">, so an absolute path breaks under a proxy mount.
 */

window.__ModuleLoader__.load({ id: "dsh-workbuddy-skills", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

var React = require('react')
var el = React.createElement

var NS = 'dsh-workbuddy-skills'
var API_BASE = 'dsh-workbuddy-skills/api'

var MONO = 'var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
var BORDER = 'var(--dsw-alias-border-inverted, rgba(127,127,127,.28))'
var BORDER_SOFT = 'var(--dsw-alias-border-inverted, rgba(127,127,127,.16))'
var BRAND = 'var(--dsw-alias-brand-primary, #4f6ef7)'

var CSS = `
.wbs-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 2px; }

.wbs-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px 18px; flex-wrap: wrap; }
.wbs-top h2 { margin: 0 0 3px; font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.wbs-subtitle { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, inherit); }
.wbs-top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.wbs-search { box-sizing: border-box; width: 208px; padding: 6px 10px; font: inherit; font-size: 12px; line-height: 18px;
  border-radius: 8px; border: 1px solid ${BORDER}; background: transparent; color: var(--dsw-alias-label-primary, inherit); }
.wbs-search::placeholder { color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-search:focus { outline: none; border-color: ${BRAND}; }

.wbs-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; font-size: 12px; line-height: 20px;
  border-radius: 8px; cursor: pointer; box-sizing: border-box; white-space: nowrap;
  border: 1px solid ${BORDER}; background: transparent; color: var(--dsw-alias-label-primary, inherit); }
.wbs-btn:hover:not(:disabled) { background: var(--dsw-interactive-bg-hover, rgba(127,127,127,.12)); }
.wbs-btn:disabled { opacity: .5; cursor: default; }
.wbs-btn[data-primary="true"] { border-color: transparent; background: ${BRAND}; color: #fff; }
.wbs-btn[data-primary="true"]:hover:not(:disabled) { filter: brightness(1.06); background: ${BRAND}; }
.wbs-btn[data-danger="true"] { color: var(--dsw-alias-state-error-primary, #d5484f); }
.wbs-btn[data-danger="true"]:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d5484f) 10%, transparent); }
.wbs-btn[data-tiny="true"] { padding: 3px 8px; font-size: 11px; line-height: 16px; border-radius: 7px; }
.wbs-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; font-size: 12px; line-height: 20px;
  border-radius: 999px; cursor: pointer; border: 1px solid ${BORDER}; background: transparent;
  color: var(--dsw-alias-label-secondary, inherit); }
.wbs-chip[data-on="true"] { border-color: ${BRAND}; color: ${BRAND};
  background: color-mix(in srgb, ${BRAND} 9%, transparent); }
.wbs-chip .wbs-num { font-family: ${MONO}; font-size: 11px; font-variant-numeric: tabular-nums; }

.wbs-tabbar { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid ${BORDER_SOFT}; flex-wrap: wrap; }
.wbs-tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 12px; line-height: 18px;
  border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary, inherit); }
.wbs-tab:hover { color: var(--dsw-alias-label-primary, inherit); }
.wbs-tab[data-on="true"] { color: ${BRAND}; border-bottom-color: ${BRAND}; }
.wbs-tab .wbs-num { font-family: ${MONO}; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-tab[data-on="true"] .wbs-num { color: inherit; }
.wbs-tabbar-end { margin-left: auto; display: flex; align-items: center; gap: 6px; }

.wbs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 10px; }
.wbs-card { position: relative; display: flex; flex-direction: column; gap: 7px; padding: 12px; min-width: 0;
  border-radius: 12px; border: 1px solid ${BORDER_SOFT};
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.05)); }
.wbs-card:hover { border-color: color-mix(in srgb, ${BRAND} 45%, transparent); }
.wbs-card[data-picked="true"] { border-color: ${BRAND}; background: color-mix(in srgb, ${BRAND} 7%, transparent); }
.wbs-card[data-status="blocked"] { opacity: .78; }

.wbs-card-head { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
.wbs-tile { flex: none; width: 34px; height: 34px; border-radius: 9px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; line-height: 1; color: #fff;
  background: ${BRAND}; }
.wbs-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wbs-head-text { min-width: 0; flex: 1 1 auto; }
.wbs-name { font-size: 13px; font-weight: 600; line-height: 1.35; word-break: break-all;
  color: var(--dsw-alias-label-primary, inherit); }
.wbs-src { font-family: ${MONO}; font-size: 10px; line-height: 1.5; word-break: break-all;
  color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-card-desc { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary, inherit);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.9em; }

.wbs-card-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: auto; }
.wbs-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; line-height: 16px;
  white-space: nowrap; border: 1px solid currentColor; }
.wbs-badge[data-status="new"] { color: ${BRAND}; }
.wbs-badge[data-status="update"] { color: var(--dsw-alias-state-warn-primary, #c77700); }
.wbs-badge[data-status="same"] { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.wbs-badge[data-status="blocked"] { color: var(--dsw-alias-state-error-primary, #d5484f); }
.wbs-badge[data-status="duplicate"] { color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-meta { font-family: ${MONO}; font-size: 10.5px; line-height: 1.5; white-space: nowrap;
  color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-note { font-size: 10.5px; line-height: 1.5; color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-note[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary, #c77700); }
.wbs-note[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #d5484f); }

.wbs-card-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wbs-pick { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.wbs-pick input { width: 15px; height: 15px; margin: 0; cursor: pointer; accent-color: ${BRAND}; }

.wbs-paths { display: flex; flex-direction: column; gap: 2px; font-size: 11px; line-height: 1.7;
  color: var(--dsw-alias-label-tertiary, inherit); }
.wbs-paths code { font-family: ${MONO}; color: var(--dsw-alias-label-secondary, inherit); word-break: break-all; }

.wbs-settings { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08));
  border: 1px solid var(--dsw-alias-line-weak, rgba(127,127,127,.18)); }
.wbs-settings-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.wbs-settings-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.wbs-field { display: flex; align-items: center; gap: 8px; }
.wbs-field-label { flex: none; width: 56px; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, inherit); }
.wbs-input { flex: 1 1 auto; min-width: 0; padding: 5px 9px; font-family: ${MONO}; font-size: 11.5px;
  color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-line-weak, rgba(127,127,127,.3)); border-radius: 8px; }
.wbs-input:focus { outline: 2px solid color-mix(in srgb, ${BRAND} 45%, transparent); outline-offset: 1px; }
.wbs-settings-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wbs-ok { font-size: 11.5px; color: var(--dsw-alias-state-success-primary, #2ea043); }
.wbs-banner { padding: 9px 12px; font-size: 12px; line-height: 1.6; border-radius: 10px;
  color: var(--dsw-alias-state-warn-primary, #c77700);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #c77700) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #c77700) 42%, transparent); }
.wbs-banner code { font-family: ${MONO}; font-size: 11px; }

.wbs-footbar { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding-top: 2px;
  font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
.wbs-options { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.wbs-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.wbs-check input { margin: 0; cursor: pointer; accent-color: ${BRAND}; }
.wbs-spacer { flex: 1 1 auto; }
.wbs-count { font-family: ${MONO}; font-size: 11px; color: var(--dsw-alias-label-tertiary, inherit); }

.wbs-result { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; font-size: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08)); }
.wbs-result-line { display: flex; gap: 8px; align-items: baseline; font-family: ${MONO}; font-size: 11px; flex-wrap: wrap; }
.wbs-empty { display: flex; flex-direction: column; gap: 6px; padding: 34px 8px; text-align: center;
  font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary, inherit); }
.wbs-error { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-state-error-primary, #d5484f); }
.wbs-spin { display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  border: 1.5px solid currentColor; border-top-color: transparent; animation: wbs-spin .9s linear infinite; }
@keyframes wbs-spin { to { transform: rotate(360deg); } }
`

function ensureStyle () {
  if (typeof document === 'undefined' || document === null) return null
  var tagId = NS + '/panel.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return null
  var tag = document.createElement('style')
  tag.dataset.plugin = NS
  tag.dataset.pluginCss = tagId
  tag.textContent = CSS
  document.head.appendChild(tag)
  return tag
}

function removeStyle (tag) {
  if (tag !== null && tag !== undefined && tag.parentNode !== null) tag.parentNode.removeChild(tag)
}

var DICTS = {
  zh: {
    nav: 'WorkBuddy 技能',
    title: 'WorkBuddy 技能市场',
    subtitle: '扫描 WorkBuddy 技能目录，一键复制到 DSH 全局技能目录（目录名取技能自身的 name，重复副本自动只留较新一份）。',
    search: '搜索技能名或描述',
    rescan: '重新扫描',
    installedChip: '已安装 {n}',
    selectAll: '全选',
    selectNone: '全不选',
    invert: '反选',
    selected: '已选 {n}',
    showDuplicates: '显示重复副本（{n}）',
    tabAll: '全部',
    tabNew: '未安装',
    tabUpdate: '可更新',
    tabSame: '已安装',
    tabOther: '其他',
    statusNew: '未安装',
    statusUpdate: '可更新',
    statusSame: '已安装',
    statusBlocked: '不可导入',
    statusDuplicate: '重复副本',
    optOverwrite: '覆盖已存在的技能',
    optBackup: '删除/覆盖前备份到 .backup/',
    optDryRun: '试运行（只出清单，不写盘）',
    importBtn: '导入选中',
    installBtn: '安装',
    updateBtn: '更新',
    installing: '安装中…',
    updating: '更新中…',
    removeBtn: '删除',
    removeConfirm: '确认删除',
    cancel: '取消',
    importing: '处理中…',
    noSelection: '先勾选要操作的技能',
    loadFailed: '加载失败',
    actionFailedMsg: '操作失败',
    empty: '没有匹配的技能',
    emptyTip: '换个关键词，或切回「全部」。',
    emptySource: '源目录里没有找到技能（需要 SKILL.md 在技能目录根下）',
    emptySourceTip: '若路径不对，可在插件配置里改 sourcePath。',
    pathMissing: '源目录不存在或不可读',
    pathMissingHint: '先在 WorkBuddy 里安装技能，或修改插件配置的 sourcePath。',
    sourcePath: '源目录',
    targetPath: '目标目录',
    settingsTitle: '路径设置',
    settingsHint: '留空即用默认路径；保存后下次扫描立即生效，无需重启。',
    saveSettings: '保存',
    saving: '保存中…',
    resetSettings: '恢复默认',
    settingsSaved: '已保存',
    settingsEffective: '当前生效',
    settingsFile: '设置文件',
    warningsToggle: '扫描提示 {n} 条',
    resultImport: '导入结果',
    resultRemove: '删除结果',
    actionImported: '已导入',
    actionUpdated: '已更新',
    actionRemoved: '已删除',
    actionSkipped: '已跳过',
    actionFailed: '失败',
    actionWould: '将会导入',
    actionWouldRemove: '将会删除',
    filesCount: '{n} 个文件',
    noDescription: '（无描述）',
    summaryImport: '新增 {imported} · 更新 {updated} · 跳过 {skipped} · 失败 {failed} · 计划 {planned}',
    summaryRemove: '删除 {removed} · 跳过 {skipped} · 失败 {failed} · 计划 {planned}',
    lastImported: '导入于 {at}',
    dryRunTag: '试运行',
  },
  en: {
    nav: 'WorkBuddy Skills',
    title: 'WorkBuddy skill market',
    subtitle: 'Scan the WorkBuddy skills folder and copy skills into the DSH global skills folder (the DSH id comes from the skill name; duplicate copies collapse to the newest one).',
    search: 'Search name or description',
    rescan: 'Rescan',
    installedChip: '{n} installed',
    selectAll: 'Select all',
    selectNone: 'Select none',
    invert: 'Invert',
    selected: '{n} selected',
    showDuplicates: 'Show duplicates ({n})',
    tabAll: 'All',
    tabNew: 'Not installed',
    tabUpdate: 'Updatable',
    tabSame: 'Installed',
    tabOther: 'Other',
    statusNew: 'Not installed',
    statusUpdate: 'Updatable',
    statusSame: 'Installed',
    statusBlocked: 'Blocked',
    statusDuplicate: 'Duplicate',
    optOverwrite: 'Overwrite existing skills',
    optBackup: 'Back up to .backup/ before overwrite or delete',
    optDryRun: 'Dry run (report only)',
    importBtn: 'Import selected',
    installBtn: 'Install',
    updateBtn: 'Update',
    installing: 'Installing…',
    updating: 'Updating…',
    removeBtn: 'Delete',
    removeConfirm: 'Confirm delete',
    cancel: 'Cancel',
    importing: 'Working…',
    noSelection: 'Pick at least one skill first',
    loadFailed: 'Failed to load',
    actionFailedMsg: 'Action failed',
    empty: 'No skill matches',
    emptyTip: 'Try another keyword, or switch back to All.',
    emptySource: 'No skills found (a skill needs SKILL.md at its folder root)',
    emptySourceTip: 'If the path is wrong, change sourcePath in the plugin config.',
    pathMissing: 'Source folder is missing or unreadable',
    pathMissingHint: 'Install skills in WorkBuddy first, or point sourcePath somewhere else.',
    sourcePath: 'Source',
    targetPath: 'Target',
    settingsTitle: 'Paths',
    settingsHint: 'Leave a field empty to use the default. A save applies to the next scan — no restart.',
    saveSettings: 'Save',
    saving: 'Saving…',
    resetSettings: 'Reset',
    settingsSaved: 'Saved',
    settingsEffective: 'In effect',
    settingsFile: 'Settings file',
    warningsToggle: '{n} scan warnings',
    resultImport: 'Import result',
    resultRemove: 'Delete result',
    actionImported: 'imported',
    actionUpdated: 'updated',
    actionRemoved: 'deleted',
    actionSkipped: 'skipped',
    actionFailed: 'failed',
    actionWould: 'would import',
    actionWouldRemove: 'would delete',
    filesCount: '{n} files',
    noDescription: '(no description)',
    summaryImport: 'new {imported} · updated {updated} · skipped {skipped} · failed {failed} · planned {planned}',
    summaryRemove: 'deleted {removed} · skipped {skipped} · failed {failed} · planned {planned}',
    lastImported: 'imported {at}',
    dryRunTag: 'dry run',
  },
}

function interpolate (text, params) {
  if (params === undefined || params === null) return text
  return String(text).replace(/\{(\w+)\}/g, function (whole, key) {
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : whole
  })
}

function fallbackT (key, params) {
  var dict = DICTS.zh
  return interpolate(dict[key] !== undefined ? dict[key] : key, params)
}

async function request (path, init) {
  var response = await fetch(API_BASE + path, init)
  var text = await response.text()
  var data = null
  try { data = text === '' ? null : JSON.parse(text) } catch (error) { data = null }
  if (!response.ok) {
    var failure = new Error((data && data.error) || ('HTTP ' + response.status))
    failure.status = response.status
    throw failure
  }
  return data
}

function api (path) {
  return request(path, { credentials: 'same-origin', headers: { accept: 'application/json' } })
}

function postJson (path, body) {
  return request(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body || {}),
  })
}

function errorText (error) {
  if (error === null || error === undefined) return ''
  return String(error.message || error)
}

function formatBytes (bytes) {
  var size = Number(bytes) || 0
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KiB'
  return (size / 1024 / 1024).toFixed(1) + ' MiB'
}

var STATUS_KEY = {
  new: 'statusNew',
  update: 'statusUpdate',
  same: 'statusSame',
  blocked: 'statusBlocked',
  duplicate: 'statusDuplicate',
}

/** Skills that an import would act on. */
function pickable (skill) {
  return skill.status === 'new' || skill.status === 'update'
}

/** Skill folders that lost the same-id race: identical id, older copy. */
function isDuplicate (skill) {
  return typeof skill.duplicateOf === 'string' && skill.duplicateOf !== ''
}

/** Skills that physically exist in the DSH skills root (deletable). */
function removable (skill) {
  return skill.installed === true && skill.status !== 'duplicate'
}

var TAB_FILTERS = {
  all: function () { return true },
  new: function (skill) { return skill.status === 'new' },
  update: function (skill) { return skill.status === 'update' },
  same: function (skill) { return skill.status === 'same' },
  other: function (skill) { return skill.status === 'blocked' || skill.status === 'duplicate' },
}

/** Stable hue per skill id, so letter tiles differ across the grid. */
function tileHue (text) {
  var hash = 0
  var source = String(text || '')
  for (var i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) % 360
  return hash
}

function SkillTile (props) {
  var skill = props.skill
  var brokenHook = React.useState(false)
  var broken = brokenHook[0]
  var setBroken = brokenHook[1]

  var letter = String(skill.id || '?').replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').slice(0, 1).toUpperCase() || '?'
  var hue = tileHue(skill.id)
  var letterStyle = { background: 'hsl(' + hue + ' 62% 52%)' }

  if (typeof skill.icon === 'string' && skill.icon !== '' && broken === false) {
    var src = API_BASE + '/icon?dir=' + encodeURIComponent(skill.sourceDir) + '&name=' + encodeURIComponent(skill.icon)
    return el('div', { className: 'wbs-tile' },
      el('img', { src: src, alt: '', loading: 'lazy', onError: function () { setBroken(true) } }))
  }
  return el('div', { className: 'wbs-tile', style: letterStyle }, letter)
}

function SkillCard (props) {
  var t = props.t
  var skill = props.skill
  var isPicked = props.picked === true
  var confirming = props.confirming === true
  var busy = props.busy === true
  var problems = Array.isArray(skill.problems) ? skill.problems : []
  var statusKey = STATUS_KEY[skill.status] || 'statusNew'

  var foot = [el('span', { className: 'wbs-badge', 'data-status': skill.status, key: 'badge' }, t(statusKey))]
  if (skill.version) foot.push(el('span', { className: 'wbs-meta', key: 'version' }, 'v' + skill.version))
  foot.push(el('span', { className: 'wbs-meta', key: 'files' },
    skill.fileCount + ' · ' + formatBytes(skill.totalBytes)))
  if (skill.lastImportedAt) {
    foot.push(el('span', { className: 'wbs-meta', key: 'at' },
      t('lastImported', { at: String(skill.lastImportedAt).replace('T', ' ').slice(0, 16) })))
  }

  var actions = []
  if (pickable(skill)) {
    var installing = props.installing === true
    actions.push(el('button', {
      type: 'button',
      className: 'wbs-btn',
      'data-tiny': 'true',
      'data-primary': 'true',
      key: 'import',
      disabled: busy,
      onClick: props.onInstall,
    }, installing
      ? (skill.status === 'update' ? t('updating') : t('installing'))
      : (skill.status === 'update' ? t('updateBtn') : t('installBtn'))))
  }
  if (removable(skill)) {
    actions.push(el('button', {
      type: 'button',
      className: 'wbs-btn',
      'data-tiny': 'true',
      'data-danger': 'true',
      key: 'remove',
      disabled: busy,
      onClick: confirming ? props.onRemove : props.onAskRemove,
    }, confirming ? t('removeConfirm') : t('removeBtn')))
    if (confirming) {
      actions.push(el('button', {
        type: 'button',
        className: 'wbs-btn',
        'data-tiny': 'true',
        key: 'cancel',
        onClick: props.onCancelRemove,
      }, t('cancel')))
    }
  }

  return el('div', {
    className: 'wbs-card',
    'data-status': skill.status,
    'data-picked': isPicked ? 'true' : 'false',
  },
  el('div', { className: 'wbs-card-head' },
    el(SkillTile, { skill: skill }),
    el('div', { className: 'wbs-head-text' },
      el('div', { className: 'wbs-name' }, skill.id),
      el('div', { className: 'wbs-src' }, skill.sourceDir)),
    pickable(skill)
      ? el('label', { className: 'wbs-pick', title: t('selected', { n: '' }).trim() },
        el('input', {
          type: 'checkbox',
          checked: isPicked,
          onChange: props.onTogglePick,
          'aria-label': skill.id,
        }))
      : null),
  el('p', { className: 'wbs-card-desc' }, skill.description || t('noDescription')),
  problems.length > 0
    ? el('div', { className: 'wbs-note', 'data-tone': 'warn' }, problems.join('；'))
    : null,
  skill.note !== '' && skill.note !== undefined
    ? el('div', { className: 'wbs-note', 'data-tone': skill.status === 'blocked' ? 'error' : (skill.status === 'update' ? 'warn' : '') }, skill.note)
    : null,
  el('div', { className: 'wbs-card-foot' }, foot),
  actions.length > 0 ? el('div', { className: 'wbs-card-actions' }, actions) : null)
}

function SkillsPage (props) {
  var t = props.t || fallbackT

  var stateHook = React.useState(null)
  var data = stateHook[0]
  var setData = stateHook[1]

  var loadingHook = React.useState(true)
  var loading = loadingHook[0]
  var setLoading = loadingHook[1]

  var busyHook = React.useState(false)
  var busy = busyHook[0]
  var setBusy = busyHook[1]

  var errorHook = React.useState('')
  var error = errorHook[0]
  var setError = errorHook[1]

  var resultHook = React.useState(null)
  var result = resultHook[0]
  var setResult = resultHook[1]

  var selectedHook = React.useState({})
  var selected = selectedHook[0]
  var setSelected = selectedHook[1]

  var optionsHook = React.useState({ overwrite: false, backup: true, dryRun: false })
  var options = optionsHook[0]
  var setOptions = optionsHook[1]

  var tabHook = React.useState('all')
  var tab = tabHook[0]
  var setTab = tabHook[1]

  var queryHook = React.useState('')
  var query = queryHook[0]
  var setQuery = queryHook[1]

  var onlyInstalledHook = React.useState(false)
  var onlyInstalled = onlyInstalledHook[0]
  var setOnlyInstalled = onlyInstalledHook[1]

  // 同 id 的重复副本默认不展示（面板上只保留一份），勾选此项才列出。
  var duplicatesHook = React.useState(false)
  var showDuplicates = duplicatesHook[0]
  var setShowDuplicates = duplicatesHook[1]

  var confirmHook = React.useState('')
  var confirmingId = confirmHook[0]
  var setConfirmingId = confirmHook[1]

  var installingHook = React.useState('')
  var installingId = installingHook[0]
  var setInstallingId = installingHook[1]

  var warningsHook = React.useState(false)
  var showWarnings = warningsHook[0]
  var setShowWarnings = warningsHook[1]

  // 路径设置：面板值优先于插件 patch 配置，保存在 settings.json 里，下次扫描即生效。
  var draftHook = React.useState({ sourcePath: '', targetPath: '' })
  var draft = draftHook[0]
  var setDraft = draftHook[1]

  var savingHook = React.useState(false)
  var savingSettings = savingHook[0]
  var setSavingSettings = savingHook[1]

  var noticeHook = React.useState('')
  var notice = noticeHook[0]
  var setNotice = noticeHook[1]

  function adoptState (next) {
    setData(next)
    // 默认不勾选任何技能：勾选完全由用户手动产生（卡片上的「安装」按钮可单条直装）。
    setSelected({})
    setConfirmingId('')
    var settings = (next && next.settings) || {}
    setDraft({
      sourcePath: settings.customSource || '',
      targetPath: settings.customTarget || '',
    })
  }

  var refresh = React.useCallback(function () {
    setLoading(true)
    setError('')
    api('/state').then(function (next) {
      adoptState(next)
      var defaults = (next && next.defaults) || {}
      setOptions({
        overwrite: defaults.overwrite === true,
        backup: defaults.backup !== false,
        dryRun: false,
      })
    }).catch(function (failure) {
      setError(errorText(failure))
    }).then(function () {
      setLoading(false)
    })
  }, [])

  React.useEffect(function () { refresh() }, [refresh])

  function toggleOption (key) {
    setOptions(function (previous) {
      var next = {}
      for (var name in previous) next[name] = previous[name]
      next[key] = !previous[key]
      return next
    })
  }

  function toggleSkill (id) {
    setSelected(function (previous) {
      var next = {}
      for (var name in previous) next[name] = previous[name]
      if (previous[id] === true) delete next[id]
      else next[id] = true
      return next
    })
    setConfirmingId('')
  }

  function bulk (mode) {
    var next = {}
    var skills = (data && data.skills) || []
    for (var i = 0; i < skills.length; i += 1) {
      var skill = skills[i]
      if (!pickable(skill)) continue
      if (mode === 'all') next[skill.id] = true
      else if (mode === 'invert' && selected[skill.id] !== true) next[skill.id] = true
    }
    setSelected(next)
  }

  function selectedIds () {
    var names = []
    for (var id in selected) if (selected[id] === true) names.push(id)
    return names
  }

  function runImport () {
    var names = selectedIds()
    if (names.length === 0) {
      setError(t('noSelection'))
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    postJson('/import', {
      names: names,
      overwrite: options.overwrite === true,
      backup: options.backup !== false,
      dryRun: options.dryRun === true,
    }).then(function (outcome) {
      setResult(outcome === null ? null : Object.assign({}, outcome, { kind: 'import' }))
      if (outcome && outcome.state) adoptState(outcome.state)
      else refresh()
    }).catch(function (failure) {
      setError(errorText(failure))
    }).then(function () {
      setBusy(false)
    })
  }

  /** 卡片页一键安装：不依赖勾选状态，直接对该技能发起导入。 */
  function installOne (id) {
    setBusy(true)
    setInstallingId(id)
    setError('')
    setResult(null)
    postJson('/import', {
      names: [id],
      overwrite: options.overwrite === true,
      backup: options.backup !== false,
      dryRun: options.dryRun === true,
    }).then(function (outcome) {
      setResult(outcome === null ? null : Object.assign({}, outcome, { kind: 'import' }))
      if (outcome && outcome.state) adoptState(outcome.state)
      else refresh()
    }).catch(function (failure) {
      setError(t('actionFailedMsg') + '：' + errorText(failure))
    }).then(function () {
      setInstallingId('')
      setBusy(false)
    })
  }

  function runRemove (id) {
    setBusy(true)
    setError('')
    setResult(null)
    postJson('/remove', {
      names: [id],
      backup: options.backup !== false,
      dryRun: options.dryRun === true,
    }).then(function (outcome) {
      setResult(outcome === null ? null : Object.assign({}, outcome, { kind: 'remove' }))
      setConfirmingId('')
      if (outcome && outcome.state) adoptState(outcome.state)
      else refresh()
    }).catch(function (failure) {
      setError(t('actionFailedMsg') + '：' + errorText(failure))
    }).then(function () {
      setBusy(false)
    })
  }

  /** 保存路径设置（空字符串＝回落到默认路径）。 */
  function saveSettings (nextSource, nextTarget) {
    setSavingSettings(true)
    setError('')
    setNotice('')
    postJson('/settings', {
      sourcePath: nextSource === undefined ? draft.sourcePath : nextSource,
      targetPath: nextTarget === undefined ? draft.targetPath : nextTarget,
    }).then(function (outcome) {
      if (outcome && outcome.state) adoptState(outcome.state)
      else refresh()
      setNotice(t('settingsSaved'))
    }).catch(function (failure) {
      setError(t('actionFailedMsg') + '：' + errorText(failure))
    }).then(function () {
      setSavingSettings(false)
    })
  }

  if (loading && data === null) {
    return el('div', { className: 'wbs-page' },
      el('div', { className: 'wbs-top' }, el('div', null,
        el('h2', null, t('title')),
        el('p', { className: 'wbs-subtitle' }, t('subtitle')))),
      el('div', { className: 'wbs-empty' }, el('span', { className: 'wbs-spin' }), ' ', t('rescan')))
  }

  if (error !== '' && data === null) {
    return el('div', { className: 'wbs-page' },
      el('div', { className: 'wbs-error' }, t('loadFailed') + '：' + error),
      el('div', { className: 'wbs-footbar' },
        el('button', { type: 'button', className: 'wbs-btn', onClick: refresh }, t('rescan'))))
  }

  var counts = (data && data.counts) || { total: 0, new: 0, update: 0, same: 0, blocked: 0, duplicate: 0, installed: 0 }
  var skills = (data && data.skills) || []
  var chosen = selectedIds()
  var warnings = (data && data.warnings) || []

  var needle = query.trim().toLowerCase()
  // 重复副本默认从界面隐藏，避免同一个技能出现两张卡。
  var hiddenDuplicates = showDuplicates ? 0 : (counts.duplicate || 0)
  var visible = skills.filter(function (skill) {
    if (!showDuplicates && isDuplicate(skill)) return false
    if (onlyInstalled && skill.installed !== true) return false
    if (TAB_FILTERS[tab] !== undefined && !TAB_FILTERS[tab](skill)) return false
    if (needle === '') return true
    var haystack = [skill.id, skill.sourceDir, skill.description, skill.version].join(' ').toLowerCase()
    return haystack.indexOf(needle) !== -1
  })

  var children = []

  children.push(el('div', { className: 'wbs-top', key: 'top' },
    el('div', null,
      el('h2', null, t('title')),
      el('p', { className: 'wbs-subtitle' }, t('subtitle'))),
    el('div', { className: 'wbs-top-actions' },
      el('input', {
        className: 'wbs-search',
        type: 'search',
        value: query,
        placeholder: t('search'),
        onChange: function (event) { setQuery(event.target.value) },
      }),
      el('button', {
        type: 'button',
        className: 'wbs-chip',
        'data-on': onlyInstalled ? 'true' : 'false',
        onClick: function () { setOnlyInstalled(!onlyInstalled) },
      }, t('installedChip', { n: counts.installed || 0 })),
      el('button', {
        type: 'button',
        className: 'wbs-btn',
        onClick: refresh,
        disabled: loading || busy,
      }, loading || busy ? el('span', { className: 'wbs-spin' }) : null, t('rescan')))))

  if (data !== null && data.pathExists === false) {
    children.push(el('div', { className: 'wbs-banner', key: 'banner' },
      el('div', null, t('pathMissing'), '：', el('code', null, data.sourcePath)),
      el('div', null, t('pathMissingHint'))))
  }

  if (data !== null) {
    var settings = data.settings || {}
    children.push(el('div', { className: 'wbs-settings', key: 'settings' },
      el('div', { className: 'wbs-settings-head' },
        el('span', { className: 'wbs-settings-title' }, t('settingsTitle')),
        el('span', { className: 'wbs-note' }, t('settingsHint'))),
      el('div', { className: 'wbs-field' },
        el('label', { className: 'wbs-field-label' }, t('sourcePath')),
        el('input', {
          className: 'wbs-input',
          type: 'text',
          value: draft.sourcePath,
          placeholder: settings.sourceDefault || '',
          spellCheck: false,
          onChange: function (event) { setDraft({ sourcePath: event.target.value, targetPath: draft.targetPath }) },
        })),
      el('div', { className: 'wbs-field' },
        el('label', { className: 'wbs-field-label' }, t('targetPath')),
        el('input', {
          className: 'wbs-input',
          type: 'text',
          value: draft.targetPath,
          placeholder: settings.targetDefault || '',
          spellCheck: false,
          onChange: function (event) { setDraft({ sourcePath: draft.sourcePath, targetPath: event.target.value }) },
        })),
      el('div', { className: 'wbs-settings-actions' },
        el('button', {
          type: 'button',
          className: 'wbs-btn',
          'data-primary': 'true',
          disabled: savingSettings || busy,
          onClick: function () { saveSettings() },
        }, savingSettings ? el('span', { className: 'wbs-spin' }) : null, savingSettings ? t('saving') : t('saveSettings')),
        el('button', {
          type: 'button',
          className: 'wbs-btn',
          disabled: savingSettings || busy,
          onClick: function () { saveSettings('', '') },
        }, t('resetSettings')),
        notice !== '' ? el('span', { className: 'wbs-ok' }, notice) : null),
      el('div', { className: 'wbs-note' },
        t('settingsEffective') + '：',
        el('code', null, data.sourcePath || ''),
        ' → ',
        el('code', null, data.targetRoot || '')),
      settings.file !== undefined && settings.file !== ''
        ? el('div', { className: 'wbs-note' }, t('settingsFile') + '：', el('code', null, settings.file))
        : null))
  }

  children.push(el('div', { className: 'wbs-tabbar', key: 'tabs' },
    [['all', t('tabAll'), (counts.total || 0) - hiddenDuplicates], ['new', t('tabNew'), counts.new],
      ['update', t('tabUpdate'), counts.update], ['same', t('tabSame'), counts.same],
      ['other', t('tabOther'), (counts.blocked || 0) + (showDuplicates ? (counts.duplicate || 0) : 0)]].map(function (entry) {
      return el('button', {
        type: 'button',
        className: 'wbs-tab',
        key: entry[0],
        'data-on': tab === entry[0] ? 'true' : 'false',
        onClick: function () { setTab(entry[0]) },
      }, entry[1], el('span', { className: 'wbs-num' }, String(entry[2])))
    }),
    el('div', { className: 'wbs-tabbar-end' },
      el('label', { className: 'wbs-check', key: 'dup' },
        el('input', {
          type: 'checkbox',
          checked: showDuplicates === true,
          onChange: function () { setShowDuplicates(!showDuplicates) },
        }),
        el('span', null, t('showDuplicates', { n: counts.duplicate || 0 }))),
      el('button', { type: 'button', className: 'wbs-btn', 'data-tiny': 'true', onClick: function () { bulk('all') } }, t('selectAll')),
      el('button', { type: 'button', className: 'wbs-btn', 'data-tiny': 'true', onClick: function () { bulk('none') } }, t('selectNone')),
      el('button', { type: 'button', className: 'wbs-btn', 'data-tiny': 'true', onClick: function () { bulk('invert') } }, t('invert')))))

  if (skills.length === 0) {
    children.push(el('div', { className: 'wbs-empty', key: 'empty' },
      el('div', null, t('emptySource')),
      el('div', null, t('emptySourceTip'))))
  } else if (visible.length === 0) {
    children.push(el('div', { className: 'wbs-empty', key: 'empty' },
      el('div', null, t('empty')),
      el('div', null, t('emptyTip'))))
  } else {
    children.push(el('div', { className: 'wbs-grid', key: 'grid' },
      visible.map(function (skill) {
        return el(SkillCard, {
          key: skill.id,
          t: t,
          skill: skill,
          picked: selected[skill.id] === true,
          confirming: confirmingId === skill.id,
          installing: installingId === skill.id,
          busy: busy,
          onTogglePick: function () { toggleSkill(skill.id) },
          onInstall: function () { installOne(skill.id) },
          onAskRemove: function () { setConfirmingId(skill.id) },
          onCancelRemove: function () { setConfirmingId('') },
          onRemove: function () { runRemove(skill.id) },
        })
      })))
  }

  children.push(el('div', { className: 'wbs-footbar', key: 'foot' },
    el('div', { className: 'wbs-options' },
      el('label', { className: 'wbs-check' },
        el('input', { type: 'checkbox', checked: options.overwrite === true, onChange: function () { toggleOption('overwrite') } }),
        t('optOverwrite')),
      el('label', { className: 'wbs-check' },
        el('input', { type: 'checkbox', checked: options.backup !== false, onChange: function () { toggleOption('backup') } }),
        t('optBackup')),
      el('label', { className: 'wbs-check' },
        el('input', { type: 'checkbox', checked: options.dryRun === true, onChange: function () { toggleOption('dryRun') } }),
        t('optDryRun'))),
    el('span', { className: 'wbs-spacer' }),
    el('span', { className: 'wbs-count' }, t('selected', { n: chosen.length })),
    el('button', {
      type: 'button',
      className: 'wbs-btn',
      'data-primary': 'true',
      disabled: busy || chosen.length === 0,
      onClick: runImport,
    }, busy ? el('span', { className: 'wbs-spin' }) : null, busy ? t('importing') : t('importBtn'))))

  if (error !== '') children.push(el('div', { className: 'wbs-error', key: 'error' }, error))

  if (result !== null) {
    var summary = result.summary || {}
    var isRemove = result.kind === 'remove'
    var lines = (result.results || []).filter(function (entry) {
      return entry.action !== 'skipped' || (entry.reason && entry.reason !== '已是最新（内容一致）')
    }).map(function (entry) {
      var actionKey = entry.action === 'imported' ? 'actionImported'
        : entry.action === 'updated' ? 'actionUpdated'
          : entry.action === 'removed' ? 'actionRemoved'
            : entry.action === 'failed' ? 'actionFailed'
              : entry.action === 'skipped' ? 'actionSkipped'
                : entry.action === 'would-remove' ? 'actionWouldRemove'
                  : 'actionWould'
      return el('div', { className: 'wbs-result-line', key: entry.id },
        el('span', null, t(actionKey)),
        el('span', null, entry.id),
        entry.reason ? el('span', { className: 'wbs-note' }, entry.reason) : null)
    })
    children.push(el('div', { className: 'wbs-result', key: 'result' },
      el('div', null, isRemove ? t('resultRemove') : t('resultImport'),
        result.dryRun === true ? '（' + t('dryRunTag') + '）' : ''),
      el('div', { className: 'wbs-meta' }, isRemove
        ? t('summaryRemove', {
          removed: summary.removed || 0,
          skipped: summary.skipped || 0,
          failed: summary.failed || 0,
          planned: summary.planned || 0,
        })
        : t('summaryImport', {
          imported: summary.imported || 0,
          updated: summary.updated || 0,
          skipped: summary.skipped || 0,
          failed: summary.failed || 0,
          planned: summary.planned || 0,
        })),
      lines))
  }

  if (warnings.length > 0) {
    children.push(el('div', { key: 'warnings' },
      el('button', {
        type: 'button',
        className: 'wbs-btn',
        'data-tiny': 'true',
        onClick: function () { setShowWarnings(!showWarnings) },
      }, t('warningsToggle', { n: warnings.length })),
      showWarnings
        ? el('div', { className: 'wbs-paths', style: { marginTop: '6px' } },
          warnings.map(function (warning, index) { return el('div', { key: 'w' + index }, warning) }))
        : null))
  }

  return el('div', { className: 'wbs-page' }, children)
}

function apply (ctx) {
  var t = fallbackT
  var locale = ctx.locale
  if (locale && typeof locale.register === 'function' && typeof locale.bind === 'function') {
    try {
      locale.register(NS, DICTS)
      var bound = locale.bind(NS)
      if (typeof bound === 'function') {
        t = function (key, params) {
          var text = bound(key, params)
          return typeof text === 'string' ? text : fallbackT(key, params)
        }
      }
    } catch (error) {
      t = fallbackT
    }
  }

  var slots = ctx.slots
  if (slots === undefined || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    if (ctx.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('dsh-workbuddy-skills: slots service unavailable; the settings panel was not registered')
    }
    return
  }

  var disposers = []
  function collect (disposer) {
    if (typeof disposer === 'function') disposers.push(disposer)
  }

  collect(slots.inject('settings.section', function () {
    return slots.register({
      name: 'settings.section',
      id: 'workbuddy-skills',
      order: 47,
      label: function () { return t('nav') },
      locale: NS,
      inject: function () { return { t: t } },
    }, function () {
      return el(SkillsPage, { t: t })
    })
  }))

  var styleTag = ensureStyle()
  collect(function () { removeStyle(styleTag) })

  return function () {
    for (var i = 0; i < disposers.length; i += 1) disposers[i]()
  }
}

module.exports = { name: NS, inject: ['slots', 'locale'], apply: apply }
module.exports.DICTS = DICTS
module.exports.CSS = CSS
module.exports.ensureStyle = ensureStyle
module.exports.removeStyle = removeStyle
module.exports.SkillsPage = SkillsPage
module.exports.SkillCard = SkillCard
module.exports.formatBytes = formatBytes
module.exports.fallbackT = fallbackT
return module.exports;
} });
