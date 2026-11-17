# dsh-workbuddy-skills

WorkBuddy 技能市场：在 DSH 的 **设置 → WorkBuddy 技能市场** 面板里扫描 WorkBuddy 的技能目录，
勾选后把整包技能复制进 DSH 全局技能目录，直接可用。

`MIT` · `dsh >=0.2.0-rc.2 <0.3.0` · 零运行时依赖 · English summary at the [bottom](#english)

## 安装

```bash
# 插件市场（npm）安装
插件管理 → 按包名安装 → dsh-workbuddy-skills

# 本地 / 开发版
plugin_manager install_bundle target=<绝对路径>/dsh-workbuddy-skills
```

装好后重载一次插件（插件管理里禁用 → 启用），`设置` 中即出现 **WorkBuddy 技能市场**。

## 它解决什么

WorkBuddy 的 skill 目录（默认 `~/.workbuddy/skills`）里的包不能直接给 DSH 用：

- 目录名常带 `__skillhub` / `__user_<hash>__skillhub` 后缀，DSH 以目录名为 skill id，导入后 id 与
  frontmatter 的 `name` 不一致，甚至触发 safe-name 校验拒绝；
- 同一个 `name` 可能有多份副本（例如 `kingdee-dev__skillhub` 与 `kingdee-dev__user_03e6265c__skillhub`
  内容完全相同），会被重复注册成两条技能；
- 包里混着 WorkBuddy 专用文件（`_meta.json`、`_skillhub_meta.json`、`_user_meta.json`、
  `skill-card.md`、`上架说明.md`、`使用指南.md`、`开发者声明.md`）；
- frontmatter 里有 DSH 不认识的字段（`slug` / `displayName` / `summary` / `description_zh` /
  `argument-hint` / `intent` / `theme` / `best_for`），有的包只有 `description_zh` 没有 `description`。

本插件在导入时统一处理：

| 处理 | 规则 |
| --- | --- |
| 目标 id | frontmatter `name` → `slug` → 目录名剥后缀；非法字符折成 `-` |
| 去重 | 同 id 多份时取 SKILL.md 修改时间最新的一份，其余标 `duplicate` 不导 |
| frontmatter | 只保留 `name` / `description` / `version` / `license`，正文原样 |
| 描述兜底 | `description` → `description_zh` → `description_en` → `summary` → 正文首段 |
| 文件过滤 | 剔除上表所列 WorkBuddy 专用文件与 `.DS_Store` / `Thumbs.db` / `.git` / `node_modules` |
| 嵌套子技能 | 如 `lark-unified/skills/meegle`，整树复制，不单独注册 |
| 变更判定 | 目标 `SKILL.md` 的 SHA-256 与重建内容一致 → `same`，跳过 |
| 覆盖保护 | 默认跳过已存在技能；勾选「更新已存在」才覆盖，覆盖前备份到 `<目标>/.backup/<id>-<时间戳>/` |
| 安全上限 | 单技能 ≤500 文件、单文件 ≤4 MiB、总计 ≤16 MiB；拒绝 `..` 与绝对路径 |
| 试运行 | 默认只出清单不写盘，确认后取消勾选再导 |
| 图标 | 取包内 `_icon.png` / `icon.png` / `_icon.svg` / `icon.svg` / `_icon.jpg` / `icon.jpg` / `logo.png` 之首，经 `/api/icon` 只读代理渲染；没有图标时按 id 哈希取色的字母块兜底 |
| 删除 | 已导入的技能可在卡片上直接删除，二次确认；默认先备份到 `<目标>/.backup/<id>-removed-<时间戳>/` |

## 用法

1. 设置 → **WorkBuddy 技能市场**
2. 面板顶部「路径设置」可改扫描源目录与导入目标目录：留空即用默认路径，保存后**下次扫描立即生效**（无需重启）。
   下方展示「当前生效」的两个路径与设置文件位置
3. 面板自动扫描，以卡片网格列出技能（参考 WorkBuddy 技能市场的布局）：图标 + 技能名 + 描述 +
   状态徽章 / 版本 / 文件数与体积 / 上次导入时间
4. 用顶部搜索框按 id、源目录名、描述过滤；tab 切换 `全部` / `未安装` / `可更新` / `已安装` / `其他`；
   右上角「已安装 N」胶囊一键只看已装的
5. 面板默认不勾选任何技能。单条安装直接在卡片上点「安装」（可更新状态显示「更新」）；
   批量则勾选（支持全选 / 全不选 / 反选）后点底部「导入选中」
6. 同一技能 id 的多份源目录（如 `kingdee-dev__skillhub` 与 `kingdee-dev__user_xxx__skillhub`）
   默认只展示较新的一份，重复副本不在卡片网格里出现；tabbar 右侧「显示重复副本（N）」可展开查看
7. 需要时勾选「更新已存在」「覆盖前备份」，先点「试运行」看清单（卡片「安装」与「导入选中」共用同一套选项）
8. 结果面板给出 `imported` / `updated` / `skipped` / `failed` 明细
9. 已安装的卡片出现「删除」按钮：点一次变「确认删除 / 取消」，确认后从 DSH 技能目录移除并更新清单

导入后技能在 `~/.dsh/skills/<id>/`，DSH 即时加载，无需重启。
删除与覆盖都会先备份到目标的 `.backup/` 子目录；符号链接形态的技能不会被删除（不追链）。

## 路径设置

两处可改扫描源与导入目标，**优先级：面板设置 > patch config > 内置默认**。

1. **面板设置（推荐，即时生效）**：面板顶部「路径设置」输入源目录 / 目标目录，点「保存」。
   写入 `<dshHome>/storages/workbuddy-skills/settings.json`（`{version, sourcePath, targetPath, updatedAt}`），
   每次请求重读，保存后下一次扫描就用新路径，不用重启也不用重载插件。留空 = 回落到默认，点「恢复默认」即清空两项。
   只接受绝对路径或 `~` 开头的路径，含控制字符或相对路径会被拒绝（HTTP 400）。
2. **patch config（安装时即生效，作为默认值）**：在 `cordis.patch.yml` 的 `config` 段加：

```yaml
- insert:
    - id: dsh-workbuddy-skills
      name: 'dsh-workbuddy-skills'
      config:
        sourcePath: 'C:\Users\me\.workbuddy\skills'   # 扫描源，缺省 ~/.workbuddy/skills
        targetPath: 'C:\Users\me\.dsh\skills'          # 导入目标，缺省 <dshHome>/skills
        dshHome: 'C:\Users\me\.dsh'                    # 缺省 $DSH_HOME 或 ~/.dsh
        overwrite: false                               # 面板里「更新已存在」的默认值
        backup: true                                   # 面板里「覆盖前备份」的默认值
```

改完需重载插件（或在插件管理里禁用→启用）才会作为新默认值生效。

## 实现

- Host：`src/scan.js`（只读扫描 + id 归一 + 状态机 + 图标探测）、`src/importer.js`（复制 / 备份 / 删除 / 清单）、
  `src/settings.js`（面板路径设置的读写与校验，`resolvePaths` 负责「面板 > patch > 默认」三级回落）、
  `src/routes.js`（`GET .../api/state`、`GET .../api/icon`、`POST .../api/import`、`POST .../api/remove`、
  `POST .../api/settings`，变更类路由强制同源校验 + 单飞）、`src/index.js`（staged inject `webServer`）
- Client：`client/client.js`，注册 `settings.section`（order 47），手写无构建，React 经 `require('react')` 取得
- 导入清单：`<dshHome>/storages/workbuddy-skills/manifest.json`
- 路径设置：`<dshHome>/storages/workbuddy-skills/settings.json`
- 离线自测：`node scripts/smoke.mjs`（扫描 / 导入 / 删除，不需要 DSH 运行时）、
  `node scripts/routes-smoke.mjs`（桩 webServer 驱动五条路由，校验同源栅栏、图标白名单与路径设置）

## English

**dsh-workbuddy-skills** brings the WorkBuddy skill market into DeepSeek Harness. Open
`Settings → WorkBuddy Skills`, and every skill in your WorkBuddy folder
(`~/.workbuddy/skills`) is listed as a card. Install one with a click — the whole skill
folder is copied into your DSH skills directory and becomes available immediately, no
restart needed.

WorkBuddy skill folders cannot be used by DSH as-is, and this plugin normalizes them on
import:

- **Ids** — folder names often carry `__skillhub` / `__user_<hash>__skillhub` suffixes.
  DSH uses the folder name as the skill id, so imported skills ended up mismatching their
  frontmatter `name` (and could trip safe-name validation). Ids are now derived from
  frontmatter `name` → `slug` → de-suffixed folder name.
- **Duplicates** — the same `name` may exist as several folders with identical content.
  Only the newest copy is offered; the others are collapsed and hidden by default.
- **Frontmatter** — WorkBuddy-only fields (`slug`, `displayName`, `summary`,
  `description_zh`, `argument-hint`, `intent`, `theme`, `best_for`, …) are dropped and only
  `name`, `description`, `version`, `license` are written back; `description_zh` is promoted
  to `description` when needed.
- **Files** — WorkBuddy metadata (`_meta.json`, `_skillhub_meta.json`, `_user_meta.json`,
  `skill-card.md`, `上架说明.md`, …) is excluded; icons, `README` and nested sub-skill
  folders are kept.
- **Updates** — existing skills are skipped by default; opt into overwrite and the previous
  folder is backed up to `<skills>/.backup/<id>-<timestamp>/` first. Changes are detected by
  the SHA-256 of the rebuilt `SKILL.md`.
- **Delete** — remove an imported skill from its card, with two-step confirmation and the
  same backup rule (symlinked skills are never followed or deleted).
- **Limits** — 500 files, 4 MiB per file, 16 MiB per skill; `..` and absolute paths are
  rejected. All mutating routes are same-origin `POST` only.

Source and target directories are configurable in the panel (`Settings → WorkBuddy Skills →
Paths`) or through patch config; empty values fall back to `~/.workbuddy/skills` and
`<dshHome>/skills`. Panel settings live in
`<dshHome>/storages/workbuddy-skills/settings.json` and apply on the next scan.

Offline tests (no DSH runtime needed): `npm test`, i.e. `node scripts/smoke.mjs` and
`node scripts/routes-smoke.mjs`.

## License

MIT © [panweizong](https://github.com/panweizong)
