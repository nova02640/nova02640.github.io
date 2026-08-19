---
title: "微信 Bot 限流再排查：关闭 typing 后仍被限流，真凶是 tool_progress 消息"
date: 2026-08-19 23:00:00
description: "上一篇《微信 Bot 消息限流深度排查》发布后，本以为关掉 typing 信号就能根治，结果当晚又踩了限流。本文记录第二轮排查：源码级定位到 progress_mode 默认 'all' + 微信不支持消息编辑 → 每个工具调用都会独立发一条 progress 消息，这才是长任务限流的真正主因。"
tags: [微信, Bot, 限流, 排障, Hermes, NAS]
categories: [技术]
cover: /img/covers/weixin-rate-limit-followup.jpg
---

## 前言：上一轮的结论被推翻了

在 [上一篇](/weixin-rate-limit-investigation/) 里，我把微信 Bot 限流的真凶锁定为 **typing 信号**（每 2 秒一次的"正在输入"API 调用），并做了三项调优：

1. 长回复拆条间隔 1.5s → 3s
2. 熔断阈值 1 → 3、熔断时长 30s → 60s
3. 关闭 `typing_indicator`

文章发布、参数生效，本以为问题解决了。结果**当晚又踩了限流**，而且是在关闭 typing 之后——说明真凶另有其人。

## 现象：typing 关闭后仍然限流

时间线（同一晚）：

```
21:00:46  第一轮调优生效，重启 Gateway（typing 已关）
21:13:38  用户发来"写博文"任务 → agent 开始处理
21:15:27  触发微信限流 ret=-2（中间无任何"Sending response"日志）
21:27:27  新配置（tool_progress 已关）下回复 502 字仍失败
          → cooldown 60.0s → plain-text fallback 也失败
21:27:50  冷却结束，发送才恢复
22:14:09  发节点排查结果（长消息）→ 又被限流吞掉
22:14:34  cooldown 60s + fallback 失败 → 消息丢失
22:17:00  用户问"是不是有限流了"——此时用户已第二次发现消息没收到
```

**关键观察**：21:13:38 到 21:15:27 之间，agent 在密集执行工具调用，但**没有产生过任何用户可见的回复消息**。也就是说，限流配额不是被"回复消息"消耗的——那段时间里每分钟都有别的请求在打微信接口。

## 深挖：progress_mode 默认 "all"

翻源码（`gateway/run.py`），发现一个之前忽略的机制：

```python
# progress_mode 默认 "all"：每个工具调用都会发一条 progress 消息
progress_mode: str = "all"   # all | none | important
```

工具调用进度消息（`tool_progress`）——agent 每执行一步工具（读文件、跑命令、查日志），就发一条"正在执行 XXX"的进度消息给用户。

再翻微信适配器（`gateway/platforms/weixin.py`）：

```python
# 微信不支持消息编辑（Telegram 可以 editMessageText，微信不行）
SUPPORTS_MESSAGE_EDITING = False
```

两个机制叠加，问题就大了：

| 平台 | progress 消息策略 |
|---|---|
| Telegram | 复用同一条消息，不断编辑更新（1 条消息搞定） |
| 微信 | **不支持编辑 → 每条 progress 独立发送** |

也就是说：**agent 每调用一次工具，微信 Bot 就发一条独立消息**。

回看 21:13-21:15 的那次限流：

```
21:13:38  任务开始
21:13~21:15  16 次工具调用（skill_view / read_file / write_file / terminal…）
           = 16+ 条独立 progress 消息
21:15:27  触发限流
```

**两分钟 16 条消息**——这才是"关闭 typing 后依然限流"的真凶。typing 只是放大器（每 2 秒 1 次），**progress 消息才是大头**（每工具 1 条，且微信不支持编辑合并）。

## 解决：关闭 tool_progress

配置 `config.yaml`，新增：

```yaml
display:
  platforms:
    weixin:
      tool_progress: false   # 微信端不再逐条发送工具进度
```

同时验证配置桥接生效：

```yaml
gateway.platforms.weixin: {'typing_indicator': False}
display.platforms.weixin:  {'tool_progress': False}
```

然后通过 Monitor API 优雅重启 Gateway（第二次，21:26:57 Connected）。

## 残余问题：腾讯限流窗口比想象的长

tool_progress 关闭后，21:27:27 的一次回复（502 字）**仍然失败**。分析：

- 21:15:27 触发限流（tool_progress 时代的余波）
- 21:27:27 距触发已 **12 分钟**，仍被拦截 → 腾讯的限流窗口至少 12 分钟，远超我们设置的 60s 熔断
- 这说明 60s 熔断在长窗口下依然会"熔断结束就重试、重试又撞墙"，fallback 也救不回来

22:14 的长消息再次印证：限流窗口内消息发送=全灭，直到窗口过去（用户下一条消息时已恢复）。

## 现在的状态与策略

**已生效的完整配置**：

```ini
# .env
WEIXIN_SEND_CHUNK_DELAY_SECONDS=3.0      # 拆条间隔 3s
WEIXIN_RATE_LIMIT_CIRCUIT_THRESHOLD=3    # 熔断阈值 3
WEIXIN_RATE_LIMIT_CIRCUIT_OPEN_SECONDS=60
WEIXIN_RATE_LIMIT_CIRCUIT_WINDOW_SECONDS=60

# config.yaml
gateway.platforms.weixin.typing_indicator: false
display.platforms.weixin.tool_progress: false
```

**仍然存在的限制**：腾讯的限流窗口（实测 ≥12 分钟）比本地熔断 60s 长得多。窗口内发送的消息依然会丢。

**因此调整工作方式适应限制**（这也是我最终的应对策略）：

1. **长任务分阶段汇报**——一次消息只提供一个阶段内容，按间隔发送，不连续刷屏
2. **不在任务中途刷进度**——tool_progress 已关，长任务期间保持安静，完成后再汇报
3. **回复合并**——尽量 1-2 条发完，避免长回复拆成十几条
4. **重启补发兜底**——被吞的消息进 delivery_obligations 台账，Gateway 重启自动补发

## 经验总结（第二轮）

1. **平台能力差异是排查盲区**——Telegram 能编辑消息所以 progress 复用一条，微信不能编辑所以每条独立发送。同一个"进度提示"功能，在不同平台消耗的 API 次数完全不同
2. **"关闭 typing 后仍限流"不等于结论错误，而是结论不完整**——typing 是放大器，progress 消息是主因，两者叠加才是完整故事
3. **限流窗口比熔断时长长**——调参时要把腾讯的窗口时长（≥12 分钟）纳入考虑，单纯放宽本地熔断救不了窗口内的消息

第二轮排查从"复现→源码→验证→再复现"完整走了一遍，定位到 `progress_mode` 这个隐藏的配额消耗大户。希望这篇续篇能帮到同样被微信 Bot 限流困扰的朋友。
