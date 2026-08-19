# nova02640's Blog

> 🦋 记录编程、技术、游戏开发与生活随笔

个人博客源码仓库，基于 **Hexo 8** + **hexo-theme-butterfly**，部署在 GitHub Pages。

线上地址：<https://nova02640.github.io/>

## 技术栈

| 组件 | 版本/说明 |
|---|---|
| 框架 | Hexo 8（Node.js） |
| 主题 | [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) 5.7（master 固化，随仓库提交） |
| 部署 | GitHub Pages + GitHub Actions（`push main` 自动构建） |
| 插件 | hexo-generator-search（本地搜索）、hexo-generator-feed（RSS）、hexo-wordcount（字数统计）、hexo-generator-sitemap |

## 目录结构

```
.
├── _config.yml               # Hexo 主配置（url、permalink、语言等）
├── _config.butterfly.yml     # Butterfly 主题配置（功能开关、菜单、社交、侧边栏）
├── package.json              # 依赖清单
├── scaffolds/                # 新建文章/页面模板
├── source/
│   ├── _posts/               # 文章（文件名 = URL slug）
│   ├── _data/link.yml        # 友链数据（butterfly 格式）
│   ├── about/                # 关于页
│   ├── tags/                 # 标签页（type: tags）
│   ├── categories/           # 分类页（type: categories）
│   ├── link/                 # 友链页（type: link）
│   └── img/                  # 站点图片（covers/ 为文章封面）
├── themes/butterfly/         # 主题源码（克隆后删除 .git 固化）
└── .github/workflows/deploy.yml  # GitHub Actions 部署
```

## 本地开发

需要 Node.js 18+（本仓库在 Node 22/24 下验证）。

```bash
npm install          # 安装依赖
npx hexo server      # 本地预览 http://localhost:4000
npx hexo generate    # 构建到 public/
npx hexo clean       # 清理构建缓存
```

## 发布文章

1. 在 `source/_posts/` 新建 `<english-slug>.md`（**文件名即 URL**，如 `my-new-post.md` → `/my-new-post/`）
2. front matter 格式：

```yaml
---
title: "文章标题"
date: 2026-08-19 00:00:00
description: "一句话摘要（首页卡片显示）"
tags: ["标签1", "标签2"]
categories: ["分类"]           # 可选
cover: /img/covers/my-new-post.jpg   # 可选，配封面图
---
```

3. 提交推送：`git add` → `git commit` → `git push origin main`
4. GitHub Actions 自动构建部署，约 1~2 分钟后生效

## 配置速查

- **站点信息**：`_config.yml`（title、url、language）
- **主题功能**：`_config.butterfly.yml`（菜单 menu、社交 social、暗色 darkmode、搜索 search、侧边栏 aside、评论 comments 等）
- **友链**：编辑 `source/_data/link.yml`
- **评论**：在 `_config.butterfly.yml` 的 `comments.use` 配置（支持 Giscus/Twikoo 等）

## 许可

- 文章内容：CC BY-NC-SA 4.0（见 [关于页](https://nova02640.github.io/about/)）
- 文章封面图：来自 Wikimedia Commons，版权见各图来源
- 主题：Apache-2.0（[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)）

## 历史

- 2026-08-19：从 Hugo（自研 Lumen 主题）迁移至 Hexo + Butterfly
- 迁移前后文章 URL 保持 `/:slug/` 不变

---

*README 最后更新：2026-08-19*
