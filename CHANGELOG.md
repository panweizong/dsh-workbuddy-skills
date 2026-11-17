# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-17

### Added

- Settings panel (`Settings → WorkBuddy 技能市场`) that scans the WorkBuddy skills
  directory and lists every skill as a card with icon, id, source folder, description,
  status badge, version, file count and size.
- Skill id normalization: `__skillhub` / `__user_<hash>__skillhub` suffixes are stripped
  and the id is taken from frontmatter `name` → `slug` → folder name, so imported
  folders match the skill name DSH expects.
- Duplicate collapsing: multiple source folders resolving to the same skill id are
  reduced to the newest one; copies are hidden by default and can be shown on demand.
- Frontmatter cleanup: WorkBuddy-only fields are dropped and only `name`, `description`,
  `version`, `license` are written back; `description_zh` is promoted to `description`
  when no `description` exists.
- File filtering: WorkBuddy metadata (`_meta.json`, `_skillhub_meta.json`, `_user_meta.json`,
  `skill-card.md`, `上架说明.md`, `使用指南.md`, `开发者声明.md`) is excluded, icons and
  `README` are kept, nested sub-skill folders are copied as-is.
- One-click per-card install/update plus batch selection, with `overwrite`, `backup` and
  `dryRun` options shared by both paths.
- Safe updates: overwriting or removing a skill first moves the existing folder to
  `<skills>/.backup/<id>-<timestamp>/`.
- Delete skill from the panel, with two-step confirmation and the same backup rule.
- Runtime path settings: source directory and target directory are editable in the panel
  and stored in `<dshHome>/storages/workbuddy-skills/settings.json`; empty values fall back
  to the patch config and then to the built-in defaults. Only absolute paths or `~` are
  accepted.
- Import manifest at `<dshHome>/storages/workbuddy-skills/manifest.json` recording source
  folder, SHA-256, version and import time.
- Safety limits per skill: 500 files, 4 MiB per file, 16 MiB total; hostile names
  (`..`, path separators, dot-folders) are rejected server-side.
- Offline test scripts: `node scripts/smoke.mjs` (scan/normalize/import/remove against the
  real WorkBuddy folder) and `node scripts/routes-smoke.mjs` (route-level assertions with a
  stub web server, including origin guards and traversal rejection). Run both with
  `npm test`.

### Security

- All mutating routes accept same-origin `POST` only: loopback host check, `sec-fetch-site`
  rejection, and `Origin` must match `Host` when present.
- Icon route is whitelist-based (fixed candidate filenames inside the scanned skill folder).
