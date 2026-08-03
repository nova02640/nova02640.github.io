# Hugo Blog Theme Migration: From Paper to Hugo Bear Blog

> Migration specification document for team developers. Covers end-to-end steps from preparation through verification, including all configuration changes, pitfalls, and rollback procedures.

---

## 1. Overview

### 1.1 Background

This repository is a personal blog built with the **Hugo** static site generator. It is deployed automatically to **GitHub Pages** via a **GitHub Actions** workflow on every push to `main`.

Prior to this migration, the blog ran on the **Paper** theme (`nanxiaobei/hugo-paper`), a modern Tailwind v4-driven theme. Incremental customizations (custom CSS, layout overrides, archetypes) had accumulated on top of Paper over time.

### 1.2 Migration Objective

Replace the Paper theme with **Hugo Bear Blog** (`janraasch/hugo-bearblog`), a pure HTML/CSS, zero-JavaScript theme with a deliberately minimal, browser-native aesthetic.

### 1.3 Scope of Changes

- Theme submodule swap (Paper → Hugo Bear Blog).
- Rewrite of `hugo.toml` to match Bear Blog configuration conventions.
- Content directory reorganization (`content/*.md` → `content/blog/*.md`).
- Removal of all Paper-era customization files.
- English localization of non-article UI strings.
- Addition of a bilingual (EN + ZH) README.
- Addition of this migration specification document.

**Out of scope:** article body content inside `content/blog/` remains verbatim; no CI/CD pipeline changes (the existing `hugo.yaml` workflow is reused as-is); no Hugo version upgrade.

### 1.4 Deliverables

1. Blog rendered under Hugo Bear Blog on GitHub Pages at `https://nova02640.github.io`.
2. Clean `main` branch history with all changes committed.
3. This `MIGRATION.md` document.
4. Bilingual `README.md` (EN) + `README.zh.md` (ZH).

---

## 2. Pre-Migration State

### 2.1 Tech Stack

| Layer | Component | Version |
|:------|:----------|:--------|
| Static site generator | Hugo (extended) | 0.164.0 |
| Theme | Paper (`nanxiaobei/hugo-paper`) | via git submodule |
| Deployment target | GitHub Pages | — |
| CI/CD | GitHub Actions workflow `.github/workflows/hugo.yaml` | `peaceiris/actions-hugo@v3` |
| Trigger | Push to `main` branch | — |

### 2.2 Content Layout

```
content/
├── _index.md                     # home page
├── about.md                      # /about/
├── first-post.md                 # article 1
├── llm-price-research.md         # article 2
└── theme-optimization.md         # article 3
```

Articles sat directly under `content/`. Paper's default permalink pattern produced multi-level URLs such as `/posts/2026/first-post/`.

### 2.3 Existing Customizations on Paper

The following files overrode Paper's defaults through Hugo's lookup order:

| Path | Purpose | Size |
|:-----|:--------|:-----|
| `assets/custom.css` | Tailwind-referencing overrides: fonts, scrollbars, code-blocks, quotes, links, back-to-top button styling | ~208 lines |
| `layouts/_default/single.html` | Replaced Paper's single template to add reading time ("☕ N 分钟 · N 字") and custom tag rendering | ~133 lines |
| `layouts/partials/footer.html` | Replaced Paper's footer; injected copyright + back-to-top button with inline JavaScript | ~38 lines |
| `archetypes/default.md` | Custom front-matter archetype (YAML) | ~8 lines |

### 2.4 Key Configuration Before Migration

Relevant lines from the pre-migration `hugo.toml`:

```toml
theme = "paper"
defaultContentLanguage = "zh-cn"
params.color = "linen"
disableKinds = ["taxonomy", "term"]          # taxonomy pages removed
params.mainSections = ["posts", ""]
# social links under [[params.social]]
# menu: About only
```

---

## 3. Migration Plan

### 3.1 Branching Workflow

All work was performed on a feature branch and merged via fast-forward.

```
main
  └── feat/switch-to-bearblog      # all migration commits
        └── (squashed or merged via fast-forward into main)
```

### 3.2 Change-Control Checklist

- Every file change is justified in §4 through §9.
- Local `hugo` build must pass with zero errors before any push.
- `hugo server` preview must be manually checked against the acceptance checklist in §10.
- Push is performed only after local verification passes.

### 3.3 Risk & Rollback

| Risk | Severity | Mitigation |
|:-----|:--------|:-----------|
| Submodule swap leaves stale state | Medium | Clean `.git/modules/` explicitly (see §4.3). |
| Permalink change breaks inbound links | Low (no external SEO yet) | Acceptable; aliases available if later needed. |
| Theme config mismatch causes blank pages | Medium | Build locally before push. |
| CI fails after merge | Low | Reuse existing workflow with `submodules: recursive`. |
| Human error during file edits | Low | Work on a disposable branch; reset if needed. |

Rollback plan is fully described in §12.

---

## 4. Step 1 — Theme Submodule Replacement

### 4.1 Remove Paper Submodule

Three actions are required for a clean removal. `git submodule deinit` alone is **not** sufficient.

```bash
# 1) Unregister and remove the working tree entry
git submodule deinit -f themes/paper

# 2) Remove the submodule's git data (CRITICAL — see §4.3)
rm -rf .git/modules/themes/paper

# 3) Remove the tracking entry from .gitmodules + index
git rm -f themes/paper
```

### 4.2 Add Hugo Bear Blog Submodule

```bash
git submodule add https://github.com/janraasch/hugo-bearblog.git themes/hugo-bearblog
```

This updates `.gitmodules` to:

```ini
[submodule "themes/hugo-bearblog"]
    path = themes/hugo-bearblog
    url = https://github.com/janraasch/hugo-bearblog.git
```

### 4.3 Common Pitfall: Stale `.git/modules/` Directory

**Symptom.** After `git submodule deinit`, running `git submodule add` for a new theme at the same or related path fails with "already exists" or pulls stale objects.

**Root cause.** `git submodule deinit` only updates `config` and the working tree. It intentionally does **not** delete `$GIT_DIR/modules/<name>/`, preserving submodule reflog history. When the same path is reused later, the stale metadata collides.

**Fix (already applied in §4.1 step 2).** Explicit `rm -rf .git/modules/themes/paper`.

**Verification after step:**

```bash
git submodule status
# Expected: one line —  87142ec... themes/hugo-bearblog ...
```

---

## 5. Step 2 — Content Structure Migration

### 5.1 Directory Restructure

Bear Blog expects articles under `content/blog/` by default. Move all posts there:

```bash
mkdir -p content/blog
git mv content/first-post.md               content/blog/
git mv content/llm-price-research.md       content/blog/
git mv content/theme-optimization.md       content/blog/
# later additions:
# content/blog/migration-to-bear-blog.md   (blog post about the migration)
```

Final layout:

```
content/
├── _index.md
├── about.md
└── blog/
    ├── first-post.md
    ├── llm-price-research.md
    ├── theme-optimization.md
    └── migration-to-bear-blog.md
```

### 5.2 URL / Permalink Impact

| Item | Paper (Before) | Bear Blog (After) |
|:-----|:--------------|:------------------|
| Permalink config | Paper default: per-section multi-level | `blog = "/:slug/"` (flat) |
| Example article URL | `/posts/2026/first-post/` | `/hello-world-我的第一篇博客/` |
| Blog listing page | Not a dedicated page | `/blog/` |
| Tags index | Disabled | `/blog/:slug` |

Because existing article titles are in Chinese, Hugo's auto-derived `slug` contains Chinese characters (URL-encoded by browsers). This was accepted without change for existing posts; new posts are expected to set `slug` explicitly in front matter.

---

## 6. Step 3 — Configuration Rewrite (`hugo.toml`)

### 6.1 Full New Configuration

```toml
# Base URL used when generating links to your pages
baseURL = "https://nova02640.github.io"
theme = "hugo-bearblog"
title = "nova02640's Blog"
author = "nova02640"
copyright = "© 2026 nova02640"
languageCode = "zh-cn"
enableRobotsTXT = true

# Bearblog-style URLs
disableKinds = ["taxonomy"]
ignoreErrors = ["error-disable-taxonomy"]

[permalinks]
  blog = "/:slug/"
  tags = "/blog/:slug"

[[menu.main]]
  identifier = "blog"
  name = "Blog"
  url = "/blog/"
  weight = 10

[[menu.main]]
  identifier = "about"
  name = "About"
  url = "/about/"
  weight = 20

[params]
  description = "Personal blog · Thoughts and sharing"
  title = "nova02640's Blog"
  enablePostNavigator = true
  dateFormat = "2006-01-02"

[markup]
  [markup.highlight]
    style = 'friendly'
    lineNos = true
    lineNumbersInTable = false
    codeFences = true
  [markup.goldmark.renderer]
    unsafe = true

[outputs]
  home = ["HTML", "RSS", "JSON"]
```

### 6.2 Line-by-Line Diff Against Pre-Migration Config

| Category | Pre-migration | Post-migration | Rationale |
|:---------|:--------------|:---------------|:----------|
| Theme | `theme = "paper"` | `theme = "hugo-bearblog"` | Theme swap. |
| Locale | `defaultContentLanguage = "zh-cn"` | `languageCode = "zh-cn"` | Bear Blog convention; still generates correct `<html lang>`. |
| Color / bio / social | `params.color = "linen"`, `params.bio`, `[[params.social]]` | **Removed** | Bear Blog has no such params; UI is intentionally minimal. |
| Main sections | `params.mainSections = ["posts", ""]` | **Removed** | Bear Blog uses `content/blog/` convention. |
| Menu | `About` only | `Blog` (weight 10) + `About` (weight 20) | Restored Blog nav entry; UI localized to English. |
| Disable kinds | `disableKinds = ["taxonomy", "term"]` | `disableKinds = ["taxonomy"]` + `ignoreErrors` | Bear Blog docs prescribe this exact pattern. |
| Permalinks | Not set | `blog = "/:slug/"` + `tags = "/blog/:slug"` | Bear Blog's flat URL convention. |
| `[params]` block | Paper-specific keys | `description`, `title`, `enablePostNavigator = true`, `dateFormat = "2006-01-02"` | Bear Blog param names; ISO 8601 dates; prev/next post navigation enabled. |
| `[markup.highlight]` | Paper defaults | `style = 'friendly'`; `lineNos = true`; `codeFences = true`; `lineNumbersInTable = false` | Explicit, reproducible code highlighting per Bear Blog docs. |
| `[markup.goldmark.renderer]` | — | `unsafe = true` | Allows inline HTML inside Markdown articles. |
| `[outputs]` home | Default | `["HTML", "RSS", "JSON"]` | Explicit output formats. |

### 6.3 Hugo Deprecation Notice

`languageCode = "zh-cn"` triggers a deprecation warning in Hugo ≥ 0.158.0. This is a warning only — the build succeeds. A future follow-up change may migrate to the new `[languages.zh-cn]` table or use `defaultContentLanguage`.

---

## 7. Step 4 — Cleanup of Paper-Era Customizations

Each file listed below was deleted. The "Why removed" column explains why retaining it would be incorrect under Bear Blog.

| File | Reason for Removal |
|:-----|:-------------------|
| `assets/custom.css` | References Paper's `./app.css` via Tailwind `@reference`; relies on Tailwind utility classes; Bear Blog uses pure CSS variables through `custom_head.html`. Retaining it would be dead code or cause build errors. |
| `layouts/_default/single.html` | Paper-era override to add reading time, tag handling, and comment integrations (Disqus / GraphComment / giscus). Bear Blog's native single.html already renders date + content + tags + post-navigator. Keeping the override would silently skip Bear Blog's built-in behavior. |
| `layouts/partials/footer.html` | Paper-era override injecting a back-to-top button + JS. Bear Blog has a defined footer signature; overriding it removes the "Made with Hugo ʕ•ᴥ•ʔ Bear" attribution. |
| `archetypes/default.md` | Paper-specific front matter. Archetypes are now provided by the theme or derived from Bear Blog defaults. |

Deletion commands:

```bash
git rm assets/custom.css
git rm layouts/_default/single.html
git rm layouts/partials/footer.html
git rm archetypes/default.md
# Clean up any now-empty directories left under layouts/ / assets/ / archetypes/
```

---

## 8. Step 5 — Localization of Non-Article UI

Goal: non-article-facing UI strings (navigation, site description, headings in structural pages) use English; article content and the blog migration narrative post remain in Chinese.

### 8.1 Menu Labels (already in §6.2)

| Identifier | Old label | New label |
|:-----------|:----------|:----------|
| `blog`     | *(n/a — not present)* | `Blog` |
| `about`    | `关于`    | `About` |

### 8.2 `content/_index.md` (Home)

Changed the welcome heading from Chinese to English. The goal is for visitors landing on `/` to see the English description first; navigation then leads to Chinese-language articles.

### 8.3 `content/about.md`

Changed the page heading and statement blocks to English. These are site-level declarations, not article prose.

### 8.4 README Bilingual Scheme

| File | Role |
|:-----|:-----|
| `README.md` | Default English version. Link at top: `[中文说明](./README.zh.md)`. |
| `README.zh.md` | Full Chinese translation. Link at top: `[English](./README.md)`. |

Both READMEs contain: project description, blog URL, and article index table linking to the live-post slugs. Article table rows use the same language as the README (EN titles in EN README, ZH titles in ZH README), while the target URLs remain identical.

---

## 9. Step 6 — Local Build and Verification

### 9.1 Environment Prerequisites

- Go-based `hugo` extended binary, version `0.164.0` (matches CI).
- Submodules initialized: `git submodule update --init --recursive`.

### 9.2 Production Build

```bash
hugo --minify
```

Expected outcome:

- Exit code `0`.
- Summary line: `27 pages created` (actual count may drift as articles are added; any value > 0 is fine as long as zero errors).
- No `ERROR` lines. A single `WARN` regarding deprecated `languageCode` is acceptable per §6.3.
- `public/` directory generated with minified HTML/CSS/XML/JSON.

### 9.3 Preview Server

```bash
hugo server -D -p 1313
```

Open `http://localhost:1313/`.

### 9.4 Acceptance Checklist

Every item below must be satisfied before push.

| # | Area | Check | Status |
|:-:|:-----|:------|:-------|
| 1 | Home `/` | Bear Blog styling visible; title, bio, navigation rendered; no blank sections | ✅ |
| 2 | Blog index `/blog/` | List of all 3+ posts; each entry shows date + link; tag cloud at bottom | ✅ |
| 3 | About `/about/` | English About content present; CC + takedown sections rendered correctly | ✅ |
| 4 | Article page | Title, ISO-format date, body, tags, post-navigator (← / →) all present | ✅ |
| 5 | URL pattern | Articles reachable at `/:slug/`, not at old multi-level paths | ✅ |
| 6 | Code blocks | `friendly` highlight style with line numbers and rounded corners | ✅ |
| 7 | Dark mode | `prefers-color-scheme: dark` flips palette (verify via dev tools or OS setting) | ✅ |
| 8 | Back-to-top | **Absent** — deliberately removed per Bear Blog philosophy | ✅ |
| 9 | Reading-time badge | **Absent** — deliberately no custom single.html override | ✅ |
| 10 | Footer | "Made with Hugo ʕ•ᴥ•ʔ Bear Blog" attribution line present | ✅ |
| 11 | RSS | `/index.xml` returns valid XML; `/feed.json` returns valid JSON | ✅ |
| 12 | robots.txt | Present and non-empty (thanks to `enableRobotsTXT`) | ✅ |
| 13 | Console | 0 JS errors; 0 failed asset fetches; no CSP violations | ✅ |
| 14 | Permalink diff | No old `/posts/2026/...`-style 404 links in README | ✅ |

---

## 10. Step 7 — CI/CD and Deployment

### 10.1 Workflow File (Reused Unchanged)

`.github/workflows/hugo.yaml` (3 steps — checkout, setup Hugo, build, deploy) was kept verbatim:

- `actions/checkout@v4` with `submodules: recursive` and `fetch-depth: 0` — the recursive flag is **required** so the new Bear Blog submodule is pulled on the CI runner.
- `peaceiris/actions-hugo@v3` pinning `hugo-version: "0.164.0"` + `extended: true`.
- `hugo --minify` build step.
- `actions/upload-pages-artifact@v3` upload of `./public`.
- `actions/deploy-pages@v4` to the `github-pages` environment.

### 10.2 Permissions (Reused Unchanged)

```
contents: read
pages: write
id-token: write
```

Sufficient for checkout + Pages deployment; no additional OIDC scopes required.

### 10.3 Push Procedure

```bash
# After local build + §9 checks pass.
git checkout main
git merge --ff-only feat/switch-to-bearblog    # no merge commit on clean fast-forward
git push origin main
```

The push triggers the workflow. Actions runs are visible at `https://github.com/nova02640/nova02640.github.io/actions`.

### 10.4 Expected GitHub Actions Run Outcome

```
✅ build    (ubuntu-latest) — Checkout → Setup Hugo → Build → Upload artifact
✅ deploy   (ubuntu-latest) — Deploy to GitHub Pages
```

Failure modes:

| Symptom | Likely cause | Fix |
|:--------|:-------------|:----|
| Build step fails: theme not found | Submodule not pulled recursively | Confirm `submodules: recursive` in checkout step. |
| Build step fails: Hugo version mismatch | CI runner has a different version | Pin exact version in workflow. |
| Deploy step fails: permission / OIDC | Missing `id-token: write` or Pages misconfigured | Check repo Settings → Pages → Source = GitHub Actions. |

---

## 11. Post-Migration Verification (Three Tiers)

### 11.1 Local Git vs. Remote

```bash
git fetch origin
git rev-parse HEAD            # → edcfb51... (example)
git rev-parse origin/main     # → edcfb51... — must match
git log origin/main..main     # → empty (no local-only commits)
git log main..origin/main     # → empty (no remote-only commits)
```

### 11.2 Remote Repository Contents

On GitHub at `https://github.com/nova02640/nova02640.github.io/tree/main`, confirm:

- `themes/hugo-bearblog/` is a green submodule link pointing at `janraasch/hugo-bearblog`.
- No `themes/paper/` directory remains.
- `hugo.toml`, `MIGRATION.md`, `README.md`, and `README.zh.md` all present.
- `content/blog/` contains all article files.

### 11.3 Live GitHub Pages Site

At `https://nova02640.github.io/`, re-run the acceptance checklist from §9.4 against the live deployment.

Additionally verify:

- SSL certificate valid (HTTPS only, no mixed content).
- Custom domain / `CNAME`, if any — not used by this site, so `N/A`.
- Cache cleared or allow a few minutes for Pages CDN propagation.

---

## 12. Rollback Plan

Two rollback strategies are available depending on the severity of the post-deployment problem.

### 12.1 Strategy A — Branch-Level (Fastest, Recommended First)

If the migration commit is the tip of `main` and everything before it ran on Paper:

```bash
# Find the last pre-migration commit hash, e.g. <ABC>
git log --oneline main

# Revert the migration commit(s) — creates a new inverse commit, keeps history
git revert <migration-commit-sha>
git push origin main
```

If a revert produces conflicts (unlikely for a theme swap because files rarely change simultaneously outside the migration), use Strategy B instead.

### 12.2 Strategy B — Reset (Destructive to History)

```bash
# Hard-reset main to the last known-good commit
git checkout main
git reset --hard <last-commit-before-migration>

# Force-push — coordinate with team to avoid someone pulling stale main
git push --force-with-lease origin main
```

### 12.3 Submodule Recovery

If after rollback the Paper submodule is left in an inconsistent state:

```bash
git submodule sync --recursive
git submodule update --init --recursive --force
```

### 12.4 CI Pipeline Rollback

The workflow file was not modified, so there is nothing to roll back at the CI layer. After the code revert, the next push to `main` redeploys the previous Paper state.

---

## 13. Lessons Learned

1. **Explicit > implicit for submodules.** Always include the `rm -rf .git/modules/…` step in any migration playbook; rely on team documentation rather than muscle memory.
2. **Permalinks are a contract.** For a blog without SEO history it is fine to break URLs, but for production sites, capture aliases or 301 redirects *before* the migration.
3. **Slug = stable identifier.** New posts should define `slug` explicitly (English, kebab-case) so the URL is stable regardless of later title edits.
4. **Theme overrides are migration debt.** The Paper-era overrides required careful deletion; overrides that are not feature-gated per-theme silently break on a theme swap.
5. **Verify end-to-end before push.** `hugo` success is not sufficient — preview-verify the three page types (home, listing, article) plus dark mode + RSS every time.
6. **CI config should not require change for theme swaps.** Keeping the checkout step `submodules: recursive` and Hugo version pinned made this a zero-CI-change migration.
7. **Bilingual docs: one canonical, one linked.** Putting two full READMEs in the root is noisy but explicit; avoid partial translations.

---

## 14. Appendix: Complete File Change Log

| File | Change Type | Summary of Change |
|:-----|:------------|:------------------|
| `.gitmodules` | Modify | Replaced `themes/paper` submodule entry with `themes/hugo-bearblog`. |
| `.github/workflows/hugo.yaml` | (None) | Reused verbatim; confirmed `submodules: recursive`. |
| `hugo.toml` | Rewrite | Full rewrite for Bear Blog; see §6.2 for line-by-line diff. |
| `README.md` | Rewrite | English default, blog URL, article index, link to `README.zh.md`. |
| `README.zh.md` | New | Chinese mirror of README; link back to `README.md`. |
| `MIGRATION.md` | New | This document — end-to-end migration specification. |
| `content/_index.md` | Modify | English welcome heading + intro. |
| `content/about.md` | Modify | English title and declaration blocks; article content untouched. |
| `content/blog/first-post.md` | Move + New dir | Moved from `content/` into `content/blog/`; body unchanged. |
| `content/blog/llm-price-research.md` | Move + New dir | Moved from `content/` into `content/blog/`; body unchanged. |
| `content/blog/theme-optimization.md` | Move + New dir | Moved from `content/` into `content/blog/`; body unchanged. |
| `content/blog/migration-to-bear-blog.md` | New | Chinese narrative blog post describing the migration for blog readers. |
| `assets/custom.css` | Delete | Paper-era Tailwind-referencing overrides. |
| `layouts/_default/single.html` | Delete | Paper-era reading-time + tag integration. |
| `layouts/partials/footer.html` | Delete | Paper-era back-to-top button + JS. |
| `archetypes/default.md` | Delete | Paper-specific YAML archetype. |
| `themes/paper` | Delete submodule | Old theme. |
| `themes/hugo-bearblog` | New submodule | New theme at pinned commit. |
