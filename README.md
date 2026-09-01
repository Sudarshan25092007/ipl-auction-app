<h1 align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=30&pause=1000&color=F59E0B&center=true&vCenter=true&width=700&lines=IPL+Mock+Auction+Platform;Ultra-Low+Latency+Concurrent+Bidding;Redis+SETNX+%C2%B7+Socket.IO+%C2%B7+Next.js+14+%C2%B7+PostgreSQL" alt="IPL Mock Auction Platform" />
</h1>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Status-Production%20Ready-10B981?style=for-the-badge" alt="Status" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Next.js-14.2%2B-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.4%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Redis-7%2B-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Vitest-100%25%20Passing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" /></a>
</p>

<p align="center">
  <b>A high-concurrency, real-time multi-room IPL Mock Auction platform featuring sub-millisecond Redis SETNX mutex locks, authoritative server-driven countdown timers, strict 8-constraint IPL salary cap validation, and resilient WebSocket state synchronization.</b>
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture & Monorepo Layout](#-architecture--monorepo-layout)
- [Core Engineering Deep-Dives](#-core-engineering-deep-dives)
  - [1. Distributed SETNX Mutex Lock](#1-distributed-setnx-mutex-lock-lockts)
  - [2. Authoritative Server-Driven Countdown Timer](#2-authoritative-server-driven-countdown-timer-timerservicets)
  - [3. Pure IPL Salary Cap Rule Validator](#3-pure-ipl-salary-cap-rule-validator-canbid)
  - [4. Double-Hydration State Sync & Zero-Flicker Reconnects](#4-double-hydration-state-sync--zero-flicker-reconnects)
  - [5. Host In-Auction Administration Controls](#5-host-in-auction-administration-controls)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Socket.IO Event Protocol](#-socketio-event-protocol)
- [Database & Redis Cache Schema](#-database--redis-cache-schema)
- [Getting Started](#-getting-started)
- [Automated Testing](#-automated-testing)
- [License](#-license)

---

## 🎯 Overview

In live, high-stakes sports auctions, multiple participants submit conflicting bids within the same millisecond. Traditional relational database transactions (`SELECT FOR UPDATE`) create serialized row-lock bottlenecks under concurrent bursts, while client-side timers drift due to mobile backgrounding and network latency.

The **IPL Mock Auction Platform** solves these fundamental distributed systems challenges through:
1. **Microsecond In-Memory Hot Lane:** Redis handles active bid resolution (`SETNX` mutex), active player pointers, wallet mutations, and countdown deadlines.
2. **Durable Cold Lane:** PostgreSQL manages room persistence, user authentication, complete bid audit trails (`bids`, `bid_events`), and squad acquisitions (`squad_players`).
3. **Pure Shared Logic:** Business rules and salary cap validators compile identically across backend security handlers and frontend optimistic UI hooks via `@ipl-auction/shared`.

---

## 🏗️ Architecture & Monorepo Layout

```
ipl-auction-platform/
├── apps/
│   ├── backend/                 # Express + Socket.IO Server
│   │   ├── src/
│   │   │   ├── config/          # Environment variables & Passport OAuth2
│   │   │   ├── db/              # PostgreSQL pool & query repositories
│   │   │   ├── redis/           # ioredis client, key registry, SETNX mutex
│   │   │   ├── routes/          # REST endpoints (/auth, /rooms, /players)
│   │   │   ├── services/        # AuctionEngine, TimerService, QueueManager, FranchiseState
│   │   │   ├── socket/          # Socket.IO gateway, auth middleware, event handlers
│   │   │   └── server.ts        # Server entrypoint & graceful shutdown
│   └── frontend/                # Next.js 14 App Router + TailwindCSS
│       ├── src/
│       │   ├── app/             # Pages: /login, /dashboard, /lobby, /auction, /results
│       │   ├── components/      # CountdownRing, PlayerCard, BidHistoryFeed, SoldOverlay, SquadPanel
│       │   ├── hooks/           # useAuction, useBidEligibility, useAuth, useSocket
│       │   ├── stores/          # Zustand client stores (auctionStore, roomStore)
│       │   └── lib/             # API client & socket instance manager
├── packages/
│   ├── shared/                  # @ipl-auction/shared — Types, Constants, Pure Validators
│   │   └── src/
│   │       ├── constants/       # Franchise mappings, auction constants, socket event enum
│   │       ├── types/           # Player, Squad, Room, Socket payload interfaces
│   │       └── validators/      # canBid() 8-rule salary cap validator, getBidIncrement()
│   ├── database/                # PostgreSQL migrations & seed scripts
│   │   ├── migrations/          # DDL schema SQL files
│   │   └── seeds/               # 250-player Excel grid parser & seeder
│   └── config/                  # Shared ESLint and TypeScript configs
├── tests/                       # 13 Vitest integration test suites (61 tests)
├── turbo.json                   # Turborepo task pipeline configuration
└── pnpm-workspace.yaml          # Monorepo package workspace definitions
```

---

## 🔑 Core Engineering Deep-Dives

### 1. Distributed SETNX Mutex Lock (`lock.ts`)

To prevent simultaneous bids on the same player from creating corrupted states:
* Bids acquire a room-scoped lock: `auction:{roomId}:lock:bid` with a 5-second TTL.
* Lock acquisition uses `SET key uuid EX 5 NX` (atomic test-and-set).
* Releasing the lock uses an atomic **Lua Script** ensuring a process only releases a lock matching its own unique token:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### 2. Authoritative Server-Driven Countdown Timer (`timerService.ts`)

* **Zero-Drift Unix Epochs:** The server stores `auction:{roomId}:timer_deadline = Date.now() + 30000`.
* **Crash Resilience:** If the backend restarts mid-auction, the server reads the absolute epoch timestamp from Redis on reboot: `remaining = (deadline - Date.now()) / 1000`, resuming with exact precision.
* **Tick Streaming:** Server emits `auction:timer_tick` at 1,000ms intervals. Clients render the SVG countdown from the server's tick without running independent uncoordinated timers.

### 3. Pure IPL Salary Cap Rule Validator (`canBid`)

Exported from `@ipl-auction/shared` and executed on both frontend (UI disable hints) and backend (authoritative validation):
1. **Squad Size Limit:** Maximum 25 players.
2. **Purse Solvency:** Proposed bid $\le$ remaining wallet balance.
3. **Tier ₹25+ Cr Cap:** Maximum 1 player $\ge$ ₹2,500 Lakhs.
4. **Tier ₹20-25 Cr Cap:** Maximum 2 players between ₹2,000L and ₹2,500L.
5. **Tier ₹15-20 Cr Cap:** Maximum 3 players between ₹1,500L and ₹2,000L.
6. **Overseas Player Limit:** Maximum 8 international players.
7. **Wicketkeeper Requirement:** Maximum 4 wicketkeepers per squad.
8. **Dynamic Solvency Reserve Math:** Guarantees remaining purse $\ge$ $(18 - \text{squadSize}) \times \text{MIN\_BASE\_PRICE}$, ensuring the franchise can fill the mandatory 18-player minimum roster.

### 4. Double-Hydration State Sync & Zero-Flicker Reconnects

When a user refreshes their browser mid-auction:
1. **Immediate REST Hydration:** `GET /rooms/:code` resolves user franchise assignment from `room_members` before mounting the auction room.
2. **Socket State Sync:** Client sends `auction:state_sync_request`, receiving current player, active bid, remaining timer seconds, and full squad summaries (`auction:state_sync`), completely eliminating spectator-flash UI glitches.

### 5. Host In-Auction Administration Controls

Authenticated room hosts (`room.host_user_id === socket.data.user.id`) have live control over the auction room:
* **`pause`:** Clears the active interval, stores remaining seconds in `auction:{roomId}:timer_deadline:paused`, and updates `auctionState = 'paused'`.
* **`resume`:** Restores the exact paused seconds, cleans up the freeze key, resets `auctionState = 'bidding'`, and resumes countdown.
* **`extend`:** Adds a $+15\text{s}$ buffer to the active deadline and broadcasts `auction:extended`.
* **`skip`:** Immediately clears active timers and invokes `handleTimerExpiry()` to resolve the current player.

---

## 🛠️ Tech Stack

| Layer | Technologies | Description |
| :--- | :--- | :--- |
| **Monorepo** | Turborepo, pnpm | Fast incremental builds & workspace orchestration |
| **Frontend** | Next.js 14 (App Router), React 19, TailwindCSS, Zustand, Lucide | Real-time reactive auction dashboard & SVG countdowns |
| **Backend** | Node.js 20+, Express.js, Socket.IO 4+ | High-performance REST APIs & real-time WebSocket gateway |
| **Shared Engine** | `@ipl-auction/shared` | Shared TypeScript types, constants, pure salary cap validators |
| **Database** | PostgreSQL 15+, `pg`, `pg-pool` | ACID durability, relational room/member state & bid audit trails |
| **Cache & Mutex** | Redis 7+, `ioredis` | Sub-millisecond locks, hot franchise cache & timer epoch deadlines |
| **Testing** | Vitest 4, Supertest | 13 test suites covering auth, DB schemas, bidding, mutex & engine |

---

## 📡 Socket.IO Event Protocol

### Client-to-Server Events
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `join_room` | `{ roomCode }` | Joins the Socket.IO room channel |
| `room:start_auction` | `{ roomCode }` | Host starts the auction queue |
| `auction:bid` | `{ roomCode, amountLakhs }` | Submits a new bid on active player |
| `host:control` | `{ roomCode, action: 'pause' \| 'resume' \| 'extend' \| 'skip' }` | Executes host administration control |
| `auction:state_sync_request` | `{ roomCode }` | Requests full room recovery snapshot |

### Server-to-Client Broadcasts
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `room:state_change` | `{ room, members }` | Broadcasts lobby and member updates |
| `auction:player_up` | `{ player, queuePosition, queueTotal, phase, timerSeconds }` | Announces new player on the block |
| `auction:timer_tick` | `{ roomId, secondsLeft }` | 1-second interval countdown tick |
| `auction:bid_update` | `{ player, currentBidLakhs, currentBidder, timestamp }` | Announces accepted higher bid |
| `auction:player_sold` | `{ player, finalPriceLakhs, winningFranchise, updatedSquad }` | Resolves player as SOLD |
| `auction:player_unsold` | `{ player }` | Resolves player as UNSOLD |
| `auction:paused` / `resumed` | `{ secondsLeft }` | Informs room of pause / resume state |
| `auction:extended` | `{ secondsLeft }` | Informs room of +15s timer extension |
| `auction:phase_transition`| `{ from, to, remainingBudgetsSummary }` | 5-second marquee-to-general interstitial |
| `auction:auction_complete` | `{ allFranchiseStates }` | Final auction results across all 10 teams |

---

## 🗄️ Database & Redis Cache Schema

### PostgreSQL Core Tables
* **`users`**: User credentials (`id`, `email`, `username`, `password_hash`, `created_at`).
* **`rooms`**: Auction rooms (`id`, `invite_code`, `host_user_id`, `status`, `current_queue_position`).
* **`room_members`**: Franchise ownership & purse (`id`, `room_id`, `user_id`, `franchise`, `wallet_remaining_lakhs`).
* **`players`**: Complete roster (`id`, `name`, `role`, `category`, `nationality`, `is_marquee`, `is_capped`, `base_price_lakhs`).
* **`auction_queue`**: Ordered draft queue (`id`, `room_id`, `player_id`, `position`, `phase`, `status`).
* **`bids`**: Audit trail of every bid (`id`, `room_id`, `room_member_id`, `player_id`, `amount_lakhs`, `bid_time`).
* **`squad_players`**: Acquired team rosters (`id`, `room_member_id`, `player_id`, `price_paid_lakhs`, `acquired_at`).
* **`bid_events`**: Immutable event stream (`id`, `room_id`, `player_id`, `user_id`, `event_type`, `payload`, `created_at`).

### Redis Hot State Keys
* `auction:{roomId}:lock:bid` — SETNX distributed mutex lock.
* `auction:{roomId}:timer_deadline` — Authoritative countdown epoch timestamp (ms).
* `auction:{roomId}:timer_deadline:paused` — Frozen remaining seconds snapshot during pause.
* `auction:{roomId}:state` — Real-time state (`idle`, `player_up`, `bidding`, `paused`, `sold`, `unsold`, `complete`).
* `auction:{roomId}:player` — Active player JSON snapshot.
* `auction:{roomId}:bid:current` — Leading bid amount in Lakhs.
* `auction:{roomId}:bidder:current` — Leading franchise name.
* `auction:{roomId}:franchise:{name}` — 24h cached franchise wallet & composition counters.

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: `v20.0.0` or higher
* **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
* **Docker Desktop**: For running local Redis (or remote Redis URL)
* **PostgreSQL**: PostgreSQL 15+ database (e.g. Supabase, Neon, or local PostgreSQL)

### 2. Environment Setup
Create a `.env` file in the root directory:

```env
# Database (PostgreSQL / Supabase)
DATABASE_URL="postgresql://user:password@host:5432/postgres?sslmode=require"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth & Ports
JWT_SECRET="your-secure-256-bit-jwt-secret"
PORT=3001
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"
```

### 3. Installation & Seeding
```bash
# Install monorepo dependencies
pnpm install

# Start local Redis container (if using Docker)
docker run -d --name ipl-redis -p 6379:6379 redis:alpine

# Parse Excel dataset and seed 250 IPL players into PostgreSQL
pnpm verify:seed
```

### 4. Running the Development Server
```bash
# Concurrently start Next.js frontend (port 3000) and Express/Socket.IO backend (port 3001)
pnpm dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to register, create an auction room, claim a franchise, and start bidding!

---

## 🧪 Automated Testing

The platform features 13 integration test suites covering the entire lifecycle:

```bash
# Run all backend & integration tests with database isolation
pnpm test:backend

# Run TypeScript typecheck across all packages & apps
pnpm run typecheck
```

### Test Suite Map
* `tests/01_auth.test.ts` — User registration, password hashing, and login validation.
* `tests/02_seed_players.test.ts` — Excel player parsing & PostgreSQL upsert verification (250 players).
* `tests/03_database_schema.test.ts` — Table constraints, foreign keys, and indexes.
* `tests/04_api_routes.test.ts` — Express REST endpoints and error handling.
* `tests/05_google_oauth.test.ts` — Google OAuth2 callback and JWT generation.
* `tests/06_seed_parser.test.ts` — Excel grid parsing unit tests.
* `tests/07_players_api.test.ts` — Player querying & category filtering.
* `tests/08_frontend_auth_guard.test.ts` — Next.js client authentication guards.
* `tests/09_engine_initialization.test.ts` — Authoritative timer & auction queue initialization.
* `tests/10_frontend_auction_store_sync.test.ts` — Zustand store state synchronization.
* `tests/11_bidding_pipeline_mutex_and_salary_caps.test.ts` — Mutex locks & 8 salary cap constraints.
* `tests/12_player_resolution_sold_unsold.test.ts` — Player sold/unsold atomic DB transactions.
* `tests/13_host_controls.test.ts` — Host security, pause, resume, extend, and skip controls.

---

## 📄 License

MIT © Sudarshan Patil H J. Built for concurrent systems engineering & real-time live auction simulation.
