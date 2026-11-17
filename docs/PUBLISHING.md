# 发布到 DSH 插件市场

目标：`dsh-workbuddy-skills` 出现在 Awesome DSH Plugin 目录（插件市场索引
`https://fastly.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，桌面端「插件市场」读的就是它），
用户在插件管理里按包名就能装。

整个链路只有两件事：**npm 上有一个可用的包**，**目录仓里有你这个包的条目**。

---

## 0. 发布前自检（每次都做）

```powershell
cd D:\WorkBuddy\日常问答\dsh-workbuddy-skills

npm test                       # smoke + routes-smoke 必须全绿
npm pack --dry-run             # 看打出来的文件清单：不能缺 src/client/locale/icon.svg/cordis.patch.yml，不能多带 docs/ 与 scripts/
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));JSON.parse(require('fs').readFileSync('docs/market-listing.json','utf8'));console.log('json ok')"
```

清单里必须包含：`package.json`、`src/**`、`client/client.js`、`cordis.patch.yml`、
`locale/*.json`、`icon.svg`、`README.md`、`CHANGELOG.md`、`LICENSE`。
（`files` 字段已枚举，`docs/`、`scripts/` 不会进包 —— 这是有意的：测试脚本不该塞给用户。）

真机装一次再发：

```powershell
plugin_manager install_bundle target=D:\WorkBuddy\日常问答\dsh-workbuddy-skills
# 重载：插件管理里对本插件 禁用 → 启用（application 必须是 applied）
# 面板：设置 → WorkBuddy 技能市场，扫描 / 装一个 / 删一个，三件事都过一遍
```

---

## 1. 推 GitHub

```powershell
cd D:\WorkBuddy\日常问答\dsh-workbuddy-skills
git init -b main
git add -A
git commit -m "feat: dsh-workbuddy-skills 0.1.0"
git remote add origin https://github.com/panweizong/dsh-workbuddy-skills.git
git push -u origin main
```

仓库需要有的东西（都已在包内）：`README.md`（中英）、`LICENSE`（MIT）、`CHANGELOG.md`、`.gitignore`。
可选加分项：一段 30 秒的面板操作 GIF 放 `docs/`，README 顶部引用它 —— 市场页转化率主要靠这个。

## 2. 发 npm

```powershell
npm login                      # 确认账号是 panweizong
npm whoami
npm publish                    # publishConfig.access=public 已设好
```

发完核对（不装也能看到元数据）：

```powershell
npm view dsh-workbuddy-skills version dist.tarball
npm view dsh-workbuddy-skills dsh
```

`npm view ... dsh` 应原样回显 `bundle.patch` 与 `client.inject` —— 市场与插件管理器均依赖这段。
以后每次发版：改 `package.json` 的 `version` → 补 `CHANGELOG.md` → 再 `npm publish`。

## 3. 提交市场条目

目录仓库是 `awesome-dsh-plugin` 的索引（`dsh-plugin-catalog` npm 包的 `index.json`）。
把 `docs/market-listing.json` 的内容按该仓库的提交规范放进去（通常是：

1. fork / clone 目录仓库，找到条目集合文件（`index.json` 或 `plugins/*.json`）；
2. 追加下面这条，`category` 用 `skill`；
3. 开 PR，标题形如 `add: dsh-workbuddy-skills`。

```json
{
  "name": "dsh-workbuddy-skills",
  "title": "panweizong/dsh-workbuddy-skills",
  "description": {
    "en": "WorkBuddy skill market for DSH: scan a WorkBuddy skills folder, normalize and dedupe skill ids, then install whole skill folders into your DSH skills directory from a Settings panel — one click per card, backup-before-overwrite, and a delete action.",
    "zh": "WorkBuddy 技能市场：扫描 WorkBuddy 技能目录，规范化 id、折叠重复副本后复制进 DSH 技能目录。卡片式面板一键安装/更新/删除，覆盖前自动备份，源目录与目标目录可在面板里改。"
  },
  "homepage": "https://awesome-dsh-plugin.com/p/panweizong/dsh-workbuddy-skills/",
  "repository": { "url": "https://github.com/panweizong/dsh-workbuddy-skills" },
  "metadata": {
    "category": "skill",
    "keywords": ["workbuddy", "skills", "skill-import", "skill-manager", "skill-market"],
    "labels": [],
    "sortKeys": {}
  },
  "versions": [
    {
      "version": "0.1.0",
      "publishTimestamp": 0,
      "source": { "type": "npm" },
      "engines": { "dsh": ">=0.2.0-rc.2 <0.3.0" }
    }
  ]
}
```

要点：

- `name` 必须与 npm 包名逐字符一致；`title` 是 `owner/repo`（子目录包才用 `owner/repo#sub/dir`）；
- `versions[].publishTimestamp` 用 npm 上是**发布时间（unix 秒）**，填 `npm view dsh-workbuddy-skills time.modified` 对应的秒数或 PR 时按仓库说明补；
- `engines.dsh` 写成与 `package.json` 的 `engines.dsh` 一致，市场据此过滤不兼容的 DSH 版本；
- `homepage` 是市场站生成的插件详情页，随条目自动生成，不用自己建页。

## 4. 上线后回查

```powershell
# 索引刷新后（CDN 有缓存，几分钟）
curl.exe -s https://fastly.jsdelivr.net/npm/dsh-plugin-catalog/index.json | Select-String dsh-workbuddy-skills
```

桌面端：插件市场 → 搜索 `WorkBuddy` → 出现卡片 → 安装 → 设置里能打开面板。

## 5. 版本与兼容

| 场景 | 做法 |
| --- | --- |
| 修 bug / 改文案 | patch 版本 `0.1.1`，CHANGELOG 记 `Fixed` |
| 新增配置项 / 新能力 | minor `0.2.0`，CHANGELOG 记 `Added`，README 同步 |
| DSH 破坏性升级 | 先确认 `dsh.client.inject` 与 `settings.section` 槽签名，再决定 minor/major |
| 放弃某版本 | `npm deprecate dsh-workbuddy-skills@0.1.0 "原因"`，不要 `unpublish` |
