---
title: "从 Hugo 到 Hexo + Butterfly：一次以主题为准的彻底迁移"
date: 2026-08-19 00:00:00
description: "我的博客主题又换了一次：从自研的 Hugo Lumen 主题，迁移到社区流行的 Hexo Butterfly。这次不是小修小补，而是连框架一起换了。记录这次完整迁移：为什么换、怎么换、踩了哪些坑。"
tags: ["博客", "Hexo", "Butterfly", "迁移"]
categories: ["技术"]
cover: /img/covers/migrating-to-hexo-butterfly.jpg
---

## 缘起：想看看社区的主流答案

我的博客主题换过好几轮了：最早是 Hugo Paper，后来嫌重换到 Bear Blog 的极简风，再后来按捺不住折腾心，自己写了一个 Lumen 主题，还整理成标准主题仓库发布了出去。

自研主题确实有成就感，但时间长了也有它的困扰：功能要自己写、样式要自己调、文档要自己维护。虽然 Lumen 已经做到明暗双主题、全文搜索、PWA，但每次看到社区那些成熟主题的演示站，还是会心动——人家的功能清单一拉一大串，而且经过了大量真实用户的检验。

直到我看到 **Hexo Butterfly** 的 demo。卡片式布局、暗色模式、侧边栏、繁简切换……第一眼就知道：就是它了。

## 调研：这不是换主题，是换框架

Butterfly 是 Hexo 生态最流行的主题之一（GitHub 8.3k star、Apache-2.0、持续活跃维护），中文文档非常齐全。

但这里有个关键认知要先想清楚：**Hugo 和 Hexo 是两个完全不同的静态站点生成器**。换 Butterfly 意味着整个博客框架都要从 Hugo（Go 语言、单二进制）切到 Hexo（Node.js、npm 生态），不是改个配置那么简单。

好在盘点了一下我的博客现状，发现迁移阻力比想象中小得多：

| 项目 | 现状 | 影响 |
|---|---|---|
| 文章内容 | 10 篇纯 Markdown | 几乎零改动 |
| shortcode / 图片 / 静态资源 | 都没有 | 零障碍 |
| front matter | title/date/tags/categories | 与 Hexo 基本兼容 |
| URL 结构 | `/:slug/` | 可以完全保持 |

文章内容是纯 Markdown，没有用 Hugo 的任何专属语法——这大概是当初写文章时"克制"带来的红利。

## 迁移过程

### 1. 内容迁移：最顺利的一步

把 10 篇文章从 `content/blog/` 搬到 `source/_posts/`，front matter 做三个小调整：

- **删掉 `slug` 字段**：Hexo 用文件名作为 URL，没有 slug 概念
- **date 补上时间**：`2026-08-11` → `2026-08-11 00:00:00`
- **加上 `cover` 字段**：指向配图，首页卡片就会显示封面

正文一个字符都没动。

这里有个小坑差点丢链接：`migration-to-bear-blog.md` 这个文件名和它 front matter 里的 slug（`migrating-from-paper-to-hugo-bear-blog`）不一致，而 Hugo 的 URL 用的是 slug。迁移时必须把文件重命名为 slug 的名字，否则旧链接就 404 了。

### 2. URL 结构：保持不变

Hugo 原来的 URL 是 `https://nova02640.github.io/<slug>/`。Hexo 里只要配置一行：

```yaml
permalink: :slug/
```

旧链接就全部保住了——搜索引擎收录、别人分享的链接都不会失效。

### 3. 页面重建：跟着 Butterfly 的规矩来

Butterfly 的标签页、分类页、友链页有自己的一套创建方式，需要建对应的页面文件并声明 `type`：

```yaml
---
title: 标签
date: 2026-08-19 00:00:00
type: tags
---
```

关于页也借这次机会重写了一遍：中文自我介绍、博客定位、联系方式，外加一版更简洁的 CC BY-NC-SA 版权声明。

### 4. 功能配置：全面启用

Butterfly 的功能配置集中在 `_config.butterfly.yml`（从主题目录复制到站点根目录覆盖）。这次迁移的原则是"以主题为准、能开的都开"：

- **暗色模式**：跟随系统自动切换
- **本地搜索**：预载搜索索引，输入即出结果
- **卡片式首页**：封面图左右交替
- **TOC 目录** + **字数统计** + **阅读时间**
- **相关文章推荐**：按标签匹配
- **繁简中文切换**（对中文读者很实用）
- **侧边栏**：作者卡、公告栏、最近文章、分类、标签
- **内置 404 页**
- 打字机副标题、公告栏、版权块……

评论系统暂时没开（需要配置 Giscus），留作以后的选项。

### 5. 配图：每篇文章都有自己的封面

Butterfly 的首页文章列表有封面图，比纯文字好看太多。我按每篇文章的主题，从 Wikimedia Commons 找自由版权图片，下载到本地 `source/img/covers/`：

- 传奇 MMORPG 那篇 → 像素风游戏画面
- mihomo 代理部署 → 服务器机房
- 面朝烟火静对人海 → 海上烟花
- 幸福的诅咒 → 日落火车站
- 主题定制那篇 → ColorBrewer 色板

封面存本地而不是外链图床，不会出现图挂了的情况。

### 6. 部署：GitHub Actions 重写

原来的 workflow 是 Hugo 的构建流程，现在换成：

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

Pages 还是原来的 workflow 模式，push 到 main 自动构建部署，流程上没变化。

## 踩坑记录

1. **npm 版本号坑**：`hexo-generator-feed` 写 `^3.1.0` 报 ETARGET，一查实际最新是 4.0.0；`hexo-generator-search` 同理。装包前先 `npm view <包名> version` 确认。
2. **字数统计需要额外插件**：Butterfly 的 wordcount 功能依赖 `hexo-wordcount`，忘了装的话字数显示不出来。
3. **主题版本固化**：git clone 主题到 `themes/butterfly` 后删掉里面的 `.git`，让它随博客仓库提交。这样 CI 不需要处理 submodule，版本也锁定，升级时重新 clone 替换即可。
4. **本地构建需要 Node**：NAS 上装的是 Node 24，直接 `npx hexo generate` 就能预览，构建 84 个文件约 8 秒。

## 最终效果

迁移完成后，本地构建零错误，线上 19 个 URL 全部 200（10 篇文章 + 5 个页面 + 3 个资源文件 + 首页），404 页、搜索、暗色模式、相关文章推荐都实测生效。

最直观的感受是：**文章列表好看了**。以前是清一色的文字条目，现在每篇文章都有贴合主题的封面图，整个首页像一本杂志。

## 一些体会

- **自研 vs 用社区方案**：自研主题的过程很值得（我到现在还留着 Lumen 仓库），但如果目标是"好好写博客"，成熟主题的效率确实高得多。自己写功能 = 把时间花在轮子上；用 Butterfly = 把时间花在文章上。
- **内容要克制**：这次迁移最省力的地方，就是当初写文章没用任何框架专属语法。纯 Markdown + 简单 front matter，走到哪里都畅通。
- **换框架没那么可怕**：核心资产是文章内容，框架只是渲染工具。只要 URL 结构保持住，换多少次框架旧链接都还在。

现在这个站跑在 Hexo + Butterfly 上，就是你现在看到的样子。如果你也在犹豫要不要换，我的建议是：先看看 Butterfly 的 demo 站，心动了就迁吧，成本比想象中低。🦋
