# World Cup Betting League — System Architecture

> Consolidated system design reference for the codebase at `src/` + `supabase/`.

---

## 1. System context

```mermaid
flowchart TB
  subgraph Clients["Clients (Browser)"]
    U1[League members]
    U2[Host]
  end

  subgraph SPA["React SPA (Vite)"]
    APP[App + React Router]
  end

  subgraph Supabase["Supabase Cloud"]
    AUTH[Auth]
    PG[(Postgres + RLS)]
    RT[Realtime WebSockets]
    EF[Edge Function: get-matches]
  end

  subgraph External["External services"]
    FD[Football Data API]
    FC[flagcdn.com]
  end

  U1 & U2 --> APP
  APP -->|supabase-js REST| PG
  APP -->|supabase-js Auth| AUTH
  APP -->|postgres_changes| RT
  RT -->|logical replication| PG
  APP -->|HTTP| EF
  EF --> FD
  EF -->|upsert| PG
  APP -->|img src| FC
```

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router 7, Vite, Tailwind CSS, Radix/shadcn UI |
| Client state | React hooks, Zustand (`store.ts` for draft prefs + static `TEAMS`) |
| Backend | Supabase Postgres, Auth, Realtime, Edge Functions |
| Sync | Supabase Realtime `postgres_changes` (WebSockets); reconnect on tab focus / channel errors |
| Hosting | Static SPA build (`vite build`); env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

---

## 2. Application routes & pages

```mermaid
flowchart LR
  subgraph Public
    HOME["/"]
  end

  subgraph Protected["/league/:id — ProtectedRoute"]
    LOBBY["index → Lobby"]
    LOT["lottery → Lottery"]
    DRAFT["draft → DraftRoom"]
    DASH["dashboard → LeagueDashboard"]
  end

  HOME -->|signup/login| Protected
  Protected -->|no session| HOME
```

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home` + `Auth` | Sign up, create league, join league |
| `/league/:id` | `Lobby` | Waiting room, invite link, draft settings, start lottery |
| `/league/:id/lottery` | `Lottery` | Draft order lottery (host-driven animation) |
| `/league/:id/draft` | `DraftRoom` | Live snake draft (48 teams) |
| `/league/:id/dashboard` | `LeagueDashboard` | Standings, schedule, rosters, pot breakdown |

**Auth guard** (`routes.tsx` → `ProtectedRoute`):
- Checks `supabase.auth.getSession()`
- Unauthenticated users → redirect `/`, save path in `sessionStorage` (`pendingLeaguePath`)

---

## 3. Frontend module map

```mermaid
flowchart TB
  subgraph Pages["Page components"]
    Home[Home.tsx]
    Auth[Auth.tsx]
    Join[JoinLeague.tsx]
    Lobby[Lobby.tsx]
    Lottery[Lottery.tsx]
    DraftRoom[DraftRoom.tsx]
    Dashboard[LeagueDashboard.tsx]
  end

  subgraph Hooks["Data hooks"]
    useLeague[useLeague.ts]
    useDraft[useDraft.ts]
    useSchedule[useSchedule.ts]
  end

  subgraph Lib["Business logic"]
    leagueFlow[leagueFlow.ts]
    draftService[draftService.ts]
    pointsService[pointsService.ts]
    supabase[supabase.ts]
  end

  subgraph Static["Client static data"]
    store[store.ts — TEAMS 48, Zustand]
  end

  Home --> useLeague & Auth & Join
  Lobby --> useLeague & leagueFlow
  Lottery --> useLeague & leagueFlow
  DraftRoom --> useDraft & useLeague & draftService & store & leagueFlow
  Dashboard --> useLeague & useSchedule & pointsService & store

  useLeague & useDraft & useSchedule --> supabase
```

### Key files

| Path | Role |
|------|------|
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/hooks/useLeague.ts` | `createLeague`, `joinLeague`, `fetchLeague`, `parseLeagueInput` |
| `src/hooks/useDraft.ts` | Draft state, picks, Realtime, `makePick`, `autoDraftTimeoutPick` |
| `src/hooks/useSchedule.ts` | Matches, picks, members for dashboard schedule tab |
| `src/lib/draftService.ts` | Pure snake-draft logic: `getCurrentPicker`, `makePick`, `isDraftComplete` |
| `src/lib/leagueFlow.ts` | `isLotteryPhase`, `isLotteryComplete` — navigation guards |
| `src/lib/pointsService.ts` | Win/draw/loss scoring → `league_members.total_points` |
| `src/app/store.ts` | Static `TEAMS[]` (48 World Cup teams), Zustand draft type prefs |
| `src/types/index.ts` | Shared TypeScript interfaces |

---

## 4. Database schema

```mermaid
erDiagram
  profiles ||--o{ league_members : "user_id"
  profiles ||--o{ leagues : "host_user_id"
  leagues ||--o{ league_members : "league_id"
  leagues ||--o{ draft_picks : "league_id"
  profiles ||--o{ draft_picks : "user_id"
  teams ||--o{ matches : "home_team / away_team"

  profiles {
    uuid id PK
    text username
    text color
    text icon
  }

  leagues {
    uuid id PK
    text name
    text invite_code UK
    uuid host_user_id FK
    int max_members
    text draft_type
    text draft_status
  }

  league_members {
    uuid id PK
    uuid league_id FK
    uuid user_id FK
    int draft_position
    int total_points
  }

  draft_picks {
    uuid id PK
    uuid league_id FK
    uuid user_id FK
    text team_code
    int pick_number
    int round
  }

  teams {
    uuid id PK
    text team_code UK
    text team_name
    text group_letter
    text flag_code
    int fifa_ranking
  }

  matches {
    uuid id PK
    text match_id UK
    text home_team FK
    text away_team FK
    int home_score
    int away_score
    text status
    timestamptz match_date
    text round
  }
```

**RLS**: All tables have Row Level Security enabled. Policies generally allow authenticated `SELECT` on league data; `INSERT`/`UPDATE` scoped to `auth.uid()`.

**Migrations** (`supabase/migrations/`):
- `001_init.sql` — core tables + base policies
- `add_profiles_insert_policy.sql`
- `add_league_update_policies.sql`
- `add_auto_draft_timeout_rpc.sql` — `auto_draft_timeout_pick` RPC

---

## 5. League lifecycle (`draft_status`)

```mermaid
stateDiagram-v2
  [*] --> pending: createLeague()

  pending --> active: Host clicks Start Draft Lottery
  active --> lottery: All members navigate to lottery
  lottery --> lottery_order: Host shuffles, saves draft_position
  lottery_order --> lottery_complete: All order slots revealed
  lottery_complete --> complete: 48 picks made (optional status)

  note right of pending
    Lobby — join, invite, settings
  end note

  note right of lottery
    Lottery — gumball UI, snake order assigned
  end note

  note right of lottery_complete
    Manual Enter Draft Room button
  end note

  note right of complete
    Dashboard — standings & schedule
  end note
```

### `draft_status` values

| Status | Phase | Typical screen |
|--------|-------|----------------|
| `pending` | Pre-draft | Lobby |
| `active` | Lottery starting | Redirect → Lottery |
| `lottery` | Host shuffling | Lottery |
| `lottery_order` | Revealing order | Lottery |
| `lottery_complete` | Order locked | Lottery → manual draft entry |
| `complete` | Post-tournament | Dashboard |

**Navigation guards** (`leagueFlow.ts`):
- `Lobby`: redirect to `/lottery` when `isLotteryPhase(status)`
- `Lottery`: redirect to `/league/:id` when not lottery phase
- `DraftRoom`: redirect to `/lottery` when lottery phase and not `lottery_complete`

---

## 6. Realtime architecture

All live sync uses **Supabase Realtime** (`postgres_changes` over WebSockets). No periodic HTTP polling.

```mermaid
flowchart LR
  PG[(Postgres WAL)]
  RT[Realtime server]
  C1[Lobby client]
  C2[Lottery client]
  C3[Draft client]
  C4[Dashboard client]

  PG --> RT
  RT --> C1 & C2 & C3 & C4
```

| Channel | Table | Events | Component / Hook |
|---------|-------|--------|----------------|
| `league_members:{id}` | `league_members` | `INSERT` | `Lobby.tsx` |
| `leagues:{id}` | `leagues` | `UPDATE` | `Lobby.tsx` |
| `leagues_lottery:{id}` | `leagues` | `UPDATE` | `Lottery.tsx` |
| `draft-picks-{leagueId}` | `draft_picks` | `INSERT` | `useDraft.ts` |
| `league_members:{id}` | `league_members` | `*` | `LeagueDashboard.tsx` |

**Resilience** (event-driven, not polling):
- `useDraft`: `refreshDraft()` on channel `CHANNEL_ERROR` / `TIMED_OUT`, `online`, `visibilitychange`
- `Lottery`: one-shot `fetchLeague` on channel error

**Requirement**: Tables must be in the `supabase_realtime` publication (Supabase Dashboard → Database → Publications).

---

## 7. Draft system

### Snake draft rules

- **48 teams**, **6 or 8 members** → 8 or 6 picks per player
- **Odd rounds**: pick order `draft_position` 1 → N
- **Even rounds**: pick order N → 1
- Logic: `draftService.getCurrentPicker()`, `makePick()`

### Pick lookup (roster sidebar)

```ts
const getPickForMember = (round: number, member: LeagueMember) => {
  const memberCount = members.length;
  const isReverse = round % 2 === 0;
  const pos = member.draft_position - 1;
  const idx = isReverse ? memberCount - 1 - pos : pos;
  const pickNumber = (round - 1) * memberCount + idx + 1;
  return picks.find(p => p.pickNumber === pickNumber);
};
```

### Draft room flow

```mermaid
sequenceDiagram
  participant User
  participant DraftRoom
  participant useDraft
  participant Realtime
  participant Postgres

  User->>DraftRoom: Click team card
  DraftRoom->>useDraft: makePick(teamCode)
  useDraft->>Postgres: INSERT draft_picks
  Postgres-->>Realtime: WAL change
  Realtime-->>useDraft: postgres_changes INSERT
  useDraft-->>DraftRoom: Updated draftState + picks

  Note over DraftRoom: Timed draft (2min/5min)
  DraftRoom->>Postgres: RPC auto_draft_timeout_pick
  Postgres-->>Realtime: new pick row
  Realtime-->>useDraft: sync all clients
```

| Draft type | Timer | Timeout behavior |
|------------|-------|------------------|
| `untimed` | None | Manual picks only |
| `2min` | 120s | Auto-pick via RPC |
| `5min` | 300s | Auto-pick via RPC |

**Team data during draft**: Static `TEAMS` from `store.ts` (not loaded from `teams` table). Flags from `https://flagcdn.com/w20/{flagCode}.png`.

**Draft complete**: User clicks **Go to Dashboard** manually (no auto-redirect).

---

## 8. Lottery system

**Host-only** animation:
1. Host sets `draft_status: 'lottery'`
2. Host shuffles members → saves `draft_position` → `lottery_order`
3. Ball reveal animation (2s per slot)
4. Host auto-broadcasts `lottery_complete`
5. All clients see **Enter Draft Room** button (manual navigation)

**Non-host clients**: Sync via Realtime on `leagues` UPDATE → `handleLotteryStatus`.

---

## 9. Dashboard & scoring

```mermaid
flowchart LR
  Dash[LeagueDashboard]
  US[useSchedule]
  EF[get-matches]
  PG[(matches)]
  PS[pointsService]

  Dash --> US
  US --> PG
  US -->|optional refresh| EF
  EF -->|Football Data API| Ext[api.football-data.org]
  EF -->|upsert| PG
  Dash --> PS
  PS -->|calculatePoints| Picks[draft_picks]
  PS -->|updateLeagueMemberPoints| Members[league_members]
```

### Scoring rules (`pointsService.ts`)

| Result | Points per owned team |
|--------|----------------------|
| Win | 3 |
| Draw | 1 |
| Loss | 0 |

Only `finished` matches with scores count.

### Dashboard tabs

- **Standings** — `total_points` from `league_members`
- **Schedule** — `matches` + user picks overlay, date pills, rivalry highlights
- **My Teams** — roster dropdown per member
- **Pot** — prize split logic (tournament winner, cinderella, etc.)

---

## 10. Auth & onboarding

```mermaid
flowchart TD
  A[Visit /] --> B{Has session?}
  B -->|No| C[Auth: email signup]
  C --> D[Create profile row]
  D --> E[JoinLeague step — paste invite URL]
  E --> F[Lobby /league/:id]
  B -->|Yes| G[Home — create or join league]
  G --> F

  H[Hit /league/:id unauthenticated] --> I[Save pendingLeaguePath]
  I --> A
  C --> J[Restore pendingLeaguePath after login]
```

| Step | Supabase operation |
|------|-------------------|
| Sign up | `supabase.auth.signUp` |
| Profile | `INSERT profiles` (username, color, icon) |
| Create league | `INSERT leagues` + host `league_members` |
| Join league | `INSERT league_members` via invite code |

---

## 11. Edge function: `get-matches`

**Path**: `supabase/functions/get-matches/index.ts`

| Input | `?matchday=N` (optional) |
| Output | JSON array of matches; upserts into `matches` table |
| External | `GET api.football-data.org/v4/competitions/WC/matches` |
| Secrets | `FOOTBALL_DATA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

Called from `useSchedule.ts` via hardcoded function URL.

---

## 12. Environment & deployment

| Variable | Used by |
|----------|---------|
| `VITE_SUPABASE_URL` | `supabase.ts` |
| `VITE_SUPABASE_ANON_KEY` | `supabase.ts` |
| `FOOTBALL_DATA_API_KEY` | Edge function (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function (server) |

**Build**: `npm run build` → static assets  
**Dev**: `npm run dev` (Vite)  
**Seed**: `npm run seed` → `scripts/seedTeams.js`

---

## 13. Security model

- **Auth**: Supabase JWT; all league routes behind `ProtectedRoute`
- **RLS**: Postgres policies enforce read/write boundaries per `auth.uid()`
- **Realtime**: Change delivery respects RLS per subscriber
- **RPC** `auto_draft_timeout_pick`: `SECURITY DEFINER`; validates league membership and current picker server-side
- **Client**: Anon key only in frontend; service role only in edge function

---

## 14. Known design decisions

| Decision | Rationale |
|----------|-----------|
| Static `TEAMS` in `store.ts` for draft UI | Fast flag cards, no DB round-trip during live draft |
| Realtime over polling | Lower latency, less Supabase load for 6–8 users |
| `draft_status` state machine | Reliable navigation; avoids `draft_position > 0` false positives on join |
| Manual dashboard navigation after draft | User controls when to leave draft room |
| Host-driven lottery | Single source of truth for shuffle order |
| Football Data via edge function | API key stays server-side; matches cached in Postgres |

---

## 15. Directory structure (high level)

```
src/
├── app/
│   ├── components/     # Pages + shadcn UI
│   ├── routes.tsx      # Router + auth guard
│   └── store.ts        # TEAMS + Zustand
├── hooks/              # useLeague, useDraft, useSchedule
├── lib/                # supabase, draftService, leagueFlow, pointsService
├── types/              # Shared interfaces
└── styles/             # Tailwind entry

supabase/
├── migrations/         # SQL schema + RLS + RPC
├── functions/          # get-matches edge function
└── config.toml

docs/
└── ARCHITECTURE.md     # This file
```

---

*Last updated from codebase state: main branch, Realtime-only sync (polling removed).*
