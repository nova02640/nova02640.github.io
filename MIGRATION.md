# Migration Record: Paper → Hugo Bear Blog

> A technical walkthrough of switching this Hugo blog's theme from [Paper](https://github.com/nanxiaobei/hugo-paper) to [Hugo Bear Blog](https://github.com/janraasch/hugo-bearblog).

## 1. Background

This repository is a personal blog built with **Hugo** and deployed to **GitHub Pages** via **GitHub Actions**.

Before the migration, the blog used the **Paper** theme — a modern, Tailwind v4-driven theme with a clean but "decorated" visual style (rounded corners, shadows, transitions, etc.). Over time, a set of incremental customizations had been layered on top of Paper through Hugo's override mechanism.

## 2. Why Migrate

The migration was motivated by a philosophy shift, not a feature gap.

| Driver | Explanation |
|:-------|:------------|
| Tailwind dependency | Paper is built on Tailwind v4. The compiled CSS works, but the theme's design language (utility classes, design tokens) adds conceptual complexity that a "just writing" blog doesn't need. |
| JavaScript dependency | Paper relies on small amounts of JS for interactions (back-to-top, nav). For a static blog, **zero JS** is a deliberate choice. |
| Visual style | Paper is modern but not "bare". Bear Blog's aesthetic targets **the browser's default look** with only minimal adjustments. |
| Customization debt | Most of the existing custom CSS existed to *compensate* for Paper's defaults. A theme that is born right eliminates the need to patch it. |

> Summary: if restraint is the highest form of design, Paper was not restrained enough.

## 3. Migration Goals

- Switch the Hugo theme from Paper to Hugo Bear Blog.
- Adopt Bear Blog's default configuration and URL scheme (`/:slug/`).
- Keep all existing article content unchanged.
- Remove all Paper-era customizations (custom CSS, layout overrides, archetypes).
- Preserve the existing GitHub Actions deployment pipeline.

## 4. Before vs. After

| Aspect | Before (Paper) | After (Hugo Bear Blog) |
|:-------|:---------------|:-----------------------|
| Theme submodule | `themes/paper` (nanxiaobei/hugo-paper) | `themes/hugo-bearblog` (janraasch/hugo-bearblog) |
| CSS | Tailwind v4 (compiled) + 200+ lines of `custom.css` | ~200 lines of inline native CSS from the theme |
| JavaScript | Small amount (back-to-top button, nav) | **Zero** |
| Permalink | `/:sections/:year/:slug/` | `/:slug/` |
| Navigation | Only "About" | Blog + About |
| Date format | Custom | ISO 8601 (`2006-01-02`) |
| Code highlighting | Paper built-in | `friendly` style with line numbers |
| Taxonomy pages | Disabled (`disableKinds = ["taxonomy"]`) | Same (decision preserved) |
| Custom files | `assets/custom.css`, `layouts/_default/single.html`, `layouts/partials/footer.html`, `archetypes/default.md` | None — all removed |
| Content layout | `content/*.md` (posts at root) | `content/blog/*.md` |

## 5. Migration Steps

The migration was performed on a dedicated branch `feat/switch-to-bearblog` and merged into `main` after local verification.

### Step 1 — Replace the theme submodule

```bash
# Remove the old Paper submodule
git submodule deinit -f themes/paper
git rm -f themes/paper
rm -rf .git/modules/themes/paper      # critical — see pitfall #1

# Add the new Hugo Bear Blog submodule
git submodule add https://github.com/janraasch/hugo-bearblog.git themes/hugo-bearblog
```

Update `.gitmodules` accordingly. The GitHub Actions workflow already uses `submodules: recursive`, so no CI change is required.

### Step 2 — Rewrite `hugo.toml`

```toml
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
```

### Step 3 — Migrate content layout

```text
content/
├── _index.md          # home page
├── about.md          # about page
└── blog/             # ← moved from content/ root
    ├── first-post.md
    ├── llm-price-research.md
    ├── theme-optimization.md
    └── migration-to-bear-blog.md
```

Combined with `permalinks.blog = "/:slug/"`, article URLs become short and flat (e.g. `/hello-world-.../`) instead of the previous multi-level structure.

### Step 4 — Remove Paper-era customizations

```text
deleted:
  layouts/_default/single.html   # reading-time override
  layouts/partials/footer.html   # back-to-top button + JS
  assets/custom.css              # ~200 lines of Tailwind-based overrides
  archetypes/default.md          # custom archetype
```

These were either unnecessary under Bear Blog (the theme already handles them) or incompatible with the new minimal aesthetic.

### Step 5 — Local verification

```bash
hugo server -D
```

Checklist:
- Home page renders with Bear Blog styling
- `/blog/` lists all posts with dates
- Article pages show title, date, content, tags, post navigator
- `/about/` renders correctly
- Dark mode auto-switches via `prefers-color-scheme`
- Code blocks highlight with `friendly` style + line numbers
- RSS feed generated

### Step 6 — Merge and deploy

```bash
git checkout main
git merge feat/switch-to-bearblog
git push origin main
```

The push triggers the existing GitHub Actions workflow (`.github/workflows/hugo.yaml`), which runs `hugo --minify` and deploys to GitHub Pages. No CI changes were needed.

## 6. Pitfalls and Solutions

### Pitfall 1 — Submodule cleanup residue

`git submodule deinit` does **not** remove `.git/modules/<path>/`. Leftover directories cause the new submodule to fail initialization or pull stale state.

**Fix**: manually `rm -rf .git/modules/themes/paper` after deinit.

### Pitfall 2 — Permalink change breaks existing URLs

Switching from `/:sections/:year/:slug/` to `/:slug/` changes every article's URL. For a personal blog without inbound links this was acceptable. For blogs with SEO/external links, consider either:

- keeping the old permalink pattern, or
- adding `aliases` in front matter for redirects, or
- serving 301 redirects via GitHub Pages.

### Pitfall 3 — Non-ASCII slugs

Because existing article titles are in Chinese, Hugo auto-generates slugs containing Chinese characters (e.g. `/国产大模型官方价格一览2026-07/`). Browsers encode them correctly, but they are unfriendly for sharing and SEO.

**Fix**: set an explicit English `slug` in front matter for new posts. Existing posts keep their original slugs to avoid breaking links.

```markdown
---
title: "..."
slug: "migrating-from-paper-to-hugo-bear-blog"
---
```

### Pitfall 4 — Hugo deprecation warning

`languageCode = "zh-cn"` triggers a deprecation warning in Hugo ≥ 0.158.0. Recommended replacement:

```toml
# Before
languageCode = "zh-cn"

# After
defaultContentLanguage = "zh-cn"
# or, more precisely
languageCode = "zh-cn"  # still works but warns
# [languages.zh-cn] languageName = "简体中文" weight = 1 ...
```

This is a warning only — build and deploy still succeed.

## 7. Outcome

### Visual

The blog moved from a modern, decorated look to a deliberately bare one: browser-default fonts, no rounded corners or shadows, no hover transitions, no JavaScript.

### Performance

- **Zero JS** is shipped to the reader.
- CSS is inlined into `<head>` (~a few hundred lines), no extra network request.
- No render-blocking resources.

### Maintainability

- `hugo.toml` is shorter and follows the theme's documented conventions.
- No custom layout/CSS/archetype files to maintain.
- Theme upgrades should be conflict-free since nothing is overridden.

## 8. Decisions Worth Highlighting

| Decision | Rationale |
|:---------|:----------|
| Keep `disableKinds = ["taxonomy"]` | The taxonomy-free decision was made during the Paper era and still aligns with the minimal philosophy. |
| Drop all Paper-era customizations | The customizations existed to compensate for Paper's defaults. Bear Blog is closer to the desired end state, so they are no longer needed. |
| Use Bear Blog's default `/:slug/` permalink | Embraces the theme's native convention. Acceptable since no external links depend on the old URLs. |
| No dark-mode toggle | Bear Blog relies on `prefers-color-scheme` for automatic dark mode. No button, no JS, no user-facing config. |
| Preserve existing article content unchanged | Migration touches presentation and structure, not content. |

## 9. File Changes Summary

| File | Change |
|:-----|:-------|
| `.gitmodules` | Submodule switched from `themes/paper` to `themes/hugo-bearblog` |
| `hugo.toml` | Rewritten for Bear Blog conventions (theme, permalinks, menu, params, markup) |
| `content/blog/*.md` | Moved from `content/` root into `content/blog/` |
| `content/_index.md` | Welcome text updated to English |
| `content/about.md` | Page title and copy updated to English |
| `README.md` | Restructured to English default with a link to `README.zh.md` |
| `README.zh.md` | New Chinese version with a link back to `README.md` |
| `layouts/_default/single.html` | Deleted (Paper-era reading-time override) |
| `layouts/partials/footer.html` | Deleted (Paper-era back-to-top button + JS) |
| `assets/custom.css` | Deleted (Paper-era Tailwind overrides) |
| `archetypes/default.md` | Deleted (custom archetype) |
| `themes/hugo-bearblog` | New theme submodule added |
| `themes/paper` | Old theme submodule removed |

## 10. Lessons Learned

1. **Customization is debt.** Each override you add to a theme is something you must re-validate on every upgrade or migration. The fewer overrides, the easier the next move.
2. **Pick a theme whose defaults match your taste.** Patching a theme to fit your taste is more fragile than choosing a theme that already fits.
3. **Submodule migration is a known trap.** Always clean `.git/modules/` after `deinit`.
4. **Permalink changes are cheap until they aren't.** For small personal blogs they're fine; for anything with inbound traffic, plan redirects up front.
5. **Zero JS is a feature, not a limitation.** It removes an entire class of rendering, accessibility, and security concerns.

## 11. References

- Hugo Bear Blog theme: <https://github.com/janraasch/hugo-bearblog>
- Original Bear Blog (inspiration): <https://bearblog.dev/>
- Paper theme (previous): <https://github.com/nanxiaobei/hugo-paper>
- Hugo documentation: <https://gohugo.io/documentation/>
- Hugo submodule guide: <https://gohugo.io/hugo-modules/theme-components/>
