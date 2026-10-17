---
title: 'A Geek-Style Overhaul of My Blog: Three Critical Flaws Hidden for Over a Month,
  and Two Conclusions Overturned'
date: 2026-10-02 23:30:00
description: 'It started with just wanting to swap the homepage image and simplify
  my bio. But in the survey phase, I uncovered three flaws that had been hidden for
  over a month: the avatar was never mine, the favicon has been 404ing in production
  all along, and the sidebar announcement was stuck on migration day. This post records
  every detail of the overhaul — three rendering pitfalls hit while generating the
  cover, two conclusions overturned by actual tests, and how to confirm whether giscus
  is really installed when GitHub provides no API for it.'
tags:
- Hexo
- Butterfly
- Blog
- Theme Customization
- GitHub Pages
- Dev Notes
categories:
- Tech
cover: /img/covers/blog-geek-refresh.jpg
lang: en
layout: post
---


It started simply enough: the blog had been running for a while, and I wanted to replace the purple-blue gradient striped image on the homepage — it looked too much like a "design template," not something you'd expect from someone who writes code every day. I also wanted to simplify the bio on the About page.

I handed these two tasks to my AI assistant to implement, and casually asked it to brainstorm what else could be improved. It first did a round of surveying, then told me: **the two things you asked for are actually not the most urgent.**

## I. Three Critical Flaws Uncovered by the Survey

**Flaw #1: My avatar is someone else's logo.**

I had never paid much attention to the avatar in the sidebar. Only when I opened the source file did I see clearly — it's a pink letter "B," a **leftover image carried over from the old site** when I migrated from Bear Blog over three months ago. In other words, this blog had been sporting someone else's logo for over a month.

**Flaw #2: The favicon has been 404ing in production all along.**

The config says `favicon: /img/favicon.png`, but that file **doesn't exist in the source repository at all**. So the browser tab has been showing a blank white page. This one is especially easy to verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://你的站/img/favicon.png
# 404
```

The config can point to a non-existent path, and the build still goes all green — this is a classic case of "build success ≠ content correctness."

**Flaw #3: The sidebar announcement was still stuck on migration day.**

The announcement read "🎉 The blog has migrated to the Butterfly theme — try the light/dark toggle and local search in the top right." The migration happened over a month ago; that message was long overdue for retirement.

## II. The Homepage Cover: A "Programmer's" Cover Image and Three Rendering Pitfalls

The new cover is an original image generated locally with PIL (1920×1080, about 95 KB). It depicts a dark editor window: syntax-highlighted code, a file tree on the right (with **real article filenames from this blog**), and a status bar at the bottom.

The middle area required special treatment — Butterfly's homepage title is **overlaid dead center on the cover**, so the middle of the cover must be dark, otherwise white text on top of code would be unreadable.

### Pitfall #1: A circular vignette leaves a black blob right in the center

The first version used a standard elliptical vignette (dark center, bright edges). The result: a **visibly black blob** right in the middle of the image — the radius was too small and the falloff too steep, so the light-dark transition turned into a "hole" at the center.

I changed it to a soft darkening **only in the vertical direction** (completely uniform horizontally), and the artifact disappeared. The principle is simple: the title is horizontally centered, so what needs protecting is a horizontal band, not a circle.

### Pitfall #2: When a monospace font is missing a glyph, it doesn't error — it just draws an empty box

Mixed Chinese-English typesetting requires **per-character** font selection: the Chinese font (Droid Sans Fallback) has no Latin glyphs, and the monospace font (Hack) has no CJK glyphs — each one renders the other's characters as blocks.

The more insidious issue is the second one: Hack **does not have the `✓` glyph**. When a glyph is missing, the font engine doesn't raise an error — it just draws a hollow box (tofu). The composite image's thumbnail looked completely fine; it was only when I zoomed into the status bar line that I saw "✓ 0 problems" had become "▯ 0 problems".

The solution is to **detect first, then fall back**: extract the font's `.notdef` bitmap fingerprint using private use codepoint `U+E000`, compare each glyph against it, and if a glyph matches notdef, it's missing — automatically falling back to DejaVu.

### Pitfall #3: The avatar is circle-cropped

My first version drew engineering-style corner marks at the four corners of the avatar — wasted effort, because the avatar is `border-radius: 50%` on the page, so the corners get clipped anyway.

### A bonus one: when swapping the cover, always change the filename

`url_for` doesn't append a version parameter to images, so overwriting with the same filename means GitHub Pages / the CDN will keep serving the old image. That's why the new image is called `banner-dev.jpg` instead of overwriting `banner.jpg`.

## III. Two Conclusions Overturned by Actual Testing

The most interesting part of this overhaul: **two judgments that "seemed perfectly reasonable" got overturned by actual tests and reading the source code.**

### Overturned #1: jsdelivr is unusable in China

Before the overhaul, I had listed a suggestion: replace the third-party CDN from jsdelivr, on the grounds that "access from within China is unstable."

Testing proved me wrong. First, I pulled the three dependencies this site **actually uses**:

```bash
for u in typed.js@3.0.0/dist/typed.umd.min.js \
         "@fortawesome/fontawesome-free@7.3.1/css/all.min.css" \
         "@egjs/infinitegrid@4.13.0/dist/infinitegrid.min.js"; do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" "https://cdn.jsdelivr.net/npm/$u"
done
# 200 1.05s / 200 0.6s / 200 0.9s
```

All 200, around one second each. **Don't change configs based on stereotypes — curl it first.** I retracted this conclusion on the spot.

(As an aside, in my second test above I initially wrote the path wrong — `typed.js@2.0.12/dist/typed.min.js` returned 404. The same "404" could be a typo'd path or a blocked network — **don't jump to conclusions**.)

### Overturned #2: Masonry layout has higher information density

I had originally suggested switching the homepage from the "alternating left-right cards" layout (`index_layout: 3`) to masonry (`6/7`), and the reasoning sounded plausible: a mosaic layout, higher density.

When I went into the theme's source code, I found two things:

1. **The theme itself has no masonry CSS at all.** The layout is computed at runtime by an `@egjs/infinitegrid` script loaded from a CDN. If a visitor's network can't fetch that script, the homepage cards go completely misaligned.
2. **Masonry only displays the cover and title, discarding the summary text.** The current layout is "title + date + category + tags + excerpt" — which actually contains **more** information.

So the "higher density" judgment was wrong, and it would have introduced an unnecessary runtime external dependency to the homepage. Keeping the original layout.

## IV. Other Changes

- **Code blocks**: `light` → `darker`, plus the Mac-style three dots. Code makes up a large share of a tech blog's body content, so this matters more to the overall look than the cover.
- **Theme color**: Replaced the theme's default sky blue; the palette is aligned to the new cover. Also set `meta_theme_color_light/dark` so the mobile browser's address bar color follows the site.
- **Fixed navbar**: Easy jumping to any section while scrolling long posts.
- **Subtitle**: One line → a three-line carousel.

### About page: The bio can be shortened, the legal terms cannot

The bio was compressed to three paragraphs as planned. But the **copyright notice got sent back for a redo** — I had casually squeezed the eight-line terms into a single line in my first version, and was asked to restore the full version, especially this clause:

> If you believe the content on this site infringes your rights, please contact me at `nova_work@foxmail.com`. I will handle it promptly after verification.

The lesson is clear: **"trimming copy" should only touch narrative content. Legal texts like copyright, disclaimers, and infringement notices should be kept verbatim by default.** Before revamping a page, ask yourself: is what I'm deleting a bio, or a disclaimer?

## V. Comment Section: giscus, and "How to Confirm the App Is Really Installed"

The comment section uses giscus — it runs on GitHub Discussions, requires no server, visitors comment by logging in with their GitHub account, and replies sync to the repository's discussions.

But there's a prerequisite: **the giscus App must be installed on the repository first**, otherwise article pages will show an error box reading "giscus is not installed on this repository." So at first I didn't dare flip the switch on — better to show nothing than to show visitors an error.

The question then: **how do you confirm whether the App is actually installed?** All three routes are dead ends:

- `GET /repos/{owner}/{repo}/installation` — requires the GitHub App's own JWT; a personal token can't call it
- `GET /user/installations` — requires an App-authorized token; also can't be called
- Checking the repository's collaborators / assignees — **`giscus[bot]` won't be there.** Installing a GitHub App on a repository doesn't create a collaborator, so this check neither proves it's installed nor that it isn't

The method that finally worked was **asking giscus's own backend directly**, building a request against the endpoint its widget actually calls:

```bash
curl -s "https://giscus.app/api/discussions?repo={owner}/{repo}&term=/some-path/&category={category_id}&first=10&reactionsEnabled=1&emitMetadata=0&theme=light&lang=zh-CN"
# 未安装 → 安装/权限类错误
# 已安装 → {"error":"Discussion not found"}   ← 能访问仓库、只是还没有讨论帖（正常）
```

A "discussion not found" response means the App can already access this repository. Only after seeing this result did I dare enable `comments.use`.

Incidentally, here's how to get the IDs: use GraphQL to query `repository.id` for `repo_id`, then pick `Announcements` from `discussionCategories` to get `category_id`; the repository must first have `has_discussions` enabled via `PATCH repos/{owner}/{repo}`.

## VI. Verification: Green Build ≠ Correct Content

After finishing, I went through everything item by item. A few lessons worth recording:

- **Compare sha256 for large files.** GitHub Pages has propagation delay — fetching right at the moment of a successful deploy may get you a half-written file. The same image of a few hundred KB can return several different sizes across repeated fetches. **Wait ten-plus seconds and re-fetch 2–3 times; only hashes count.**
- **If a single request returns 000 / connection reset, don't report an outage yet** — that's CDN jitter. Retry two or three times before deciding.
- **Config changes must be verified in the build output** — don't trust the config file. For example, the way to verify `nav.fixed: true` isn't the `<nav>` tag at all — its output is **a `fixed` class on the page header**. Looking at the wrong place would make you think it didn't take effect.

## VII. Summary

The real takeaway from this overhaul wasn't that cover image, but three things:

1. **Survey first, then act.** Both of my original requests were fulfilled, but the three flaws uncovered along the way (avatar, favicon, stale announcement) were more worth fixing than the original requests — they had been broken for over a month, and no one was going to tell you.
2. **Actual testing beats experience.** "jsdelivr is unstable in China" and "masonry has higher density" both sounded right, but both were overturned after real tests and reading the source code. The first was a stereotype; the second was my own assumption.
3. **"The config is written" ≠ "the config is in effect."** The favicon points to a nonexistent file; `nav.fixed`'s output lives on a different tag; whether giscus's App is installed can't be checked via any official API — the common thread among these three: **you have to go verify them; you can't rely on reading the config.**

The overhauled site is here: **https://nova02640.github.io/** — the comment section works too; come leave the first one.
