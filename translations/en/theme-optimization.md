---
title: 'Making the Paper Theme Look Like Something Programmers Love: A Restrained
  Theme Customization'
date: 2026-07-31 00:00:00
description: 'A restrained customization of the Hugo Paper theme: adding reading time,
  polishing code block and scrollbar details, and eventually cutting out the category/tag
  pages. No forks, no bloat — elegant extension through the override mechanism.'
tags:
- Hugo
- Blog
- Frontend
- Customization
categories:
- Tech
cover: /img/covers/theme-optimization.png
lang: en
layout: post
---


## Introduction

This blog runs on Hugo with the [Paper](https://github.com/nanxiaobei/hugo-paper) theme. Paper is already clean enough — single column, white background, no superfluous decoration, ready out of the box. But after a few days, the programmer instinct kicked in:

1. **The category / tag pages are blank.** Clicking into `/tags/` or `/categories/` shows nothing but a lonely title, because Paper's `list.html` only renders article lists and doesn't handle taxonomy overview pages.
2. **Article pages lack information density.** There's only the date and author — no reading time, no word count. A programmer's habit is to "see all the metadata at a glance."
3. **The details aren't "programmer" enough.** The scrollbar is the browser's default thick bar, code blocks have no rounded corners, inline code has no background color, and long tables overflow.

Hence this customization. The guiding principle is just one word: **restraint** — don't touch the theme source code, don't introduce frontend frameworks, don't pile on visual elements. Just solve the pain points.

---

## Read the Source First: Hugo's Theme Extension Mechanism

Before customizing, I went through the theme's source code. Paper's structure is very clean:

```text
themes/paper/
├── assets/
│   ├── app.css        # Tailwind v4 entry (@import 'tailwindcss')
│   ├── main.css       # Compiled output
│   └── custom.css     # ★ Officially reserved custom hook
├── layouts/
│   ├── _default/
│   │   ├── baseof.html   # Skeleton
│   │   ├── list.html     # List pages (homepage / archive)
│   │   └── single.html   # Article page
│   └── partials/
│       ├── head.html     # <head>, loads main.css + custom.css
│       ├── header.html   # Top bar
│       └── footer.html   # Footer
└── i18n/
    └── zh.yaml
```

Two key findings:

**Finding one: `custom.css` is the officially reserved override hook.** `head.html` loads styles like this:

```go
{{- $main := resources.Get "main.css" -}}
{{- $custom := resources.Get "custom.css" -}}
{{- $css := slice $main $custom | resources.Concat "main.css" | minify | fingerprint -}}
```

Hugo's `resources.Get` first looks in the **site root's** `assets/` directory, and only falls back to the theme if not found. So by creating an `assets/custom.css` in the site, it automatically replaces the theme's custom.css and gets merged into the final output — **no need to touch the theme source at all**.

**Finding two: Hugo's template override mechanism.** A file in the site root's `layouts/` directory with the same name overrides the theme's template. This is far more elegant than forking the theme: when the theme upgrades (submodule pull), my customizations are unaffected; and to roll back, I just delete the override files.

---

## Getting to Work: Three Additions + One Subtraction

### 1. Subtraction: Cutting out the category / tag pages (`disableKinds`)

Initially I tried to **fix** the blank taxonomy pages — I created `layouts/_default/taxonomy.html`, used `.Kind` to distinguish overview pages from term pages, and rendered a tag cloud with article counts on `/tags/`. It actually looked pretty good.

But after using it for a while, I noticed a problem: **for a personal blog with only a dozen or so posts, categories and tags have near-zero value**. The navigation bar gained two extra entry points that readers rarely clicked into, and it added information noise instead. So I made a second decision — cut them out entirely:

```toml
# hugo.toml
disableKinds = ["taxonomy", "term"]
```

This one line makes Hugo stop generating `/tags/` and `/categories/` pages altogether. I also changed the tags at the bottom of articles from links to plain text (otherwise they'd become 404 dead links):

```go
<!-- Bottom of article: tags as plain text, no links generated -->
{{- range .Params.tags -}}
<span class="mb-1.5 rounded-lg bg-black/[3%] px-5 py-1 ...">{{- . -}}</span>
{{- end -}}
```

The navigation bar now contains only "About". **The art of writing code is deleting code** — for a minimalist blog, two fewer entry points fit its character better than two extra features.

### 2. Polishing the Details (`assets/custom.css`)

Pure CSS overrides, no build tools introduced:

| Optimization | Implementation |
|:------|:-----|
| **Font stack** | Chinese first: `PingFang SC / Microsoft YaHei / Noto Sans SC`, monospace fallback `JetBrains Mono / SF Mono` |
| **Code blocks** | 10px border radius, light gray background (dark gray in dark mode), thin border, `overflow-x: auto` |
| **Inline code** | Light background + rounded corners + `0.82em` monospace |
| **Slim scrollbar** | Global `6px` width, semi-transparent rounded thumb (WebKit + Firefox `scrollbar-width: thin`) |
| **Links** | Orange underline on body links, darker on hover, `text-underline-offset: 3px` |
| **Blockquotes** | Left orange 3px border + light background, replacing the default unnoticeable style |
| **Tables** | `display: block; overflow-x: auto` to prevent overflow, row hover highlight |
| **Selection color** | `::selection` semi-transparent orange — restrained but with personality |
| **Back to top** | Circular button at the bottom right, fades in after scrolling 400px, turns orange on hover |

### 3. Adding Reading Time to Article Pages (overriding `layouts/_default/single.html`)

I overrode single.html to add a line below the article title in the meta info area:

```go
<span class="dot">&middot;</span>
<span>☕ {{- .ReadingTime -}} min · {{- .WordCount -}} words</span>
```

`ReadingTime` and `WordCount` are Hugo's built-in variables, available at zero cost. Programmers check "how long is this" before reading an article — it's a habit hardwired into our DNA.

### 4. Adding Blogger Info to the Homepage + Back-to-Top in the Footer

- Added `name` / `bio` / `copyright` / `mainSections` to `hugo.toml`. Paper's homepage renders a blogger card (avatar + name + bio) above the article list; it had always been blank because these weren't configured.
- Overrode `footer.html`, adding a back-to-top button and 6 lines of vanilla JS (shows when `scrollY > 400`, `scrollTo({ behavior: 'smooth' })`). No libraries used.

---

## The Programmer's Aesthetic Checklist

The aesthetic direction of this customization can be summarized into a few reusable principles:

1. **Restraint is the most sophisticated design.** If a single CSS property can solve it, never use a component library.
2. **Information density should be high, but with hierarchy.** Reading time, word count, tag counts — give all the data, but use `opacity` and font size to establish hierarchy, so primary and secondary are clearly distinguished.
3. **Monospace fonts are a programmer's romance.** Code blocks and inline code uniformly monospace — one glance and you know "this is code."
4. **Details determine quality.** Slim scrollbars, selection color, link underlines, table hover — each one alone is unremarkable, but together they become "refined."
5. **Rollbackability over showing off.** Using Hugo's override mechanism instead of forking the theme means all customizations are "additive" — if something goes wrong, they can be removed at any time.

---

## Verification

After pushing to GitHub, Actions automatically ran `hugo --minify` and deployed. A few key verification points:

- [x] `/tags/` and `/categories/` removed (HTTP 404), navigation bar contains only "About"
- [x] Article pages display "☕ N min · N words"
- [x] Tags at the bottom of articles are plain text, no 404 dead links
- [x] Code blocks, tables, and scrollbars all work correctly in dark mode
- [x] No horizontal overflow on mobile

---

## Closing Thoughts

This customization introduced no new dependencies — no theme fork, no component library, no build steps. Just Hugo's built-in override mechanism and a snippet of pure CSS. **The best customization is one you don't notice**: it simply makes the blog feel more like what it "ought to be."

If you're also using Hugo + Paper, I hope this gives you some inspiration. The full code is at <https://github.com/nova02640/nova02640.github.io> — feel free to take a look.
