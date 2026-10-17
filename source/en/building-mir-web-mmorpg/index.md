---
title: 'Building a Browser-Based Legend-Style MMORPG from Scratch: A Full-Stack Practice
  with Phaser 4 + Colyseus'
date: 2026-08-11 00:00:00
description: 'A complete record of developing a web-based Legend-style game project:
  technical research, architecture design, core module implementation, Docker deployment,
  and all the pitfalls along the way.'
tags:
- Web Games
- Phaser
- Colyseus
- TypeScript
- Docker
categories:
- Tech
cover: /img/covers/building-mir-web-mmorpg.png
lang: en
layout: post
---


## 1. Project Background

This repository originally started as a family motion-controlled game, but we later decided to change direction: build a **web-based Legend-style MMORPG** that runs right in the browser with no client download required.

The goals were clear:

- A 2D top-down experience similar to Legend private servers
- Playable instantly by just opening a browser
- Multiplayer online, real-time combat
- Server-authoritative, cheat-proof
- One-command Docker deployment

This post records the entire process from technical research to MVP launch.

---

## 2. Technical Feasibility Research

### 2.1 Web Game Engine Selection

| Engine | Pros | Cons | Conclusion |
|---|---|---|---|
| **Phaser 4** | Mature 2D ecosystem, active community, native TypeScript support | Weak 3D capabilities | **Chosen** |
| PixiJS | Extremely strong rendering performance | Rendering layer only; requires building your own game framework | Too much work |
| Three.js | Strong 3D capabilities | Overkill for 2D games | Not suitable |
| Cocos Creator | Chinese-made, Chinese documentation | Heavy editor dependency, large web bundle | Too heavy |

Phaser 4 is a mature choice for 2D web games: scene management, sprite animation, input systems, and a physics engine are all available out of the box, with solid TypeScript support.

### 2.2 Real-Time Communication Solution

| Solution | Latency | Ecosystem | Conclusion |
|---|---|---|---|
| **Colyseus** | Low | Game-specific, room-based, state synchronization | **Chosen** |
| Socket.IO | Medium | General-purpose chat-level, not game-optimized | State sync must be built from scratch |
| Native WebSocket | Lowest | You have to reinvent the wheel | Large development effort |

Colyseus is a Node.js framework designed specifically for multiplayer games. Its core advantages:

- **Room-based**: naturally maps to the dungeon/map concept in games
- **Schema incremental sync**: automatic diffing, only changed fields are sent, saving bandwidth
- **Authoritative server**: the server holds the real state; the client only sends and receives commands
- **Built-in Presence**: supports distributed deployment

### 2.3 Persistence Solution

- **PostgreSQL**: persistence for character data, equipment, inventory
- **Redis**: online status, leaderboards, Colyseus Presence
- **JWT**: stateless authentication, decoupled frontend and backend

### 2.4 Final Tech Stack

```
Client:      Phaser 4 + TypeScript + Vite
Real-time:   Colyseus (authoritative server + incremental state sync)
REST API:    Express + JWT
Database:    PostgreSQL (persistence) + Redis (cache/online status)
Deployment:  Docker Compose
```

---

## 3. Architecture Design

### 3.1 Overall Architecture

```
┌─────────────────────────────────────────────┐
│              Browser Client                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ GameScene │ │ HudScene │ │  UI Panels   │  │
│  │ (Phaser)  │ │(HP/MP bar)│ │(Inventory/Chat)│
│  └─────┬────┘ └────┬─────┘ └──────┬───────┘  │
│        └───────────┼──────────────┘          │
│              GameClient (WebSocket)           │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┼────────────┐
          │   REST API (Express)    │  ← register/login/character management
          │   Colyseus WebSocket    │  ← real-time game sync
          └────────────┬────────────┘
                       │
┌──────────────────────┴───────────────────────┐
│              Colyseus GameRoom                │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Player  │ │ Monster  │ │  ItemDrop     │  │
│  │ State   │ │ System   │ │  System       │  │
│  └─────────┘ └──────────┘ └───────────────┘  │
│  ┌─────────────────────────────────────────┐ │
│  │  A* Pathfinding / Combat / Persistence  │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │   PostgreSQL    Redis    │
          │  (char data)  (online)   │
          └──────────────────────────┘
```

### 3.2 Server-Authoritative Architecture

**Core principle: the client is never trusted.**

- Movement: client sends target coordinates → server computes the path with A* → server advances the position → broadcast
- Attack: client sends an attack command → server validates distance/cooldown → server computes damage → broadcast
- Pickup: client sends a pickup request → server validates distance → server deducts the drop → broadcast

The client only does two things: **send commands** and **render the received state**.

### 3.3 State Synchronization Strategy

Colyseus Schema handles incremental sync automatically, but we added a few things on top:

- **Client-side interpolation**: entities move smoothly between two server snapshots, tolerating 100ms of latency
- **AOI (Area of Interest)**: only entities within view range (12 tiles) are synchronized
- **Dirty-flag persistence**: character data with changes is auto-saved every 30 seconds

### 3.4 Project Structure (Monorepo)

```
mir-web/
├── shared/              # shared between frontend and backend
│   └── src/
│       ├── types.ts     # entity/item/map type definitions
│       ├── protocol.ts  # network protocol (message types)
│       └── config.ts     # balance config (class stats, EXP formula)
├── server/              # Colyseus game server
│   └── src/
│       ├── game/
│       │   ├── GameRoom.ts       # core room logic
│       │   ├── combat/           # combat system
│       │   ├── pathfinding/      # A* pathfinding
│       │   ├── systems/          # monster AI systems
│       │   ├── state/            # Colyseus Schema state
│       │   └── data/             # map/monster/item data
│       └── auth/                 # JWT auth + character API
├── client/              # Phaser 4 frontend
│   └── src/
│       ├── scenes/       # Boot/Preload/Login/CharSelect/Game
│       ├── ui/           # HudScene/InventoryPanel/ChatPanel
│       ├── net/          # GameClient (Colyseus client)
│       └── state/        # local state management
└── docker-compose.yml    # production deployment orchestration
```

---

## 4. Core Module Implementation

### 4.1 Tile Map

The server stores tiles in a one-dimensional array (`TileType[]`), and the client reconstructs the 2D grid from `width`/`height`:

```typescript
// server: deterministic map generation (same result every startup)
function generateTiles(): TileType[] {
  const tiles = new Array<TileType>(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      // boundary walls
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        tiles[idx] = TileType.Wall;
        continue;
      }
      // guarantee Floor around the spawn point
      const dx = x - 25, dy = y - 25;
      if (Math.abs(dx) + Math.abs(dy) < 6) {
        tiles[idx] = TileType.Floor;
        continue;
      }
      // deterministic pseudo-random obstacle scatter
      const r = pseudoRandom(x, y);
      if (r < 0.08) tiles[idx] = TileType.Tree;
      else if (r < 0.12) tiles[idx] = TileType.Water;
      else tiles[idx] = TileType.Floor;
    }
  }
  return tiles;
}
```

The client renders tile by tile using Phaser's `add.rectangle`, with different colors for different tile types.

### 4.2 A* Pathfinding

8-direction pathfinding with diagonal movement support:

```typescript
export function findPath(
  tiles: TileType[],
  width: number,
  height: number,
  start: Vec2,
  goal: Vec2,
): Vec2[] {
  // open/closed lists + Manhattan heuristic
  // 8-direction neighbors; diagonals require checking both sides are passable
  // ...
}
```

Pathfinding results are cached in `MonsterRuntime.path` and recalculated every 600ms, avoiding the per-frame cost of pathfinding.

### 4.3 Monster AI

Driven by a state machine: `idle → aggro → chase → attack → dead → respawn`

```typescript
export function tickMonsters(room: GameRoom, dtMs: number) {
  for (const [monsterId, rt] of room.monsters) {
    const m = rt.state;

    // dead state: waiting to respawn
    if (m.deadAt > 0) {
      if (now - m.deadAt >= rt.template.respawnTime) {
        m.hp = m.maxHp;
        m.position.set(m.spawnPosition.x, m.spawnPosition.y);
      }
      continue;
    }

    // acquire a target (Chebyshev distance < aggroRange)
    if (!rt.targetId) {
      // scan for the nearest player in view
    }

    // chase or attack
    const dist = chebyshev(target.position, m.position);
    if (dist > aggroRange + 4) {
      // out of chase range, return to spawn
    } else if (dist <= attackRange) {
      // attack (rate-limited by attackInterval)
    } else {
      // chase (periodically recalculate path)
    }
  }
}
```

### 4.4 Combat System

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

### 4.5 Client-Side Interpolation

```typescript
// GameScene.update()
for (const view of this.entities.values()) {
  const dx = view.targetX - view.container.x;
  const dy = view.targetY - view.container.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const speed = 0.15; // interpolation speed
    view.container.x += dx * speed;
    view.container.y += dy * speed;
  }
}
```

This makes entities move smoothly between two server snapshots, so even with 100ms of network latency they never teleport.

### 4.6 Persistence

Character data is saved at three points in time:

1. **Scheduled saves**: dirty data is automatically saved every 30 seconds
2. **Save on disconnect**: saved immediately when the player disconnects
3. **Critical events**: saved immediately after leveling up, dying, or picking up equipment

```typescript
async function savePlayer(room: GameRoom, playerId: string) {
  const pd = room.players.get(playerId);
  if (!pd || !pd.data.dirty) return;

  await persistCharacter(pd.data);
  pd.data.dirty = false;
}
```

---

## 5. Pitfalls We Hit

### 5.1 Colyseus onAuth Return Value

**Problem**: After `onAuth` returned `true`, we manually set `client.auth = {...}`, but in `onJoin` `client.auth` was `undefined`.

**Cause**: Colyseus's `onAuth` return value is assigned directly to `client.auth`. Returning `true` (a boolean) overwrites any manual assignment.

**Fix**: Return the auth object directly:

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

### 5.2 PostgreSQL UUID Primary Key

**Problem**: Inserting a string ID generated by `nanoid()` into a UUID column threw a type error.

**Fix**: Let the database generate the UUID itself (`DEFAULT gen_random_uuid()`) and don't specify the `id` column on insert:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

### 5.3 TypeScript Composite Project Build

**Problem**: `tsc -p tsconfig.json` built successfully, but the `dist/` directory was empty.

**Cause**: A project with `composite: true` has a `.tsbuildinfo` cache; `tsc` considers the project up to date and skips emitting.

**Fix**: Composite projects must use `tsc --build` mode:

```json
{
  "scripts": {
    "build": "tsc --build --force"
  }
}
```

### 5.4 Colyseus Schema Version Conflict

**Problem**: `@colyseus/schema@3.0.76` conflicted with the `^2.0.4` required by `@colyseus/core@0.15.57`.

**Fix**: Pin the `@colyseus/schema` version in `server/package.json`:

```json
"@colyseus/schema": "^2.0.4"
```

### 5.5 Misuse of `import type`

**Problem**: `ItemType cannot be used as a value because it was imported using 'import type'`.

**Cause**: An enum is both a type and a value, so it cannot be imported with `import type`.

**Fix**: Import them separately:

```typescript
import { ItemType } from '@mir/shared';           // value import
import type { ItemTemplate } from '@mir/shared';   // type import
```

---

## 6. Docker Deployment

### 6.1 Service Orchestration

```yaml
services:
  postgres:      # PostgreSQL 16, with health check
  redis:         # Redis 7, with health check
  db-init:       # one-shot service: initializes the schema then exits
  server:        # Colyseus + Express, depends on db-init success
  client:        # nginx static serving + reverse proxy
```

Startup order is guaranteed by `depends_on.condition`:

```
postgres/redis healthy → db-init initializes → server starts → client starts
```

### 6.2 Multi-Stage Build

```dockerfile
# build stage
FROM node:20-alpine AS builder
RUN npm install --workspace=shared --workspace=server --include=dev
RUN npm -w shared run build
RUN npm -w server run build

# runtime stage (lean image)
FROM node:20-alpine
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "server/dist/index.js"]
```

### 6.3 nginx WebSocket Proxy

Colyseus requires WebSocket upgrade support:

```nginx
location ~ ^/(matchmake|api|colyseus) {
  proxy_pass http://server:2567;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400s;
}
```

### 6.4 One-Command Deployment

```bash
cp .env.example .env  # edit sensitive fields
./deploy.sh up         # build images + init database + start
```

The deployment script supports:

| Command | Description |
|---|---|
| `./deploy.sh up` | Build images + initialize database + start all services |
| `./deploy.sh down` | Stop services, keep data volumes |
| `./deploy.sh down-volumes` | Stop services and wipe data volumes |
| `./deploy.sh logs [service]` | View logs |
| `./deploy.sh init` | Re-run database initialization |
| `./deploy.sh restart` | Restart all services |

---

## 7. MVP Validation

An end-to-end test script verified the full flow:

| Stage | Result |
|---|---|
| User registration/login | PASS |
| JWT authentication | PASS |
| Character creation/listing | PASS |
| WebSocket game room connection | PASS |
| Map initialization (starter village 50×50) | PASS |
| State sync (1 player / 13 monsters / 1 NPC) | PASS |
| Movement commands | PASS |
| Real-time state updates | PASS |

Test account: username `testhero`, password `test1234`, with an existing character 「战士小白」.

---

## 8. Summary and Outlook

### Completed

- Server-authoritative architecture (anti-cheat)
- Incremental state sync + client-side interpolation
- Tile map + A* pathfinding
- Monster AI (aggro/chase/attack/respawn)
- Equipment drops + inventory system
- Chat + HUD
- One-command Docker deployment

### Roadmap

- Multiple map switching and dungeons
- Skill system (active/passive)
- Guilds and PvP
- Shops and trading
- Map editor
- Sound effects and particle effects

---

## Tech Stack Quick Reference

| Layer | Technology | Version |
|---|---|---|
| Client engine | Phaser | 4.x |
| Real-time framework | Colyseus | 0.15.x |
| Language | TypeScript | 5.5+ |
| Build tool | Vite | 5.x |
| Database | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Containers | Docker Compose | - |
