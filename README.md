<h1 align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=30&pause=1000&color=F59E0B&center=true&vCenter=true&width=700&lines=IPL+Mock+Auction+Platform;Real-Time+Concurrent+Bidding+Engine;Redis+SETNX+%C2%B7+Socket.IO+%C2%B7+Next.js+14+%C2%B7+PostgreSQL" alt="IPL Mock Auction Platform" />
</h1>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Next.js-14.2%2B-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.4%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Redis-7%2B-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Vitest-18%20Suites%20%C2%B7%2078%20Passing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" /></a>
</p>

<p align="center">
  <b>A real-time multiplayer IPL Mock Auction platform engineered for high concurrency, distributed state synchronization, resilient failure recovery, and durable persistence. Featuring Redis SETNX mutex locks, server-authoritative countdown timers, an automated Host Dead Man's Switch, pure salary cap validation, and a dual-lane Redis/PostgreSQL architecture.</b>
</p>

---

## 📖 Table of Contents

- [Overview & Engineering Motivation](#-overview--engineering-motivation)
- [Architecture & Monorepo Layout](#%EF%B8%8F-architecture--monorepo-layout)
- [Authoritative State Architecture (Redis vs PostgreSQL)](#-authoritative-state-architecture-redis-vs-postgresql)
- [Core Engineering Deep-Dives](#-core-engineering-deep-dives)
  - [1. Distributed SETNX Mutex Lock & 12-Step Bid Pipeline](#1-distributed-setnx-mutex-lock--12-step-bid-pipeline-lockts)
  - [2. Server-Authoritative Countdown Timers & Pause Freeze](#2-server-authoritative-countdown-timers--pause-freeze-timerservicets)
  - [3. Host Dead Man's Switch & Disconnect Recovery](#3-host-dead-mans-switch--disconnect-recovery-hostdeadmanservicets)
  - [4. Player Exit & Authoritative Teardown Protocol](#4-player-exit--authoritative-teardown-protocol-teardownservicets)
  - [5. Scarcity-Calibrated Player Pool Generator](#5-scarcity-calibrated-player-pool-generator-queuemanagerts)
  - [6. Pure IPL Salary Cap Rule Validator](#6-pure-ipl-salary-cap-rule-validator-canbid)
  - [7. Double-Hydration State Sync & Zero-Flicker Reconnects](#7-double-hydration-state-sync--zero-flicker-reconnects)
  - [8. Host In-Auction Administration Controls](#8-host-in-auction-administration-controls)
  - [9. Historical Auction Ledger](#9-historical-auction-ledger)
- [Auction Lifecycle & Room State Machine](#-auction-lifecycle--room-state-machine)
- [Socket.IO Event Protocol](#-socketio-event-protocol)
- [Database & Redis Schema](#-database--redis-schema)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Getting Started](#-getting-started)
- [Automated Testing & Verification](#-automated-testing--verification)
- [Current Status & Future Roadmap](#-current-status--future-roadmap)
- [License](#-license)

---

## 🎯 Overview & Engineering Motivation

In live, multi-user sports auctions, participants submit competing bids within the same millisecond. Building a toy prototype with simple database updates breaks under realistic auction conditions:
- **Concurrent Bid Collisions:** Raw database updates (`UPDATE room_members ...`) cause race conditions and deadlocks under concurrent bursts.
- **Client Clock Drift:** Client-side JavaScript timers drift due to CPU throttling, mobile backgrounding, and tab switching, leading to uncoordinated expiry.
- **Host Ghost Disconnects:** If a room host unexpectedly closes their laptop or loses network connectivity mid-auction, rooms hang indefinitely without an automated recovery window.
- **Mid-Auction Leavers:** Uncontrolled disconnects leave ghost bids, locked franchises, and corrupted roster counts.

This project was built to explore and solve these real distributed systems challenges:
1. **Microsecond In-Memory Hot Lane:** Redis handles bid serialization (`SETNX` mutex), active player pointers, wallet mutations, ephemeral presence, and countdown deadlines.
2. **Durable Cold Lane:** PostgreSQL provides ACID persistence for user identity, room lifecycle, complete bid audit trails (`bids`, `bid_events`), squad acquisitions (`squad_players`), and historical ledgers.
3. **Pure Shared Logic:** Business rules and salary cap validators compile identically across backend security handlers and frontend optimistic UI hooks via `@ipl-auction/shared`.
4. **Resilient Failure Recovery:** Automated Host Dead Man's Switch, idempotent player teardown, and tab-visibility presence alerts protect state integrity across browser reloads and network drops.

---

## 🏗️ Architecture & Monorepo Layout

The repository is organized as a **pnpm workspace** orchestrated by **Turborepo**:

```
ipl-auction-platform/
├── apps/
│   ├── backend/                 # Express.js REST API + Socket.IO Real-Time Gateway
│   │   ├── src/
│   │   │   ├── config/          # Environment configuration, CORS, and Passport OAuth2
│   │   │   ├── db/              # PostgreSQL pg-pool client and SQL query repositories
│   │   │   │   └── queries/     # auction.ts, rooms.ts, history.ts, players.ts, users.ts
│   │   │   ├── redis/           # ioredis client (with in-memory fallback), key registry, SETNX lock
│   │   │   ├── routes/          # REST endpoints: /auth, /rooms, /players, /history
│   │   │   ├── services/        # AuctionEngine, TimerService, QueueManager, FranchiseStateService,
│   │   │   │                    # TeardownService, HostDeadManService, BidValidator
│   │   │   ├── socket/          # Socket.IO gateway, JWT auth middleware, event handlers:
│   │   │   │   └── handlers/    # auctionHandler.ts, roomHandler.ts, disconnectHandler.ts
│   │   │   └── server.ts        # Composition root & graceful shutdown
│   └── frontend/                # Next.js 14 App Router + Tailwind CSS + Zustand
│       ├── src/
│       │   ├── app/             # 12 Verified Routes (Landing, Auth, Dashboard, Lobby, Auction, History...)
│       │   ├── components/      # CountdownRing, PlayerCard, BidHistoryFeed, SoldOverlay, SquadPanel...
│       │   ├── hooks/           # useAuction, useBidEligibility, useAuth, useSocket
│       │   ├── stores/          # Zustand client store (auctionStore)
│       │   └── lib/             # Fetch API client & Socket.IO client manager
├── packages/
│   ├── shared/                  # @ipl-auction/shared — Types, Constants, Pure Validators
│   │   └── src/
│   │       ├── constants/       # Franchise mappings, auction rules, pool constants, socket events
│   │       ├── types/           # Room, Player, Squad, Bid, Auth, and Socket event interfaces
│   │       └── validators/      # canBid() 8-rule salary cap validator, getBidIncrement()
│   ├── database/                # PostgreSQL migrations & seed scripts
│   │   ├── migrations/          # DDL migrations 001 through 005
│   │   └── seeds/               # 250-player Excel grid parser & idempotent seeder
│   └── config/                  # Shared ESLint, TypeScript, and Prettier configurations
├── tests/                       # 18 Vitest integration test suites (78 tests)
├── turbo.json                   # Turborepo task pipeline configuration
└── pnpm-workspace.yaml          # Workspace package definitions
```

### Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT (BROWSER)                                     │
│     Next.js 14 App Router  ·  Zustand Reactive Store  ·  Tailwind CSS Glassmorphism     │
└──────────────────┬──────────────────────────────────────────────────┬──────────────────┘
                   │ HTTP / REST                                      │ WebSocket (TCP)
                   │ (Stateless Actions)                              │ (State & Bids)
                   ▼                                                  ▼
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│       EXPRESS.JS REST ROUTER         │          │          SOCKET.IO GATEWAY           │
│  /auth, /rooms, /players, /history   │          │  roomHandler, auctionHandler,        │
│  JWT Authentication & Session Guards │          │  disconnectHandler, JWT Handshake    │
└──────────────────┬───────────────────┘          └──────────────────┬───────────────────┘
                   │                                                 │
                   │                                                 │ Dispatches To
                   ▼                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BACKEND SERVICES                                     │
│   AuctionEngine  ·  TimerService  ·  HostDeadManService  ·  TeardownService             │
│   QueueManager   ·  BidValidator  ·  FranchiseStateService                             │
└──────────────────┬─────────────────────────────────────────────────┬───────────────────┘
                   │                                                 │
                   ▼ (Asynchronous Persistence)                      ▼ (Sub-Millisecond Hot Path)
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│         POSTGRESQL (COLD LANE)       │          │          REDIS (HOT LANE)            │
│  · User Credentials & Accounts       │          │  · Distributed Mutex (SETNX Lock)    │
│  · Room Membership & Franchises      │          │  · Epoch Countdown Deadlines (ms)    │
│  · Squad Ownership (squad_players)   │          │  · Hot Auction State Machine         │
│  · Immutable Audit Log (bid_events)  │          │  · Pre-computed Franchise Wallets    │
│  · Complete Bid History (bids)       │          │  · Ephemeral Room Presence & Ready   │
│  · Historical Ledger Records         │          │  · Host Dead Man Recovery Tokens     │
└──────────────────────────────────────┘          └──────────────────────────────────────┘
```

---

## ⚖️ Authoritative State Architecture (Redis vs PostgreSQL)

The platform enforces a strict separation between ephemeral in-memory state and durable relational storage:

| Concern | Authoritative Store | Rationale |
| :--- | :--- | :--- |
| **Bid Concurrency Mutex** | **Redis** | `SET key token EX 5 NX` serializes competing bids in microsecond time without row-lock contention. |
| **Auction Countdown** | **Redis** | Stores absolute Unix epoch deadlines (`Date.now() + 30000`). Survives server restarts with zero drift. |
| **Active Player & Current Bid** | **Redis** | High read/write throughput during rapid bidding wars; synced to connected clients via Socket.IO. |
| **Pre-Check Franchise Purse** | **Redis** | In-memory JSON cache of wallet balances and tier counters allows instant pre-lock validation. |
| **Lobby Ready & Presence** | **Redis** | Ephemeral `readyMap` and presence hashes with TTLs track online/offline status without DB writes. |
| **Host Dead Man Switch** | **Redis** | Recovery tokens and timeout deadlines resolve reconnection races atomically. |
| **User Identity & Auth** | **PostgreSQL** | Durable user table, unique email constraints, and bcrypt password hashes. |
| **Room Lifecycle & Status** | **PostgreSQL** | Permanent room records, host ownership, and lifecycle status (`lobby`, `active`, `waiting_host`, `terminated`, `completed`). |
| **Franchise Ownership** | **PostgreSQL** | `room_members` table with `UNIQUE(room_id, franchise)` constraint guarantees no double-claiming. |
| **Squad Acquisitions** | **PostgreSQL** | `squad_players` table records final player sales, prices paid, and timestamps upon player resolution. |
| **Bid & Event Audit Trails** | **PostgreSQL** | Append-only `bids` and `bid_events` tables provide complete post-auction auditability. |
| **Historical Ledger** | **PostgreSQL** | Immutable record of all completed auctions, final purses, rosters, and top buys for `/history`. |

> **Note on Concurrency Semantics:** Redis does not make the entire application globally transactional. Redis acts as an atomic serialization barrier and hot cache for the active bid path, while PostgreSQL provides durable asynchronous persistence once a bid is accepted.

---

## 🔑 Core Engineering Deep-Dives

### 1. Distributed SETNX Mutex Lock & 12-Step Bid Pipeline (`lock.ts`)

To prevent simultaneous bids on the same player from corrupting wallet balances or creating double winners:
1. **Pre-lock Validation:** Evaluates auction state, player identity, and salary caps against cached Redis franchise state. Rejects 90% of invalid bids *before* touching the lock.
2. **Lock Acquisition:** Executes `SET auction:{roomId}:bid_lock uuid EX 5 NX` (atomic test-and-set). If already held, immediately returns `BID_REJECTED`.
3. **Re-validation Under Lock:** Re-reads the current leading bid from Redis to guarantee no concurrent bid was accepted during lock acquisition.
4. **State Mutation:** Atomically updates leading bid amount and bidder in Redis.
5. **Atomic Lua Release:** Releases the lock *only* if the token matches the process's unique UUID, preventing accidental release of expired or re-acquired locks:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

6. **Broadcast & Reset:** Emits `auction:bid_update` to the room and resets the countdown timer to 10 seconds.
7. **Async DB Durability:** Asynchronously writes the bid to the PostgreSQL `bids` table outside the critical path.

### 2. Server-Authoritative Countdown Timers & Pause Freeze (`timerService.ts`)

* **Absolute Unix Deadlines:** Instead of decaying relative counters, the server stores `auction:{roomId}:timer_deadline = Date.now() + 30000`.
* **Zero-Drift Sync:** If a client refreshes or reconnects, `getRemainingSeconds()` reads `Math.max(0, ceil((deadline - Date.now()) / 1000))`.
* **Pause Freeze Guarantee:** When paused (by host control or Host Dead Man's Switch), the active deadline key is deleted to halt clock decay, and remaining seconds are frozen in `auction:{roomId}:timer_deadline:paused`. Browser refreshes during pauses display the exact frozen time without drift.

### 3. Host Dead Man's Switch & Disconnect Recovery (`hostDeadManService.ts`)

If the room host disconnects during an active auction:
1. The server detects the host disconnect in `disconnectHandler.ts`.
2. `HostDeadManService` immediately pauses the auction timer and transitions room status to `waiting_host`.
3. Generates a unique recovery token in Redis with a **60-second recovery deadline**.
4. Broadcasts `auction:waiting_host` to all participants, freezing the UI.
5. **Host Reconnection:** If the host reconnects within 60 seconds, `handleHostReconnect` cancels the timeout, invalidates the token, restores room status to `active`, resumes the timer from the exact frozen second, and broadcasts `auction:resumed`.
6. **Host Timeout:** If 60 seconds elapse without the host, `handleHostTimeout` marks the room as `terminated`, clears all timers, cleans up the engine, and broadcasts `auction:terminated`, instructing clients to return to `/dashboard`.

### 4. Player Exit & Authoritative Teardown Protocol (`teardownService.ts`)

Both explicit user departure (clicking "Leave Arena" or sending HTTP POST `/rooms/:code/leave`) and unexpected 60-second disconnect timeouts converge on `TeardownService.teardownManager()`:
* **Idempotency Guard:** Uses a Redis lock (`auction:{roomId}:teardown_lock:{userId}`) to prevent race conditions from concurrent leave requests.
* **Database Cleanup:** Removes the member row from `room_members`, freeing up their claimed franchise in lobby state.
* **Socket Channel Exit:** Removes the socket from room channels.
* **Host Succession / Dead Man Trigger:** If the departing user was the host during lobby state, ownership transfers to the next senior member. If during active auction, it triggers the Dead Man's Switch.
* **Broadcast:** Emits `room:user_left` and an updated participant roster to all remaining room members.

### 5. Scarcity-Calibrated Player Pool Generator (`queueManager.ts`)

Instead of auctioning a static list of 250 players regardless of participant count, the pool is calibrated dynamically to ensure strategic scarcity:
$$\text{targetCount} = \text{clamp}\Big(\text{round}\big(N \times 25 \times 1.4\big),\, 50,\, 250\Big)$$
where $N$ is the number of participating managers in the room.

* **Quota Allocation:** Allocates 20% Marquee players (min 10), 25% Batters, 25% Pacers, 22% All-rounders, 18% Spinners, and 10% Wicketkeepers.
* **Unbiased Permutation:** Orders players within each tier using an in-place **Fisher-Yates shuffle**, then bulk inserts into `auction_queue` and caches in Redis with a 24-hour TTL.

### 6. Pure IPL Salary Cap Rule Validator (`canBid`)

Exported from `@ipl-auction/shared` and evaluated identically on frontend and backend:
1. **Squad Size Limit:** Maximum 25 players per squad.
2. **Purse Solvency:** Proposed bid $\le$ remaining wallet balance.
3. **Tier ₹25+ Cr Cap:** Maximum 1 player $\ge$ ₹2,500 Lakhs.
4. **Tier ₹20-25 Cr Cap:** Maximum 2 players between ₹2,000L and ₹2,500L.
5. **Tier ₹15-20 Cr Cap:** Maximum 3 players between ₹1,500L and ₹2,000L.
6. **Overseas Player Limit:** Maximum 8 international players.
7. **Wicketkeeper Limit:** Maximum 4 wicketkeepers per squad.
8. **Dynamic Solvency Reserve Math:** Remaining purse must satisfy:
   $$\text{walletRemaining} \ge (18 - \text{squadSize}) \times \text{MIN\_BASE\_PRICE}$$
   guaranteeing the franchise retains sufficient budget to complete the mandatory 18-player roster.

### 7. Double-Hydration State Sync & Zero-Flicker Reconnects

When a user refreshes their browser mid-auction:
1. **Immediate REST Hydration:** `GET /rooms/:code` loads room status and membership from PostgreSQL before mounting the page.
2. **Socket State Sync:** Client emits `auction:state_sync_request`. The server reads hot Redis keys in parallel (`currentPlayer`, `currentBid`, `currentBidder`, `secondsLeft`, `auctionPhase`, `myFranchiseState`) and responds privately with `auction:state_sync`, eliminating spectator-flash UI glitches.

### 8. Host In-Auction Administration Controls

Authenticated room hosts have live control over the auction stage via `host:control`:
* **`pause`:** Freezes the countdown timer and updates state to `paused`.
* **`resume`:** Restores the exact frozen seconds and resumes countdown.
* **`extend`:** Adds a $+15\text{s}$ buffer to the active deadline.
* **`skip`:** Immediately resolves the current player without waiting for timer expiry.
* **`end`:** Concludes the auction early and transitions to completion.

### 9. Historical Auction Ledger

The platform provides durable post-auction record-keeping via `/history`:
* **`GET /history`:** Retrieves past completed and terminated auctions for the authenticated user with total spend, acquired player count, and rank.
* **`GET /history/:idOrCode`:** Returns a complete ledger breakdown including participating teams, final purse balances, full squad rosters, and top buys across the draft.

---

## 🔄 Auction Lifecycle & Room State Machine

### Room Lifecycle (PostgreSQL & Socket.IO)

```
[lobby] ──(host starts auction)──► [active] ──(queue exhausted)──► [completed]
                                       │
                    (host disconnects) │  ▲ (host reconnects < 60s)
                                       ▼  │
                                [waiting_host]
                                       │
                    (60s timeout)      ▼
                                 [terminated]
```

### Active Auction State Machine (Redis & Socket.IO)

```
[idle] ──► [player_up] ──► [bidding] ──► [sold / unsold] ──► [player_up (next)]
                              │                                     │
                   (host pause│ ▲ (resume)             (queue empty)▼
                    or deadman│ │                              [complete]
                              ▼ │
                     [paused / waiting_host]
```

---

## 📡 Socket.IO Event Protocol

### Client-to-Server Events
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `room:join` | `{ roomCode }` | Subscribes socket to room channels (`roomCode` and `roomId`). |
| `room:leave` | `{ roomCode }` | Explicitly triggers authoritative teardown for departing member. |
| `room:franchise_select` | `{ roomCode, franchise }` | Claims a franchise in lobby (enforced by DB unique constraint). |
| `room:ready_toggle` | `{ roomCode, isReady }` | Toggles participant ready status in Redis `readyMap`. |
| `room:start_auction` | `{ roomCode }` | Host starts the auction queue and triggers 3s countdown. |
| `auction:bid_placed` | `{ roomCode, playerId, amountLakhs }` | Submits a new bid through the 12-step concurrency pipeline. |
| `auction:state_sync_request` | `{ roomCode }` | Requests full room recovery snapshot upon reconnection. |
| `auction:manager_presence` | `{ roomCode, isAway, reason }` | Emitted on tab-switch or offline events to alert other managers. |
| `host:control` | `{ roomCode, action: 'pause' \| 'resume' \| 'extend' \| 'skip' \| 'end' }` | Executes authorized host administrative actions. |

### Server-to-Client Broadcasts
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `room:user_joined` | `{ participants, joinedUserId, joinedUsername }` | Broadcasts updated participant list on join. |
| `room:user_left` | `{ userId, username, teamCode, newHostId, memberCount }` | Broadcasts departure and updated host assignment. |
| `room:ready_update` | `{ userId, username, isReady, allReady }` | Broadcasts updated ready status across room members. |
| `room:franchise_claimed` | `{ participants, claimedByUserId, franchise }` | Announces successful franchise claim. |
| `room:auction_starting` | `{ roomCode, countdownSeconds, message }` | 3-second pre-draft launch countdown. |
| `room:state_sync` | `{ room, participants }` | Re-synchronizes lobby membership state. |
| `auction:player_up` | `{ player, queuePosition, queueTotal, phase, timerSeconds }` | Announces new player on the block. |
| `auction:timer_tick` | `{ roomId, secondsLeft }` | 1-second interval countdown tick from server. |
| `auction:bid_update` | `{ player, currentBidLakhs, currentBidder, timestamp }` | Announces newly accepted leading bid. |
| `auction:bid_rejected` | `{ reason, humanMessage }` | Private rejection notification sent only to bidder. |
| `auction:player_sold` | `{ player, finalPriceLakhs, winningFranchise, updatedSquad }` | Resolves player as SOLD and updates rosters. |
| `auction:player_unsold` | `{ player }` | Resolves player as UNSOLD when timer expires with no bids. |
| `auction:paused` / `resumed` | `{ secondsLeft }` | Informs room of pause / resume state. |
| `auction:extended` | `{ secondsLeft }` | Informs room of timer extension. |
| `auction:waiting_host` | `{ roomId, roomCode, remainingRecoverySeconds, recoveryDeadlineMs }` | Alerts room that host disconnected; freezes timer. |
| `auction:presence_alert` | `{ userId, username, franchise, isAway, reason, timestamp }` | Displays live manager away/offline badges and toasts. |
| `auction:terminated` | `{ roomId, roomCode, reason, message }` | Informs room that host recovery window expired. |
| `auction:phase_transition` | `{ from, to, remainingBudgetsSummary }` | 5-second marquee-to-general round transition. |
| `auction:complete` | `{ allFranchiseStates }` | Final auction results across all participating teams. |
| `auction:state_sync` | `{ currentPlayer, currentBidLakhs, secondsLeft, myFranchiseState... }` | Private snapshot recovery for reconnecting socket. |

---

## 🗄️ Database & Redis Schema

### PostgreSQL Core Tables
![Schema Tables](apps/backend/src/db/IPL-DB-TABLES.png)

### Redis Key Registry
All Redis key patterns are centralized in `apps/backend/src/redis/keys.ts`:
* `presence:{roomCode}` — Hash: `{ userId: '1' | '0' }` tracking online presence (2h TTL).
* `room:{roomCode}:ready` — Hash: `{ userId: '1' | '0' }` tracking lobby readiness.
* `auction:{roomId}:bid_lock` — Distributed mutex lock token (5s TTL, `SET NX`).
* `auction:{roomId}:teardown_lock:{userId}` — Idempotency lock for user teardowns (3s TTL).
* `auction:{roomId}:timer_deadline` — Unix epoch deadline (ms) for active countdown.
* `auction:{roomId}:timer_deadline:paused` — Frozen remaining seconds snapshot during pause.
* `auction:{roomId}:frozen_time` — Frozen timer seconds during `waiting_host` state.
* `auction:{roomId}:host_deadman_token` — Host recovery token for Dead Man's Switch (70s TTL).
* `auction:{roomId}:host_deadman_deadline` — Epoch timestamp of 60s host recovery deadline.
* `auction:{roomId}:state` — Real-time state (`idle`, `player_up`, `bidding`, `paused`, `waiting_host`, `sold`, `unsold`, `complete`).
* `auction:{roomId}:current_player` — JSON serialized active Player object.
* `auction:{roomId}:current_bid` — Current winning bid amount in Lakhs.
* `auction:{roomId}:current_bidder` — Current winning franchise name.
* `auction:{roomId}:queue` — JSON serialized ordered `QueueEntry[]` (24h TTL).
* `auction:{roomId}:franchise:{name}` — Cached `FranchiseState` (wallet, squad count, tier counters).

---

## 🛠️ Tech Stack

| Layer | Technologies | Description |
| :--- | :--- | :--- |
| **Monorepo** | Turborepo, pnpm | Fast incremental builds & workspace orchestration |
| **Frontend** | Next.js 14 (App Router), React, Tailwind CSS, Zustand | 12 routes, glassmorphism design system, SVG countdowns |
| **Backend** | Node.js 20+, Express.js, Socket.IO 4+ | REST APIs, WebSocket gateway, lifecycle services |
| **Shared Engine** | `@ipl-auction/shared` | Shared types, constants, pool formulas, and pure `canBid()` validator |
| **Database** | PostgreSQL 15+, `pg`, `pg-pool` | Relational persistence, connection pooling, ACID constraints, audit trails |
| **Cache & Mutex** | Redis 7+, `ioredis` | Sub-millisecond locks, timer epoch deadlines, hot state cache |
| **Testing** | Vitest 4, Supertest | 18 test suites, 78 integration & unit tests, zero failures |

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: `v20.0.0` or higher
* **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
* **Docker Desktop**: For running local Redis (or a remote Redis URL)
* **PostgreSQL**: PostgreSQL 15+ database (local or hosted, e.g. Supabase, Neon)

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/ipl_auction?sslmode=disable"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication & Server Ports
JWT_SECRET="your-secure-256-bit-jwt-secret-min-32-chars"
PORT=3001
FRONTEND_URL="http://localhost:3000"
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"
```

### 3. Installation, Migrations & Seeding
```bash
# Install workspace dependencies
pnpm install

# Start local Redis container (if using Docker)
docker run -d --name ipl-redis -p 6379:6379 redis:alpine

# Parse the Excel dataset and seed 250 IPL players into PostgreSQL
pnpm verify:seed
```

### 4. Running the Development Server
```bash
# Concurrently start Next.js frontend (port 3000) and Express/Socket.IO backend (port 3001)
pnpm dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to create an auction room, claim a franchise in the Locker Room Lobby, and start bidding.

---

## 🧪 Automated Testing & Verification

The repository includes **18 automated test suites** covering the entire auction lifecycle:

```bash
# Run all 18 Vitest suites with database isolation
pnpm test:backend

# Run TypeScript compilation check across all packages & apps
pnpm run typecheck
```

### Test Suite Map (18 Suites · 78 Tests Passing)
* [`tests/01_auth.test.ts`](tests/01_auth.test.ts) — User registration, bcrypt password hashing, timing-safe login.
* [`tests/02_seed_players.test.ts`](tests/02_seed_players.test.ts) — PostgreSQL player seeding verification (250 players).
* [`tests/03_database_schema.test.ts`](tests/03_database_schema.test.ts) — Foreign keys, cascades, unique constraints, and check constraints.
* [`tests/04_api_routes.test.ts`](tests/04_api_routes.test.ts) — Express REST endpoints and error handling.
* [`tests/05_google_oauth.test.ts`](tests/05_google_oauth.test.ts) — Google OAuth2 callback, user provisioning, and JWT generation.
* [`tests/06_seed_parser.test.ts`](tests/06_seed_parser.test.ts) — Excel grid parsing unit tests.
* [`tests/07_players_api.test.ts`](tests/07_players_api.test.ts) — Authenticated player querying and category filtering.
* [`tests/08_frontend_auth_guard.test.ts`](tests/08_frontend_auth_guard.test.ts) — Client-side authentication guards and session handling.
* [`tests/09_engine_initialization.test.ts`](tests/09_engine_initialization.test.ts) — Queue initialization, Fisher-Yates shuffle, and first player advancement.
* [`tests/10_frontend_auction_store_sync.test.ts`](tests/10_frontend_auction_store_sync.test.ts) — Zustand client store synchronization.
* [`tests/11_bidding_pipeline_mutex_and_salary_caps.test.ts`](tests/11_bidding_pipeline_mutex_and_salary_caps.test.ts) — Mutex concurrency locks, bid rejection, and 8 salary cap constraints.
* [`tests/12_player_resolution_sold_unsold.test.ts`](tests/12_player_resolution_sold_unsold.test.ts) — Player resolution, sold/unsold transactions, wallet deductions.
* [`tests/13_host_controls.test.ts`](tests/13_host_controls.test.ts) — Host authorization guards, pause, resume, extend, and skip controls.
* [`tests/14_player_exit_teardown.test.ts`](tests/14_player_exit_teardown.test.ts) — Mid-auction and lobby teardown, franchise liberation, and lock enforcement.
* [`tests/15_host_dead_man_switch.test.ts`](tests/15_host_dead_man_switch.test.ts) — Host disconnect 60s recovery window, timer freeze, resumption, and termination.
* [`tests/16_scarcity_player_pool.test.ts`](tests/16_scarcity_player_pool.test.ts) — Scarcity pool sizing formula, role quotas, and boundary clamping.
* [`tests/17_historical_ledger.test.ts`](tests/17_historical_ledger.test.ts) — Completed auction query endpoints, roster snapshots, and top buys.
* [`tests/18_timer_pause_refresh_and_presence.test.ts`](tests/18_timer_pause_refresh_and_presence.test.ts) — Timer paused stability across wall-clock decay and page refresh.

---

## 📈 Current Status & Future Roadmap

### Current Status
The core auction platform is fully operational and verified:
- Concurrency-safe bidding pipeline with Redis SETNX mutex locks.
- Server-authoritative timer engine with pause freeze and zero reload drift.
- Automated failure recovery via Host Dead Man's Switch (60s) and idempotent TeardownService.
- Scarcity-calibrated player pool generator and historical ledger audit trails.
- Redesigned 3-column live auction board, locker room lobby, and manager presence alerts.
- 18 test suites passing (78/78 tests), 0 TypeScript compilation errors, and successful production builds.

### Next Phase: Gamification & Squad Evaluation Layer *(Planned)*
The next engineering phase will introduce a post-auction competitive evaluation engine:
* **Squad Legality Engine:** Strict verification of minimum 18 players, overseas limits, wicketkeeper counts, and bowling quotas.
* **Draft Squad Index (DSI):** Deterministic 0–1000 scoring algorithm evaluating XI strength, squad balance, value-for-money, depth, and purse efficiency.
* **Best XI Optimizer:** Deterministic selection of the strongest legal starting XI from acquired rosters.
* **Automated Post-Auction Awards:** Deterministic badges (*Steal of the Auction*, *Panic Buy*, *Best Balanced Squad*, *Auction Master*).
* **Manager Profiles & Simulation:** Career records, head-to-head draft comparisons, and match simulation.

---

## 📄 License

MIT © Sudarshan Patil H J. Built for concurrent systems engineering & real-time live auction simulation.
