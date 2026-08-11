---
title: "从零搭建浏览器传奇类 MMORPG：Phaser 4 + Colyseus 全栈实践"
date: 2026-08-11
description: "记录一个 Web 端传奇类游戏项目的完整开发过程：技术调研、架构设计、核心模块实现、Docker 部署，以及踩过的那些坑。"
slug: "building-mir-web-mmorpg"
tags: ["Web 游戏", "Phaser", "Colyseus", "TypeScript", "Docker"]
categories: ["技术"]
---

## 一、项目背景

这个仓库原本是做家庭体感游戏的，后来决定换一个方向：做一个 **Web 端的传奇类 MMORPG**，浏览器即开即玩，无需下载客户端。

目标很明确：

- 类似传奇私服的 2D 俯视角游戏体验
- 浏览器直接打开就能玩
- 多人在线、实时战斗
- 服务端权威，防作弊
- 一键 Docker 部署

本文记录了从技术调研到 MVP 上线的完整过程。

---

## 二、技术可行性调研

### 2.1 Web 游戏引擎选型

| 引擎 | 优势 | 劣势 | 结论 |
|---|---|---|---|
| **Phaser 4** | 2D 游戏生态成熟、社区活跃、TypeScript 原生支持 | 3D 能力弱 | **采用** |
| PixiJS | 渲染性能极强 | 纯渲染层，需自建游戏框架 | 工作量大 |
| Three.js | 3D 能力强 | 2D 游戏大材小用 | 不适合 |
| Cocos Creator | 国产、文档中文 | 编辑器依赖重，Web 包体大 | 过重 |

Phaser 4 是 2D Web 游戏的成熟选择：场景管理、精灵动画、输入系统、物理引擎开箱即用，且 TypeScript 支持完善。

### 2.2 实时通信方案

| 方案 | 延迟 | 生态 | 结论 |
|---|---|---|---|
| **Colyseus** | 低 | 游戏专用、房间制、状态同步 | **采用** |
| Socket.IO | 中 | 通用聊天级，非游戏优化 | 状态同步需自建 |
| 原生 WebSocket | 最低 | 需从零造轮子 | 开发量大 |

Colyseus 是专为多人游戏设计的 Node.js 框架，核心优势：

- **房间制（Room）**：天然适配游戏副本/地图概念
- **Schema 增量同步**：自动 diff，只发送变化字段，节省带宽
- **权威服务器**：服务端持有真实状态，客户端只收发指令
- **内置 Presence**：支持分布式部署

### 2.3 持久化方案

- **PostgreSQL**：角色数据、装备、背包持久化
- **Redis**：在线状态、排行榜、Colyseus Presence
- **JWT**：无状态认证，前后端分离

### 2.4 最终技术栈

```
客户端:  Phaser 4 + TypeScript + Vite
实时同步: Colyseus（权威服务器 + 增量状态同步）
REST API: Express + JWT
数据库:   PostgreSQL（持久化）+ Redis（缓存/在线状态）
部署:     Docker Compose
```

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────┐
│                  浏览器客户端                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ GameScene │ │ HudScene │ │  UI Panels   │  │
│  │ (Phaser)  │ │ (血蓝条)  │ │ (背包/聊天)   │  │
│  └─────┬────┘ └────┬─────┘ └──────┬───────┘  │
│        └───────────┼──────────────┘          │
│              GameClient (WebSocket)           │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┼────────────┐
          │     REST API (Express)  │  ← 注册/登录/角色管理
          │     Colyseus WebSocket  │  ← 实时游戏同步
          └────────────┬────────────┘
                       │
┌──────────────────────┴───────────────────────┐
│              Colyseus GameRoom                │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Player  │ │ Monster  │ │  ItemDrop     │  │
│  │ State   │ │ System   │ │  System       │  │
│  └─────────┘ └──────────┘ └───────────────┘  │
│  ┌─────────────────────────────────────────┐ │
│  │  A* 寻路 / 战斗系统 / 持久化            │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │   PostgreSQL    Redis     │
          │   (角色数据)    (在线状态)  │
          └──────────────────────────┘
```

### 3.2 服务器权威架构

**核心原则：客户端永远不可信。**

- 移动：客户端发送目标坐标 → 服务端 A* 计算路径 → 服务端推进位置 → 广播
- 攻击：客户端发送攻击指令 → 服务端校验距离/冷却 → 服务端计算伤害 → 广播
- 拾取：客户端发送拾取请求 → 服务端校验距离 → 服务端扣除掉落物 → 广播

客户端只做两件事：**发送指令** 和 **渲染收到的状态**。

### 3.3 状态同步策略

Colyseus Schema 自动增量同步，但我们额外做了：

- **客户端插值**：实体在两个服务端快照间平滑移动，容忍 100ms 延迟
- **AOI 兴趣范围**：只同步视野内（12 格）的实体
- **脏标记持久化**：每 30 秒自动存档变更的角色数据

### 3.4 项目结构（Monorepo）

```
mir-web/
├── shared/              # 前后端共享
│   └── src/
│       ├── types.ts     # 实体/物品/地图类型定义
│       ├── protocol.ts  # 网络协议（消息类型）
│       └── config.ts     # 平衡配置（职业属性、经验公式）
├── server/              # Colyseus 游戏服
│   └── src/
│       ├── game/
│       │   ├── GameRoom.ts       # 房间核心逻辑
│       │   ├── combat/           # 战斗系统
│       │   ├── pathfinding/      # A* 寻路
│       │   ├── systems/          # 怪物 AI 系统
│       │   ├── state/            # Colyseus Schema 状态
│       │   └── data/             # 地图/怪物/物品数据
│       └── auth/                 # JWT 认证 + 角色 API
├── client/              # Phaser 4 前端
│   └── src/
│       ├── scenes/       # Boot/Preload/Login/CharSelect/Game
│       ├── ui/           # HudScene/InventoryPanel/ChatPanel
│       ├── net/          # GameClient（Colyseus 客户端）
│       └── state/        # 本地状态管理
└── docker-compose.yml    # 生产部署编排
```

---

## 四、核心模块实现

### 4.1 瓦片地图

服务端用一维数组存储瓦片（`TileType[]`），客户端根据 `width`/`height` 还原为二维：

```typescript
// 服务端：确定性生成地图（每次启动结果一致）
function generateTiles(): TileType[] {
  const tiles = new Array<TileType>(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      // 边界墙
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        tiles[idx] = TileType.Wall;
        continue;
      }
      // 出生点附近保证为 Floor
      const dx = x - 25, dy = y - 25;
      if (Math.abs(dx) + Math.abs(dy) < 6) {
        tiles[idx] = TileType.Floor;
        continue;
      }
      // 确定性伪随机散布障碍
      const r = pseudoRandom(x, y);
      if (r < 0.08) tiles[idx] = TileType.Tree;
      else if (r < 0.12) tiles[idx] = TileType.Water;
      else tiles[idx] = TileType.Floor;
    }
  }
  return tiles;
}
```

客户端用 Phaser 的 `add.rectangle` 逐格渲染，不同瓦片类型用不同颜色区分。

### 4.2 A* 寻路

8 方向寻路，支持对角线移动：

```typescript
export function findPath(
  tiles: TileType[],
  width: number,
  height: number,
  start: Vec2,
  goal: Vec2,
): Vec2[] {
  // 开放表/关闭表 + 曼哈顿启发式
  // 8 方向邻居，对角线需检查两侧是否可通行
  // ...
}
```

寻路结果缓存在 `MonsterRuntime.path` 中，每 600ms 重新计算一次，避免每帧寻路的性能开销。

### 4.3 怪物 AI

状态机驱动：`idle → aggro → chase → attack → dead → respawn`

```typescript
export function tickMonsters(room: GameRoom, dtMs: number) {
  for (const [monsterId, rt] of room.monsters) {
    const m = rt.state;

    // 死亡状态：等待复活
    if (m.deadAt > 0) {
      if (now - m.deadAt >= rt.template.respawnTime) {
        m.hp = m.maxHp;
        m.position.set(m.spawnPosition.x, m.spawnPosition.y);
      }
      continue;
    }

    // 寻找目标（Chebyshev 距离 < aggroRange）
    if (!rt.targetId) {
      // 扫描视野内最近玩家
    }

    // 追击或攻击
    const dist = chebyshev(target.position, m.position);
    if (dist > aggroRange + 4) {
      // 超出追击范围，返回出生点
    } else if (dist <= attackRange) {
      // 攻击（受 attackInterval 限速）
    } else {
      // 追击（周期性重算路径）
    }
  }
}
```

### 4.4 战斗系统

```typescript
export function calcDamage(
  attacker: CombatActor,
  defender: CombatActor,
  options: { type: 'physical' | 'magical' },
): { hit: boolean; amount: number; crit: boolean } {
  const hit = Math.random() * 100 < attacker.stats.accuracy;
  if (!hit) return { hit: false, amount: 0, crit: false };

  const atk = options.type === 'physical'
    ? attacker.stats.attack
    : attacker.stats.magicAttack;
  const def = options.type === 'physical'
    ? defender.stats.defense
    : defender.stats.magicDefense;

  const base = Math.max(1, atk - def * 0.5);
  const variance = base * (0.8 + Math.random() * 0.4);
  const crit = Math.random() < attacker.stats.critRate;
  const amount = Math.floor(crit ? variance * attacker.stats.critDamage : variance);

  return { hit: true, amount, crit };
}
```

### 4.5 客户端插值

```typescript
// GameScene.update()
for (const view of this.entities.values()) {
  const dx = view.targetX - view.container.x;
  const dy = view.targetY - view.container.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const speed = 0.15; // 插值速度
    view.container.x += dx * speed;
    view.container.y += dy * speed;
  }
}
```

这让实体在两个服务端快照之间平滑移动，即使有 100ms 的网络延迟也不会瞬移。

### 4.6 持久化

角色数据在三个时机保存：

1. **定时存档**：每 30 秒自动保存脏数据
2. **退出存档**：玩家断开连接时立即保存
3. **关键事件**：升级、死亡、拾取装备后立即保存

```typescript
async function savePlayer(room: GameRoom, playerId: string) {
  const pd = room.players.get(playerId);
  if (!pd || !pd.data.dirty) return;

  await persistCharacter(pd.data);
  pd.data.dirty = false;
}
```

---

## 五、踩过的坑

### 5.1 Colyseus onAuth 返回值

**问题**：`onAuth` 返回 `true` 后，手动设置 `client.auth = {...}`，但在 `onJoin` 中 `client.auth` 是 `undefined`。

**原因**：Colyseus 的 `onAuth` 返回值会直接赋给 `client.auth`。返回 `true`（布尔值）会覆盖任何手动设置。

**修复**：直接返回 auth 对象：

```typescript
async onAuth(client: Client, options: { token?: string }) {
  if (!options.token) return false;
  try {
    const payload = verifyToken(options.token);
    return { userId: payload.sub, username: payload.username };
  } catch {
    return false;
  }
}
```

### 5.2 PostgreSQL UUID 主键

**问题**：用 `nanoid()` 生成字符串 ID 插入 UUID 列，报类型错误。

**修复**：让数据库自动生成 UUID（`DEFAULT gen_random_uuid()`），插入时不指定 `id` 列：

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

### 5.3 TypeScript composite 项目构建

**问题**：`tsc -p tsconfig.json` 构建成功，但 `dist/` 目录为空。

**原因**：`composite: true` 的项目存在 `.tsbuildinfo` 缓存，`tsc` 认为项目已最新，跳过 emit。

**修复**：composite 项目必须用 `tsc --build` 模式：

```json
{
  "scripts": {
    "build": "tsc --build --force"
  }
}
```

### 5.4 Colyseus Schema 版本冲突

**问题**：`@colyseus/schema@3.0.76` 与 `@colyseus/core@0.15.57` 要求的 `^2.0.4` 冲突。

**修复**：在 `server/package.json` 中固定 `@colyseus/schema` 版本：

```json
"@colyseus/schema": "^2.0.4"
```

### 5.5 import type 误用

**问题**：`ItemType cannot be used as a value because it was imported using 'import type'`。

**原因**：枚举既是类型也是值，不能用 `import type` 导入。

**修复**：分开导入：

```typescript
import { ItemType } from '@mir/shared';           // 值导入
import type { ItemTemplate } from '@mir/shared';   // 类型导入
```

---

## 六、Docker 部署

### 6.1 服务编排

```yaml
services:
  postgres:      # PostgreSQL 16，带健康检查
  redis:         # Redis 7，带健康检查
  db-init:       # 一次性服务：初始化 schema 后退出
  server:        # Colyseus + Express，依赖 db-init 成功
  client:        # nginx 静态服务 + 反向代理
```

启动顺序由 `depends_on.condition` 保证：

```
postgres/redis 健康 → db-init 初始化 → server 启动 → client 启动
```

### 6.2 多阶段构建

```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
RUN npm install --workspace=shared --workspace=server --include=dev
RUN npm -w shared run build
RUN npm -w server run build

# 运行阶段（精简镜像）
FROM node:20-alpine
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "server/dist/index.js"]
```

### 6.3 nginx WebSocket 代理

Colyseus 需要 WebSocket 升级支持：

```nginx
location ~ ^/(matchmake|api|colyseus) {
  proxy_pass http://server:2567;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400s;
}
```

### 6.4 一键部署

```bash
cp .env.example .env  # 修改敏感字段
./deploy.sh up         # 构建镜像 + 初始化数据库 + 启动
```

部署脚本支持：

| 命令 | 说明 |
|---|---|
| `./deploy.sh up` | 构建镜像 + 初始化数据库 + 启动所有服务 |
| `./deploy.sh down` | 停止服务，保留数据卷 |
| `./deploy.sh down-volumes` | 停止服务并清空数据卷 |
| `./deploy.sh logs [服务名]` | 查看日志 |
| `./deploy.sh init` | 重新执行数据库初始化 |
| `./deploy.sh restart` | 重启所有服务 |

---

## 七、MVP 验证

端到端测试脚本验证了完整流程：

| 环节 | 结果 |
|---|---|
| 用户注册/登录 | PASS |
| JWT 鉴权 | PASS |
| 角色创建/列表 | PASS |
| WebSocket 游戏房间连接 | PASS |
| 地图初始化（新手村 50×50） | PASS |
| 状态同步（1 玩家 / 13 怪物 / 1 NPC） | PASS |
| 移动指令 | PASS |
| 实时状态更新 | PASS |

测试账号：用户名 `testhero`，密码 `test1234`，已有角色「战士小白」。

---

## 八、总结与展望

### 已完成

- 服务器权威架构（反作弊）
- 增量状态同步 + 客户端插值
- 瓦片地图 + A* 寻路
- 怪物 AI（仇恨/追击/攻击/刷新）
- 装备掉落 + 背包系统
- 聊天 + HUD
- Docker 一键部署

### 后续规划

- 多地图切换与副本
- 技能系统（主动/被动）
- 行会与 PvP
- 商店与交易
- 地图编辑器
- 音效与粒子特效

---

## 技术栈速查

| 层 | 技术 | 版本 |
|---|---|---|
| 客户端引擎 | Phaser | 4.x |
| 实时框架 | Colyseus | 0.15.x |
| 语言 | TypeScript | 5.5+ |
| 构建工具 | Vite | 5.x |
| 数据库 | PostgreSQL | 16 |
| 缓存 | Redis | 7 |
| 容器 | Docker Compose | - |
