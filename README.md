# nova02640's Blog 🚀

个人博客，使用 [Hugo](https://gohugo.io/) + [Paper](https://github.com/nanxiaobei/hugo-paper) 主题搭建。

## 技术栈

| 组件 | 说明 |
|:----|:------|
| **框架** | Hugo v0.164.0 (Extended) |
| **主题** | [Paper](https://github.com/nanxiaobei/hugo-paper) — 极简风格 |
| **托管** | GitHub Pages |
| **CI/CD** | GitHub Actions（`hugo --minify` 自动编译部署） |

## 写文章

在 `content/posts/` 下新建 Markdown 文件：

```markdown
---
title: "文章标题"
date: 2026-07-27
description: "文章描述"
tags: ["标签1", "标签2"]
categories: ["分类"]
draft: false
---

这里是正文，支持标准 Markdown 语法。
```

然后推送即可：

```bash
git add .
git commit -m "新文章：文章标题"
git push
```

GitHub Actions 会自动编译并部署，约 30 秒后生效。

## 本地预览（可选）

NAS 上已安装 Hugo，可在本地预览：

```bash
cd ~/workspace/nova02640.github.io
hugo server -D
```

## 许可

MIT
