---
title: 'From Hugo to Hexo + Butterfly: A Complete Theme-First Migration'
date: 2026-08-19 00:00:00
description: 'I swapped my blog theme yet again: from my own Hugo Lumen theme to the
  community-favorite Hexo Butterfly. This wasn''t a minor tweak—I replaced the framework
  along with it. Here''s the full migration: why I switched, how I did it, and the
  pitfalls I hit.'
tags:
- Blog
- Hexo
- Butterfly
- Migration
categories:
- Tech
cover: /img/covers/migrating-to-hexo-butterfly.jpg
lang: en
layout: post
---


## Origin: Wanting to See What the Community Recommends

My blog theme has gone through several rounds already: it started with Hugo Paper, then I found it too heavy and switched to Bear Blog's minimalist style; later, unable to resist my tinkering urge, I wrote a Lumen theme myself and even packaged it as a standard theme repository and released it.

Self-made themes are certainly rewarding, but over time they bring their own troubles: you have to write the features yourself, tune the styles yourself, maintain the documentation yourself. Lumen already had light/dark themes, full-text search, and PWA support, yet every time I saw the demo sites of those mature community themes I couldn't help but feel tempted — their feature lists go on and on, and they've been battle-tested by a huge number of real users.

Until I saw the **Hexo Butterfly** demo. Card-style layout, dark mode, sidebar, Traditional/Simplified Chinese switching… one look and I knew: this is the one.

## Research: This Isn't Just Swapping Themes, It's Swapping Frameworks

Butterfly is one of the most popular themes in the Hexo ecosystem (8.3k GitHub stars, Apache-2.0, actively maintained) with very complete Chinese documentation.

But there's a key realization to make first: **Hugo and Hexo are two completely different static site generators.** Switching to Butterfly means moving the entire blog framework from Hugo (Go, single binary) to Hexo (Node.js, npm ecosystem) — not just a config change.

Fortunately, after taking stock of my blog's current state, I found the migration阻力 was far smaller than expected:

| Item | Current State | Impact |
|---|---|---|
| Post content | 10 pure Markdown posts | Almost zero changes |
| shortcodes / images / static assets | None | Zero obstacles |
| front matter | title/date/tags/categories | Basically compatible with Hexo |
| URL structure | `/:slug/` | Can be kept exactly as-is |

The post content is pure Markdown with none of Hugo's proprietary syntax — probably the dividend of having been "restrained" when writing posts in the first place.

## Migration Process

### 1. Content Migration: The Smoothest Step

Moving the 10 posts from `content/blog/` to `source/_posts/`, with three small front matter adjustments:

- **Remove the `slug` field**: Hexo uses the filename as the URL; there's no slug concept
- **Add a time to `date`**: `2026-08-11` → `2026-08-11 00:00:00`
- **Add a `cover` field**: pointing to the image, so homepage cards show a cover

Not a single character of the body text was touched.

Here's a small trap that nearly broke a link: the filename `migration-to-bear-blog.md` didn't match the slug in its front matter (`migrating-from-paper-to-hugo-bear-blog`), while Hugo's URL used the slug. During migration I had to rename the file to match the slug, otherwise the old link would 404.

### 2. URL Structure: Kept Unchanged

Hugo's original URL was `https://nova02640.github.io/<slug>/`. In Hexo, one line of config does it:

```yaml
permalink: :slug/
```

All old links are preserved — search engine indexes and shared links won't break.

### 3. Page Rebuild: Following Butterfly's Rules

Butterfly's tags page, categories page, and friends-link page each have their own creation method, requiring corresponding page files that declare `type`:

```yaml
---
title: 标签
date: 2026-08-19 00:00:00
type: tags
---
```

I also took the opportunity to rewrite the About page: a Chinese self-introduction, blog positioning, contact info, plus a more concise CC BY-NC-SA copyright notice.

### 4. Feature Configuration: Everything Enabled

Butterfly's feature configuration lives in `_config.butterfly.yml` (copied from the theme directory to the site root to override). The principle for this migration was "let the theme lead, enable everything possible":

- **Dark mode**: auto-switches with the system
- **Local search**: preloaded search index, results appear as you type
- **Card-style homepage**: cover images alternating left and right
- **TOC** + **word count** + **reading time**
- **Related posts**: matched by tags
- **Traditional/Simplified Chinese switching** (very useful for Chinese readers)
- **Sidebar**: author card, announcement bar, recent posts, categories, tags
- **Built-in 404 page**
- Typewriter subtitle, announcement bar, copyright block…

Comments system left off for now (requires Giscus configuration), saved as a future option.

### 5. Cover Images: Every Post Gets Its Own

Butterfly's homepage post list shows cover images, which look far better than plain text. For each post's theme, I found freely licensed images on Wikimedia Commons and downloaded them to local `source/img/covers/`:

- The legendary MMORPG post → pixel-art game screen
- mihomo proxy deployment → server room
- 面朝烟火静对人海 (Facing Fireworks, Calm Before the Crowd) → fireworks over the sea
- 幸福的诅咒 (The Curse of Happiness) → sunset train station
- The theme customization post → ColorBrewer palette

Covers are stored locally rather than on an external image host, so broken images won't happen.

### 6. Deployment: Rewriting the GitHub Actions Workflow

The original workflow was Hugo's build process; now it's replaced with:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npx hexo clean && npx hexo generate
- uses: actions/upload-pages-artifact@v3
- uses: actions/deploy-pages@v4
```

Pages still uses the original workflow mode — push to main triggers automatic build and deploy, so the process itself hasn't changed.

## Pitfall Log

1. **npm version traps**: `hexo-generator-feed` with `^3.1.0` threw ETARGET; a quick check showed the actual latest was 4.0.0; same for `hexo-generator-search`. Before installing, run `npm view <package> version` to confirm.
2. **Word count requires an extra plugin**: Butterfly's wordcount feature depends on `hexo-wordcount`; forget to install it and the word count won't display.
3. **Pinning the theme version**: after `git clone` the theme into `themes/butterfly`, delete the `.git` inside so it's committed along with the blog repo. This way CI doesn't have to deal with submodules, the version is locked, and upgrades just mean re-cloning and replacing.
4. **Local builds need Node**: my NAS has Node 24 installed, so `npx hexo generate` works directly for preview; building 84 files takes about 8 seconds.

## Final Result

After the migration, the local build has zero errors, and all 19 online URLs return 200 (10 posts + 5 pages + 3 asset files + homepage). The 404 page, search, dark mode, and related posts recommendations were all verified working.

The most immediate impression: **the post list looks good now.** It used to be a wall of plain text entries; now every post has a cover image matching its theme, and the whole homepage looks like a magazine.

## Some Takeaways

- **Self-built vs. community solution**: The process of building a theme yourself is very worthwhile (I still keep the Lumen repo), but if the goal is "write a good blog," mature themes are genuinely far more efficient. Writing features yourself = spending time on the wheel; using Butterfly = spending time on your posts.
- **Stay restrained with content**: The easiest part of this migration was that I used no framework-specific syntax when writing posts. Pure Markdown + simple front matter works anywhere.
- **Swapping frameworks isn't that scary**: Your core asset is the content; the framework is just a rendering tool. As long as the URL structure holds, you can swap frameworks as many times as you like and the old links will still be there.

The site now runs on Hexo + Butterfly, and this is what you see. If you're also hesitating about switching, my advice: check out the Butterfly demo site first — if it speaks to you, go ahead and migrate; the cost is lower than you'd think. 🦋
