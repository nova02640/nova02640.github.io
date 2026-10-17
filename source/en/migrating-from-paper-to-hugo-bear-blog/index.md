---
title: 'From Paper to Hugo Bear Blog: A Minimalist Migration'
date: 2026-08-03 00:00:00
description: 'A full record of migrating from the Hugo Paper theme to the Hugo Bear
  Blog theme: the state before migration, the challenges encountered, the solutions,
  and the results afterward.'
tags:
- Hugo
- Blog
- Migration
- Bear Blog
cover: /img/covers/migration-to-bear-blog.jpg
lang: en
layout: post
---


## Introduction

The previous post, [*Making the Paper Theme Look the Way Programmers Like*](/把-paper-主题改成程序员喜欢的样子一次克制的主题定制/), documented a restrained customization of the Paper theme. The idea at the time was: **don't switch themes — use the override mechanism for incremental customization.** After the customization was done, the blog genuinely became nicer to use, but one thought kept lingering:

> All those customizations I made were essentially **compensating for the theme's shortcomings**. What if there were a theme that was born exactly the way I wanted?

So this migration happened: from Paper to [Hugo Bear Blog](https://github.com/janraasch/hugo-bearblog).

---

## The State Before Migration

First, a description of what the "house" looked like before the move.

### Tech Stack

- **Framework**: Hugo (extended)
- **Theme**: [Paper](https://github.com/nanxiaobei/hugo-paper), brought in as a git submodule
- **Deployment**: GitHub Actions → GitHub Pages
- **Customizations**: `assets/custom.css` + overridden `single.html` / `footer.html`

### Existing Customizations

Quite a bit of polish had been applied on top of the Paper theme:

| Customization | Approach |
|:------|:-----|
| Font stack | Chinese-first with monospace fallback, set in `custom.css` |
| Code block style | Rounded corners, light gray background, thin border |
| Inline code | Light background + rounded corners + monospace |
| Slim scrollbar | 6px wide globally, semi-transparent rounded thumb |
| Link style | Orange underline, darkens on hover |
| Blockquote | Orange left border + light background |
| Table overflow prevention | `display: block; overflow-x: auto` |
| Selection color | Semi-transparent orange `::selection` |
| Back-to-top | Circular button in the bottom-right corner + 6 lines of vanilla JS |
| Reading time | Override of `single.html`, displaying "☕ N min · N chars" |
| Categories/tags pages | Already removed via `disableKinds` |

### Problems Already Solved

During the Paper era, a key decision had been made — **cut out taxonomies**. `disableKinds = ["taxonomy"]` stopped Hugo from generating `/tags/` and `/categories/` pages, and tags at the bottom of posts became plain text. The navbar was left with only "About."

This decision carried over after the migration.

---

## Why Migrate

Paper is a good theme — clean, modern, Tailwind-powered. But it has a fundamental characteristic: **it is a "modern frontend" theme.**

What does that mean?

1. **CSS framework dependency**: Paper is built on Tailwind v4. Although it compiles down to plain CSS, the theme's design language is Tailwind's — utility classes, design tokens, a component-oriented mindset. For a personal blog that just wants to *write*, this is **unnecessary complexity**.
2. **JS dependency**: Paper's back-to-top button, nav interactions, and the like rely on a small amount of JavaScript. Not much, but for a static blog, **zero JS is a matter of faith**.
3. **Visual style**: Paper is modern but not quite "bare." It has rounded corners, shadows, transition animations — all of these are *decorations*. [Bear Blog](https://bearblog.dev/)'s style, on the other hand, pursues **extreme bareness**: default browser styles, virtually no visual embellishment.

The motivation for migrating, in one sentence:

> **If restraint is the highest form of design, then Paper still isn't restrained enough. I wanted a theme that naturally "does nothing."**

---

## The Migration Process

### Step 1: Choose a New Theme

Three candidates:

| Theme | Characteristics | Reason for Choice |
|:----|:-----|:--------|
| Hugo Bear Blog | Pure HTML/CSS, zero JS, Bear Blog style | ✅ Best fit for the "bare" philosophy |
| Hugo Bare Min | Similarly minimal, but inactive maintenance | ❌ Last updated too long ago |
| Write my own | Complete control | ❌ Reinventing the wheel, not worth it |

The final choice was [hugo-bearblog](https://github.com/janraasch/hugo-bearblog). Its core philosophy:

- **Pure HTML + CSS**, zero JavaScript
- Uses native browser styles by default, with only the minimal necessary visual adjustments
- Responsive design without relying on any framework
- Supports Hugo's standard features (SEO, RSS, sitemap, etc.)

### Step 2: Swap the Submodule

This was the most "physical" step of the migration — replacing the Paper submodule with hugo-bearblog.

```bash
# 1. 移除旧 submodule
git submodule deinit -f themes/paper
rm -rf .git/modules/themes/paper
git rm -f themes/paper

# 2. 添加新 submodule
git submodule add https://github.com/janraasch/hugo-bearblog.git themes/hugo-bearblog

# 3. 更新配置
# hugo.toml: theme = "hugo-bearblog"
```

The step itself isn't complicated, but there's a gotcha: **after `git submodule deinit`, you must manually delete the directory under `.git/modules/`**, otherwise the new submodule may fail to initialize properly.

### Step 3: Rewrite hugo.toml

The configuration structures of Paper and hugo-bearblog differ significantly. Paper relies on a large number of params (`name`, `bio`, `mainSections`, etc.), while hugo-bearblog is much leaner.

Core configuration of the new `hugo.toml`:

```toml
theme = "hugo-bearblog"
title = "nova02640's Blog"
author = "nova02640"
copyright = "© 2026 nova02640"
languageCode = "zh-cn"

# 保持 taxonomy 禁用——这个决策从 Paper 时期延续下来
disableKinds = ["taxonomy"]
ignoreErrors = ["error-disable-taxonomy"]

[permalinks]
  blog = "/:slug/"    # Bear Blog 风格的短 URL

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
  enablePostNavigator = true
  dateFormat = "2006-01-02"    # ISO 日期格式
```

Key changes:

| Item | Paper Era | Bear Blog Era |
|:-----|:----------|:--------------|
| Theme | `paper` | `hugo-bearblog` |
| Permalink | `/:sections/:year/:slug/` | `/:slug/` |
| Navigation | Only "About" | Blog + About |
| Code highlighting | Paper built-in | `friendly` style + line numbers |
| Date format | Custom | ISO 8601 |

### Step 4: Content Migration

Posts were moved from the root of `content/` into `content/blog/`:

```text
content/
├── _index.md          # 首页
├── about.md           # 关于页面
└── blog/
    ├── first-post.md
    ├── llm-price-research.md
    └── theme-optimization.md
```

Combined with `permalinks.blog = "/:slug/"`, this produced shorter URLs: `/hello-world-我的第一篇博客/` instead of `/blog/2026/hello-world/`.

### Step 5: Clean Up Old Customization Files

All Paper-era customizations were deleted:

- `layouts/_default/single.html` (reading time override)
- `layouts/partials/footer.html` (back-to-top button)
- `assets/custom.css` (all CSS customizations)
- `archetypes/` (custom templates)

In hugo-bearblog, these customizations were either unnecessary (the theme provides them) or inconsistent with the new style (such as the back-to-top button — the Bear Blog style doesn't call for such interactive elements).

---

## Challenges Encountered

### Challenge 1: Permalink Structure Change

Paper used multi-level URLs of the form `/:sections/:year/:slug/`, while Bear Blog uses flat `/:slug/`. This means **every post's URL changes**.

For a personal blog, this isn't a big deal — no external links point to the old URLs, and no 301 redirects are needed. But for a blog with an established readership, this step would require careful consideration of the SEO impact.

### Challenge 2: Submodule Cleanup

`git submodule deinit` doesn't completely clean up the submodule's traces. Leftover old directories under `.git/modules/` cause the new submodule's initialization to fail. The solution is to manually delete the leftover directory:

```bash
rm -rf .git/modules/themes/paper
```

### Challenge 3: Redesigning the Navigation Menu

During the Paper era, the navbar went through a process of "adding, then subtracting," ending up with only "About." After migrating to Bear Blog, a "Blog" entry was added back — because Bear Blog's navigation is simpler (plain text links), so an extra entry doesn't add visual noise.

### Challenge 4: Chinese-Language Post URLs

Since post titles are in Chinese, the slugs Hugo auto-generates are also in Chinese. This results in URLs containing Chinese characters (e.g., `/国产大模型官方价格一览2026-07/`).

While browsers handle URL-encoded addresses just fine, it's not ideal for sharing or SEO. The solution is to manually set the `slug` field in the front matter. New posts uniformly use English slugs; old posts keep their original slugs (to avoid breaking links).

---

## Results After Migration

### Visual Comparison

| Dimension | Paper | Hugo Bear Blog |
|:-----|:------|:--------------|
| CSS framework | Tailwind v4 (compiled output) | Native CSS (~200 lines inlined) |
| JavaScript | Some (back-to-top, etc.) | Zero |
| Fonts | System font stack (customized) | Browser default |
| Code highlighting | Built-in | `friendly` style |
| Visual style | Modern, rounded, shadows | Bare, native, undecorated |
| Page size | Larger (Tailwind compiled output) | Very small (~5KB CSS) |

### Performance

Pages load faster after the migration — nothing blocks rendering with JS, the CSS is just a few hundred lines inlined in `<head>`, with no extra network requests.

### Experience

- **Quieter**: No back-to-top button, no transition animations, no hover effects. The page *is* the content.
- **More consistent**: All visual elements use browser default styles, so cross-platform consistency is better.
- **More maintainable**: The config file is shorter, there are no custom files to maintain, and theme upgrades cause zero conflicts.

---

## Reflection

This migration made me reconsider a question: **what is the endpoint of customization?**

During the Paper era, my answer was "use the override mechanism for incremental customization" — don't touch the theme's source code, only add, never modify. It was elegant, but fundamentally still *patching* a theme that wasn't quite right.

After migrating to Bear Blog, the answer became "pick a theme that is naturally right, and then do nothing."

> **The best customization is one you never notice. The best migration is one that leaves you with nothing left to customize.**

Of course, Bear Blog isn't perfect either. It lacks some features I like (such as reading time and dark mode), but its philosophy is: **if you need those features, it means the content itself isn't compelling enough yet.**

That philosophy, I accept.
