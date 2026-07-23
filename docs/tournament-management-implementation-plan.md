# BGMI Tournament Management — Full Implementation Plan

> **Product:** End-to-end esports tournament operations (App + Discord Bot + Backend)  
> **Game focus (v1):** BGMI — Battle Royale points system only  
> **Scope:** Full operational doc + Part 6 extras  
> **Last updated:** 2026-07-21  
> **Status:** Planning — ready for implementation

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Locked Decisions](#3-locked-decisions)
4. [What Exists vs What To Build](#4-what-exists-vs-what-to-build)
5. [Domain Model](#5-domain-model)
6. [Registration & Verification Funnel](#6-registration--verification-funnel)
7. [API Surface](#7-api-surface)
8. [Discord Bot Contract](#8-discord-bot-contract)
9. [Mobile App (Single App, Dual UI)](#9-mobile-app-single-app-dual-ui)
10. [Phased Implementation Roadmap](#10-phased-implementation-roadmap)
11. [BGMI Rules Engine](#11-bgmi-rules-engine)
12. [Part 6 Operational Features](#12-part-6-operational-features)
13. [Export Strategy](#13-export-strategy)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Implementation Chat Prompts](#15-implementation-chat-prompts)

---



## 1. Product Overview



### Vision

A tournament-grade tool where a **Tournament Manager (TM)** runs BGMI events from creation through grand finals, with **Discord** handling registration, verification UX, and role automation, while the **backend** remains the single source of truth.

### Three codebases


| Repo                                        | Role                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| **pt-maker-backend** (this repo)            | Source of truth: DB, business rules, TM APIs, Player APIs, Bot APIs, events, exports |
| **Discord bot** (new folder, separate repo) | Discord UX only: embeds, modals, role grant/remove, screenshot buttons               |
| **Flutter app** (single app)                | Login → choose **TM mode** or **Player mode** → separate UIs, same API client        |




### Explicitly separate from QuickPT

QuickPT (quick match/series, graphics, OCR) stays a **separate product flow** forever. Reuse patterns (Excel export, queue workers) but not entities or routes.

---



## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Flutter App (single binary)                  │
│  Login → [ TM Mode ]  or  [ Player Mode ]                       │
│     │                        │                                   │
│     └── TM UI screens        └── Player UI screens              │
└────────────┬───────────────────────────┬────────────────────────┘
             │ JWT (user auth)           │ JWT (user auth)
             ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    pt-maker-backend (REST + optional SSE)        │
│  • Tournament / Registration / Verification / Structure        │
│  • Matches / Standings / Qualification / Ops (Part 6)          │
│  • DiscordSyncOutbox (events for bot)                            │
│  • Postgres + Redis + queue workers                              │
└────────────┬───────────────────────────┬────────────────────────┘
             │                           │
             │ Bot service auth          │ SSE (optional, TM counters)
             ▼                           ▼
┌────────────────────────┐    ┌──────────────────────────────────┐
│   Discord Bot (new)    │    │  Public standings page (token URL) │
│   • Register embed     │    │  (read-only, no auth)              │
│   • Role sync          │    └──────────────────────────────────┘
│   • Announcements      │
└───────────┬────────────┘
            ▼
       Discord API
```



### Integration pattern (recommended hybrid)


| Direction             | Mechanism                    | Use for                                                                        |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| App / Bot → Backend   | **REST**                     | All writes, reads, config                                                      |
| Backend → Bot         | **Outbox + webhook or poll** | Registration open/close, stage active, qualifiers, champion, waitlist promoted |
| TM dashboard counters | **Polling (15–30s) or SSE**  | Registered / Verified / Pending / Waitlisted                                   |


**Why hybrid:** REST keeps the bot thin and debuggable. Outbox ensures Discord updates happen immediately when TM acts in the app — the bot should not poll the backend every few seconds for state changes.

**Idempotency:** Every automated Discord action keyed by `(tournamentId, eventId, discordUserId, roleName)`. Bot must support `/roles/sync` repair without duplicate roles or posts.

---



## 3. Locked Decisions


| Topic                 | Decision                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Phase scope           | Full doc, BGMI / BR points only for v1                                                                                     |
| Formats               | `BATTLE_ROYALE_POINTS` only (no Swiss, GSL, elim brackets in v1)                                                           |
| Part 6 extras         | All included in v1 (check-in, roster lock, smurf flag, disputes, penalties, public standings, reminders, overrides, audit) |
| Discord bot           | Greenfield, separate folder/repo                                                                                           |
| Verification modes    | **Both** Mode A (external role) and Mode B (native screenshot queue)                                                       |
| Verification rule     | **All starters verified** → team is verified. **Subs do not affect** fully-registered status                               |
| Registration channels | **Discord + in-app** (player mode in same app)                                                                             |
| Multi-team players    | Configurable per tournament (not global hard block)                                                                        |
| Team modes            | Solo / Duo / Squad — drives starter count + up to **2 subs**                                                               |
| Waitlist              | Auto-placed when cap full; **TM manual approval** to promote                                                               |
| Auto structure engine | **Suggest only** → TM confirms before materializing stages/groups                                                          |
| Daily group reshuffle | Not auto in v1; TM can **manually move** teams between groups anytime                                                      |
| Lobby size            | **TM configurable** per tournament (16–25)                                                                                 |
| Export                | **On-demand Excel** (extend existing export service); no Google Sheets API in v1                                           |
| Discord DB schema     | **Clean new design** (old tables were intentionally removed)                                                               |
| API shapes            | Can break/restructure current tournament registration APIs                                                                 |
| QuickPT               | Separate flow forever                                                                                                      |
| Client                | **One Flutter app**, TM vs Player chosen at login                                                                          |
| Real-time             | Polling OK; SSE optional for TM registration dashboard                                                                     |




### Roster size defaults (confirm during Phase A implementation)


| Team mode | Starters (must verify) | Max subs (optional, no verify required) |
| --------- | ---------------------- | --------------------------------------- |
| SOLO      | 1                      | 0–2                                     |
| DUO       | 2                      | 0–2                                     |
| SQUAD     | 4                      | 0–2                                     |


---



## 4. What Exists vs What To Build



### Reuse & extend (~30% of full vision)


| Module                      | Location                                | Notes                               |
| --------------------------- | --------------------------------------- | ----------------------------------- |
| Tournament CRUD             | `tournamentService`, `tournamentRoutes` | Extend fields                       |
| Stages                      | `tournamentStageService`                | Add proposal/confirm flow           |
| Groups                      | `groupService`                          | Add manual team move                |
| Matches + results           | `matchService`, `matchResultService`    | Keep                                |
| BR scoring                  | `pointsCalculator.ts`                   | Extend tie-breaks (WWCD)            |
| Leaderboards                | `leaderboardService`                    | Keep                                |
| Qualification / progression | `teamQualificationService`              | Add **proposal → TM confirm** layer |
| Slots                       | `slotManagementService`                 | Keep                                |
| Collaborators               | `tournamentCollaboratorService`         | Keep                                |
| Excel export pattern        | `excelExportService`                    | New tournament export methods       |




### Build from scratch (~70%)

- Discord binding + bot config models
- Rich roster registration (Discord ID, IGN, in-game ID)
- Verification subsystem (Mode A + B)
- Registration open/close + waitlist + TM promotion
- DiscordSyncOutbox + bot API + service auth
- Structure suggestion engine
- Qualification proposal (human-in-the-loop)
- Part 6: check-in, roster lock, disputes, penalties, smurf detection, public standings, audit log
- Tournament roster/standings Excel exports
- Player-mode API endpoints



### Removed — do not revive as-is

Migration `20260308120000_drop_legacy_discord_and_enrollment` dropped all legacy Discord tables. Design fresh models aligned to this doc.

---



## 5. Domain Model



### 5.1 Tournament (extended)

```
Tournament
├── id, name, game (= "BGMI"), bannerUrl, description, rulesText
├── startDate, endDate
├── status: UPCOMING | REGISTRATION_OPEN | REGISTRATION_CLOSED | ONGOING | COMPLETED
├── entryFee, prizePool, maxTeams
├── teamMode: SOLO | DUO | SQUAD
├── maxStarters (derived from teamMode), maxSubs (= 2)
├── lobbySize (16–25, TM configurable)
├── allowMultiTeamPlayers: boolean
├── registrationOpen: boolean
├── format: BATTLE_ROYALE_POINTS (fixed v1)
├── scoring: positionPointsConfig[], killPointsValue, wwcdBonusEnabled, wwcdBonusPoints
├── verificationMode: EXTERNAL_ROLE | NATIVE_QUEUE | BOTH
├── externalVerifiedRoleName (Mode A)
├── socialPlatforms: { instagram: bool, youtube: bool }
├── userId (owner)
└── relations: stages, registrations, discordBinding, proposals, ...
```



### 5.2 TournamentDiscordBinding

```
TournamentDiscordBinding
├── tournamentId (unique)
├── guildId
├── registrationChannelId, announcementChannelId, verificationChannelId, disputeChannelId
├── staffRoleIds: string[]
├── roleNamingTemplate (e.g. "{name}-Stage{stage}-Group{group}")
├── setupCompletedAt
└── linkedByUserId
```

Bot token lives **only in bot repo**, never in backend.

### 5.3 TeamRegistration (redesigned)

```
TeamRegistration
├── id, tournamentId
├── teamName, teamTag, logoUrl
├── captainUserId (app user, nullable if Discord-only captain)
├── captainDiscordId
├── status (see funnel below)
├── waitlistPosition, waitlistedAt, promotedAt, promotedByUserId
├── registeredVia: DISCORD | APP
├── groupId, slotNumber, currentStage
├── totalPoints, finalPosition
└── rosterPlayers[], verificationSubmissions[], checkIns[], disputes[]
```



### 5.4 RosterPlayer

```
RosterPlayer
├── teamRegistrationId
├── discordId, inGameName, inGameId
├── slotRole: STARTER | SUB
├── verificationStatus: PENDING | VERIFIED | REJECTED  (only matters for STARTER)
├── verifiedAt, verifiedByUserId
└── appUserId (optional, if player linked app account)
```



### 5.5 VerificationSubmission (Mode B)

```
VerificationSubmission
├── rosterPlayerId
├── platform: INSTAGRAM | YOUTUBE
├── screenshotUrls: string[]
├── status: PENDING | APPROVED | REJECTED
├── reviewedByUserId, reviewNotes, reviewedAt
```



### 5.6 TournamentStructureProposal

```
TournamentStructureProposal
├── tournamentId
├── inputTeamCount, lobbySizeUsed
├── suggestedStages: JSON  // [{ stageNumber, name, groups, cutLine, matchesPerDay, ... }]
├── drawMode: RANDOM | SNAKE | MANUAL
├── status: DRAFT | CONFIRMED | SUPERSEDED
├── confirmedAt, confirmedByUserId
```

On confirm → create real `TournamentStage` + `Group` records + optional initial team assignments.

### 5.7 QualificationProposal

```
QualificationProposal
├── stageId
├── suggestedTeamIds: string[]   // auto top-N by points
├── confirmedTeamIds: string[]     // TM tick/untick
├── status: DRAFT | CONFIRMED
├── confirmedAt, confirmedByUserId
```

On confirm → run progression + emit Discord role events.

### 5.8 DiscordSyncOutbox

```
DiscordSyncOutbox
├── id, tournamentId, guildId
├── eventType (enum, see §8)
├── payload: JSON
├── idempotencyKey (unique)
├── status: PENDING | DELIVERED | FAILED
├── createdAt, deliveredAt, failureReason
```



### 5.9 Part 6 entities (summary)


| Entity                 | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `StageCheckIn`         | Captain check-in per stage window             |
| `RosterChangeLog`      | Audit trail for roster edits before lock      |
| `RosterLock`           | Timestamp when roster freezes                 |
| `Dispute`              | Evidence + status + resolution                |
| `PointPenalty`         | Mid-stage point deduction or DQ               |
| `SmurfFlag`            | Cross-tournament in-game ID collision warning |
| `PublicStandingsToken` | Read-only URL token                           |
| `AuditLog`             | Generic admin override log                    |


---



## 6. Registration & Verification Funnel



### Team status flow

```
DRAFT → PENDING_VERIFICATION → VERIFIED → REGISTERED → GROUP_ASSIGNED
                                    ↓                      ↓
                              (if cap full)           QUALIFIED → CHAMPION
                                    ↓                      ↓
                               WAITLISTED              ELIMINATED
                                    ↓
                          (TM promotes) → REGISTERED
```



### Verification rule (LOCKED)

- Team is **VERIFIED** when **every STARTER** passes verification.
- **SUB verification status is ignored** for team-level verified/registered counts.
- Mode A: starter has external Discord verified role → player VERIFIED.
- Mode B: staff approves screenshot → player VERIFIED.
- Mode BOTH: either path satisfies.



### TM dashboard counters


| Counter                          | Definition                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| **Registered**                   | Teams with submitted roster (any status after submit)                 |
| **Pending**                      | Teams where ≥1 starter not yet verified                               |
| **Verified**                     | All starters verified, not yet promoted from waitlist (if applicable) |
| **Waitlisted**                   | Cap full, awaiting TM promotion                                       |
| **Confirmed** (for bracket math) | VERIFIED + REGISTERED (not waitlisted, not pending)                   |


Only **Confirmed** teams count toward structure suggestion engine.

---



## 7. API Surface

Base path: `/api/v1`

### 7.1 TM APIs (JWT — owner or collaborator)



#### Tournament lifecycle

```
POST   /tournaments/create
GET    /tournaments
GET    /tournaments/:id
PUT    /tournaments/:id
DELETE /tournaments/:id
POST   /tournaments/:id/registration/open
POST   /tournaments/:id/registration/close
GET    /tournaments/:id/registration/stats     # counters
```



#### Discord binding

```
PUT    /tournaments/:id/discord/bind             # guildId + channels (from bot callback)
GET    /tournaments/:id/discord/config
PUT    /tournaments/:id/discord/config           # TM edits naming, channels
```



#### Registrations (TM view)

```
GET    /tournaments/:id/registrations            # filter by status
GET    /tournaments/:id/registrations/:regId
PUT    /tournaments/:id/registrations/:regId      # force status, admin override
POST   /tournaments/:id/waitlist/:regId/promote
POST   /tournaments/:id/waitlist/:regId/reject
POST   /tournaments/:id/registrations/:regId/force-verify
```



#### Verification queue (Mode B — also doable in app TM UI)

```
GET    /tournaments/:id/verification/queue
POST   /tournaments/:id/verification/:submissionId/approve
POST   /tournaments/:id/verification/:submissionId/reject
```



#### Structure engine

```
POST   /tournaments/:id/structure/suggest        # generates proposal
GET    /tournaments/:id/structure/proposals
GET    /tournaments/:id/structure/proposals/:proposalId
POST   /tournaments/:id/structure/proposals/:proposalId/confirm
PUT    /tournaments/:id/groups/:groupId/teams/:regId/move   # manual group move
```



#### Match day (mostly extends existing routes)

```
POST   /tournament-stages/:stageId/activate
POST   /matches/create ...
POST   /match-results/...
GET    /leaderboards/...
POST   /team-advancement/stage/:stageId/qualification/suggest
POST   /team-advancement/stage/:stageId/qualification/confirm
POST   /team-advancement/complete-progression/...   # after confirm
```



#### Part 6 ops

```
POST   /tournaments/:id/stages/:stageId/check-in/open
POST   /tournaments/:id/check-in                    # captain (player route too)
GET    /tournaments/:id/disputes
POST   /tournaments/:id/disputes/:id/resolve
POST   /tournaments/:id/penalties
POST   /tournaments/:id/roster-lock
GET    /tournaments/:id/audit-log
POST   /tournaments/:id/public-standings/generate
DELETE /tournaments/:id/public-standings/:tokenId
```



#### Export (on-demand)

```
POST   /tournaments/:id/export/roster
POST   /tournaments/:id/export/standings
POST   /tournaments/:id/export/stage/:stageId
POST   /tournaments/:id/export/archive
```



### 7.2 Player APIs (JWT — any authenticated user)

```
GET    /player/tournaments/open                    # discover open registration
GET    /player/tournaments/:id
POST   /player/tournaments/:id/register            # create/update roster
GET    /player/registrations                        # my teams
GET    /player/registrations/:regId
POST   /player/registrations/:regId/verification   # upload Mode B proof
POST   /player/registrations/:regId/check-in
POST   /player/registrations/:regId/disputes
GET    /player/tournaments/:id/standings           # if public or registered
```



### 7.3 Bot APIs (service auth — `X-Bot-Service-Key` header)

```
GET    /bot/tournaments/:id/config
POST   /bot/tournaments/:id/registrations          # from Discord modal
POST   /bot/tournaments/:id/verification/submit
POST   /bot/tournaments/:id/verification/player-status   # Mode A role snapshot
GET    /bot/events?since=cursor&guildId=...
POST   /bot/events/:eventId/ack
POST   /bot/events/:eventId/fail
POST   /bot/roles/sync-complete                    # bot reports roles applied
GET    /bot/tournaments/:id/role-actions/pending   # optional pull model
```



### 7.4 Public (no auth)

```
GET    /public/standings/:token
GET    /public/standings/:token/sse                # optional live updates
```

---



## 8. Discord Bot Contract



### 8.1 Outbox event types


| eventType                | When emitted              | Bot action                                                |
| ------------------------ | ------------------------- | --------------------------------------------------------- |
| `REGISTRATION_OPENED`    | TM opens registration     | Post register embed                                       |
| `REGISTRATION_CLOSED`    | TM closes registration    | Disable button, announce                                  |
| `TEAM_REGISTERED`        | New roster submitted      | Optional log to staff channel                             |
| `TEAM_VERIFIED`          | All starters verified     | Assign `@Verified`, maybe `@Registered`                   |
| `WAITLISTED`             | Cap full                  | DM captain                                                |
| `WAITLIST_PROMOTED`      | TM promotes               | Assign `@Registered`, announce                            |
| `STAGE_ACTIVATED`        | TM sets stage active      | Assign stage + group roles, announce lineups              |
| `TEAMS_QUALIFIED`        | TM confirms qualification | Next stage/group roles, strip old, optional `@Eliminated` |
| `QUALIFICATION_REVERTED` | TM un-ticks team          | Strip wrongly assigned roles                              |
| `CHECKIN_OPENED`         | Check-in window opens     | Post check-in button                                      |
| `CHECKIN_REMINDER`       | Scheduled                 | DM captains                                               |
| `PENALTY_APPLIED`        | TM deducts points / DQ    | Announce                                                  |
| `DISPUTE_RESOLVED`       | TM rules                  | Announce                                                  |
| `CHAMPION_DECLARED`      | Finals complete           | Assign `@Champion`, announce                              |
| `ROSTER_LOCK`            | TM locks rosters          | Announce deadline passed                                  |




### 8.2 Example outbox payload

```json
{
  "eventType": "STAGE_ACTIVATED",
  "tournamentId": "uuid",
  "guildId": "discord-guild-id",
  "idempotencyKey": "stage-activated:{stageId}:v1",
  "payload": {
    "stageNumber": 1,
    "stageName": "Stage 1 — Group Stage",
    "announcementChannelId": "...",
    "roleActions": [
      {
        "action": "ASSIGN",
        "roleName": "MyTourney-Stage1",
        "discordUserIds": ["...", "..."]
      },
      {
        "action": "ASSIGN",
        "roleName": "MyTourney-Stage1-GroupA",
        "discordUserIds": ["...", "..."]
      }
    ],
    "message": "Stage 1 is live. Group A/B/C/D lineups posted."
  }
}
```



### 8.3 Bot registration POST body (from Discord modal)

```json
{
  "teamName": "Team Alpha",
  "teamTag": "ALP",
  "captainDiscordId": "123456789",
  "starters": [
    { "discordId": "...", "inGameName": "...", "inGameId": "..." }
  ],
  "subs": [
    { "discordId": "...", "inGameName": "...", "inGameId": "..." }
  ]
}
```

Backend validates: team mode starter count, max 2 subs, duplicate in-game IDs, multi-team rule, cap → waitlist.

---



## 9. Mobile App (Single App, Dual UI)



### Login flow

```
App launch → Auth (phone/OTP existing) → Role picker:
  [ I manage tournaments ]  →  TM shell (bottom nav / drawer)
  [ I play ]                →  Player shell (bottom nav)
```

Same JWT, same API base URL. Optional: store last-used mode.

### TM UI — screen map (build order)

1. My tournaments list
2. Create tournament (BGMI defaults)
3. Tournament detail hub (status, counters, quick actions)
4. Link Discord (deep link / code exchange with bot)
5. Registration control (open/close, stats)
6. Registrations list (filter: pending / verified / waitlist)
7. Waitlist management (promote / reject)
8. Verification queue (Mode B approve/reject)
9. Structure suggestion review → confirm
10. Manual group editor (move teams)
11. Stage control (activate, enter results link)
12. Standings + qualification proposal (tick/untick) → confirm
13. Check-in admin
14. Disputes + penalties
15. Exports + public standings link
16. Audit log (optional admin screen)



### Player UI — screen map

1. Browse open tournaments
2. Tournament detail + register CTA
3. Registration form (solo/duo/squad aware, subs optional)
4. My registrations (status tracker)
5. Verification upload (Mode B) or status view (Mode A)
6. Check-in button (when window open)
7. Standings view
8. File dispute



### Shared components

- API client layer (`TournamentApi`, `PlayerApi`, `BotApi` N/A in app)
- Auth token management
- Polling service for TM counters (or SSE subscription)

---



## 10. Phased Implementation Roadmap



### Phase A — Foundation (Week 1–3)

**Backend**

- [ ] New Prisma schema (Tournament extended, TeamRegistration redesign, RosterPlayer)
- [ ] Migration from old registration shape
- [ ] Tournament CRUD extensions
- [ ] Player registration endpoints
- [ ] TM registration list + stats counters
- [ ] Registration open/close
- [ ] Roster validator (solo/duo/squad + 2 subs, in-game ID format)

**App**

- [ ] Login role picker shell
- [ ] Player: browse + register
- [ ] TM: create tournament + open registration + view list

**Exit:** Player registers via app; TM sees counters update (polling).

---



### Phase B — Discord layer (Week 3–5)

**Backend**

- [ ] TournamentDiscordBinding model + APIs
- [ ] Bot service auth middleware
- [ ] Bot registration endpoint
- [ ] DiscordSyncOutbox + GET events + ACK
- [ ] Emit REGISTRATION_OPENED / CLOSED events

**Bot (parallel)**

- [ ] OAuth + guild bind
- [ ] /setup → save config to backend
- [ ] Register embed + modal → POST backend
- [ ] Event consumer (poll or webhook)

**Exit:** Discord registration appears in TM dashboard; close registration disables bot button.

---



### Phase C — Verification + waitlist (Week 5–7)

**Backend**

- [ ] VerificationSubmission + approve/reject
- [ ] Mode A player-status endpoint
- [ ] Team VERIFIED when all starters pass
- [ ] Waitlist auto + TM promote/reject
- [ ] Outbox events: TEAM_VERIFIED, WAITLISTED, WAITLIST_PROMOTED

**Bot**

- [ ] Mode A role watcher
- [ ] Mode B upload + approve/reject buttons

**App**

- [ ] TM verification queue screen
- [ ] Player verification upload screen

**Exit:** Full registration funnel works on both channels.

---



### Phase D — Structure engine (Week 7–9)

**Backend**

- [ ] TournamentStructureProposal generator (team count + lobby size + funnel ratios)
- [ ] Confirm → materialize stages/groups
- [ ] Manual team group move endpoint

**App**

- [ ] TM structure review + confirm UI
- [ ] Manual group editor

**Exit:** 64 teams → system proposes 4×16 Stage 1 → TM confirms.

---



### Phase E — Match loop + qualification confirm (Week 9–11)

**Backend**

- [ ] Stage activate → outbox event
- [ ] QualificationProposal (suggest top-N)
- [ ] TM confirm/untick → then existing progression
- [ ] Role sync events on confirm/revert

**App**

- [ ] TM match results (wire existing APIs)
- [ ] Standings + qualification tick UI

**Exit:** End-to-end stage 1 → stage 2 with Discord roles (via bot).

---



### Phase F — Part 6 operational (Week 11–15)

- [ ] Check-in windows + captain check-in
- [ ] Roster lock + change audit log
- [ ] Smurf detection (in-game ID cross-tournament query)
- [ ] Disputes + resolution
- [ ] Point penalties + DQ
- [ ] Public standings token page
- [ ] Scheduled check-in reminders → outbox
- [ ] Audit log for all admin overrides
- [ ] Standings PNG export (reuse graphics pipeline if feasible)

---



### Phase G — Export + closure (Week 15–16)

- [ ] On-demand Excel: roster, standings, stage, full archive
- [ ] Champion declaration + CHAMPION_DECLARED event
- [ ] Tournament COMPLETED archive state

---



## 11. BGMI Rules Engine



### Scoring (extend existing `PointsCalculator`)

- TM-editable placement table (10 ranks + 0 for 11–25)
- Kill points per kill (default 1)
- Optional WWCD bonus points or tie-break priority



### Tie-break order (stage standings)

1. Total points
2. Total kills
3. WWCD count
4. Average placement
5. TM manual override (audit logged)



### Structure suggestion math

```
groupsNeeded = ceil(confirmedTeams / lobbySize)
```

Funnel suggestion (TM can override):


| Teams       | Suggested stages |
| ----------- | ---------------- |
| ≤ lobbySize | 1 (finals)       |
| 26–64       | 2                |
| 65–150      | 3                |
| 150+        | 4                |


Default cut ~25–50% per stage until ≤ lobbySize remain.

### Qualification

- Per group: top N by cumulative stage points (existing leaderboard logic)
- TM confirms suggested list before progression fires

---



## 12. Part 6 Operational Features


| Feature          | TM action                 | Player action           | Bot action                  |
| ---------------- | ------------------------- | ----------------------- | --------------------------- |
| Check-in         | Open window, set duration | Tap check-in            | Button + reminder DM        |
| Roster lock      | Set lock time / lock now  | Edit roster before lock | Announce deadline           |
| Smurf detection  | Review flagged IDs        | —                       | Warn on register (optional) |
| Disputes         | Resolve with ruling       | Submit + evidence       | Post ruling                 |
| Penalties        | Deduct points / DQ        | —                       | Announce                    |
| Public standings | Generate/revoke link      | View via link           | —                           |
| Reminders        | Configure timezone offset | —                       | DM captains                 |
| Overrides        | Any manual change         | —                       | Re-sync roles via outbox    |


Every override writes to `AuditLog`.

---



## 13. Export Strategy

**v1:** Extend `excelExportService` pattern — **not** Google Sheets API.


| Export    | Trigger      | Contents                                                 |
| --------- | ------------ | -------------------------------------------------------- |
| Roster    | TM on-demand | Team, players, Discord IDs, IGN, IDs, status, timestamps |
| Standings | TM on-demand | Points table per group/stage                             |
| Stage     | TM on-demand | Group assignments + results + standings                  |
| Archive   | TM on-demand | Full tournament snapshot at completion                   |


Returns download URL (R2 + signed preview, same as QuickPT exports).

---



## 14. Risks & Mitigations


| Risk                                     | Mitigation                                                            |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Large v1 scope                           | Ship Phases A→E before all Part 6 polish; Part 6 can parallel after E |
| Bot/backend drift                        | Outbox + idempotency + `/roles/sync` repair endpoint                  |
| Breaking existing app tournament screens | Coordinate Flutter restructure in Phase A                             |
| Qualification currently auto-applies     | Insert proposal layer before wiring Discord events                    |
| Scope creep to other formats             | Enum locked to BATTLE_ROYALE_POINTS until v2                          |


---



## 15. Implementation Chat Prompts

Copy-paste these into **separate Cursor chats** when starting each workstream. Each prompt gives the AI full context.

---



### Prompt 1 — Phase A Backend (Schema + Registration)

```
I'm implementing Phase A of the BGMI Tournament Management system in pt-maker-backend.

Read these files first:
- docs/tournament-management-implementation-plan.md (full plan)
- prisma/schema.prisma (current tournament models)
- src/services/teamRegistrationService.ts
- src/services/tournamentService.ts
- src/types/teamRegistration.ts

Goal (Phase A only):
1. Redesign Prisma schema: extended Tournament, TeamRegistration, RosterPlayer
2. Team modes SOLO/DUO/SQUAD with max 2 subs
3. Verification rule: all STARTERS must verify; subs don't affect team verified status
4. Registration statuses: DRAFT, PENDING_VERIFICATION, VERIFIED, REGISTERED, WAITLISTED, GROUP_ASSIGNED, QUALIFIED, ELIMINATED, CHAMPION
5. Player APIs: browse open tournaments, register team
6. TM APIs: registration list, stats counters, open/close registration
7. Do NOT touch Discord/bot yet
8. QuickPT stays separate

Follow existing patterns: Redis cache + QueueService sync, BaseService, validateRequest zod schemas.

Start with schema design review, then implement incrementally. Ask before breaking unrelated code.
```

---



### Prompt 2 — Phase B Backend (Discord + Outbox)

```
I'm implementing Phase B of the BGMI Tournament Management system in pt-maker-backend.

Read first:
- docs/tournament-management-implementation-plan.md (§7.3, §8)
- prisma/schema.prisma
- src/index.ts (route mounting)

Goal (Phase B only):
1. TournamentDiscordBinding model + TM bind/config APIs
2. Bot service auth middleware (X-Bot-Service-Key)
3. Bot registration endpoint (same validation as player register)
4. DiscordSyncOutbox table + emit on registration open/close
5. GET /bot/events + POST ack/fail
6. Document event payload shapes in code comments or types

Do NOT implement verification or structure engine yet.
Bot repo is separate — only backend APIs here.
```

---



### Prompt 3 — Phase B Discord Bot (Greenfield)

```
I'm building the Discord bot for BGMI Tournament Management (separate repo/folder).

Read the backend contract from:
- pt-maker-backend/docs/tournament-management-implementation-plan.md (§7.3, §8)

Goal (Phase B bot only):
1. Discord.js bot skeleton with env config
2. OAuth guild install flow → call backend PUT /tournaments/:id/discord/bind
3. /setup slash command: collect registration + announcement channel IDs, staff roles → save to backend
4. When backend emits REGISTRATION_OPENED: post register embed with button
5. Register button → modal (team name, starters with Discord tag + IGN + in-game ID, optional subs) → POST /bot/tournaments/:id/registrations
6. Poll GET /bot/events or accept webhook for events
7. On REGISTRATION_CLOSED: disable register button + announce

Backend is source of truth. Bot is thin client. Use idempotency keys from event payloads.
Stack: [your choice — discord.js v14 recommended]
```

---



### Prompt 4 — Phase C Verification + Waitlist

```
Phase C: Verification + Waitlist for BGMI Tournament Management in pt-maker-backend.

Read:
- docs/tournament-management-implementation-plan.md (§6, Phase C)
- Existing Phase A/B code you implemented

Goal:
1. VerificationSubmission model (Mode B)
2. Mode A: POST /bot/.../verification/player-status (external role check)
3. Team VERIFIED when ALL STARTERS verified; ignore sub verification for team status
4. TM verification queue approve/reject (app TM UI will consume)
5. Waitlist when cap full; TM promote/reject endpoints
6. Outbox: TEAM_VERIFIED, WAITLISTED, WAITLIST_PROMOTED

Also add player + bot verification submit endpoints.
Do not start structure engine yet.
```

---



### Prompt 5 — Phase D Structure Engine

```
Phase D: Tournament Structure Suggestion Engine in pt-maker-backend.

Read:
- docs/tournament-management-implementation-plan.md (§5.6, §11, Phase D)
- src/services/groupService.ts
- src/services/tournamentStageService.ts

Goal:
1. TournamentStructureProposal model
2. POST /tournaments/:id/structure/suggest — uses confirmed verified team count + lobbySize + funnel ratios from doc
3. Draw modes: RANDOM, SNAKE (manual assignments stored but not auto-applied)
4. POST confirm → create TournamentStage + Group records
5. PUT manual team move between groups
6. Suggest only — TM must confirm (no auto-apply)

Do not wire Discord events yet.
```

---



### Prompt 6 — Phase E Match Loop + Qualification Confirm

```
Phase E: Match-day loop + qualification proposal in pt-maker-backend.

Read:
- docs/tournament-management-implementation-plan.md (Phase E)
- src/services/teamQualificationService.ts
- src/services/tournamentStageService.ts (completeStageProgression)
- src/controllers/teamAdvancementController.ts

Goal:
1. QualificationProposal model — auto-suggest top-N from leaderboard
2. TM confirm/untick before mutating team statuses or progressing
3. On confirm: reuse existing progressTeamsToNextStage + slot assignment
4. Stage activate endpoint → outbox STAGE_ACTIVATED with roleActions payload
5. On qualification confirm → TEAMS_QUALIFIED outbox; on un-tick → QUALIFICATION_REVERTED
6. Do NOT auto-qualify on POST qualify anymore — replace with suggest → confirm flow

Keep existing match result + leaderboard code.
```

---



### Prompt 7 — Phase F Part 6 Operational

```
Phase F: Part 6 operational features for BGMI Tournament Management in pt-maker-backend.

Read:
- docs/tournament-management-implementation-plan.md (§12, Phase F)

Implement all:
- StageCheckIn + captain check-in API
- RosterLock + RosterChangeLog
- SmurfFlag (cross-tournament in-game ID lookup)
- Dispute + resolution
- PointPenalty + standings recalc
- PublicStandingsToken + GET /public/standings/:token
- AuditLog on every admin override
- Scheduled reminders → outbox CHECKIN_REMINDER

Emit appropriate DiscordSyncOutbox events for each.
```

---



### Prompt 8 — Phase G Export + Closure

```
Phase G: Tournament exports + closure in pt-maker-backend.

Read:
- docs/tournament-management-implementation-plan.md (§13, Phase G)
- src/services/excelExportService.ts (QuickPT pattern — reuse pattern not entities)

Goal:
1. On-demand Excel exports: roster, standings, stage, full archive
2. Upload to R2 + signed download URL (same as QuickPT)
3. Champion declaration endpoint + CHAMPION_DECLARED outbox event
4. Tournament status → COMPLETED + archive snapshot

No Google Sheets API.
```

---



### Prompt 9 — Flutter App (Single App, Dual UI)

```
I'm building the Flutter app for BGMI Tournament Management — ONE app, two modes at login.

Read backend API plan:
- pt-maker-backend/docs/tournament-management-implementation-plan.md (§7, §9)

Architecture:
- Login → choose "Tournament Manager" or "Player"
- Same JWT auth, same API base URL, separate navigation shells

Implement [SPECIFY PHASE: A player register / TM create / C verification / etc.]:

Phase A screens:
- Role picker after login
- Player: browse open tournaments, registration form (solo/duo/squad + subs)
- TM: my tournaments, create tournament, registration list with polling counters, open/close registration

Use clean architecture: api client, repositories, feature folders for tm/ and player/.
Backend base URL from env. Match API shapes from backend Phase A implementation.
```

---



### Prompt 10 — Full context refresh (any chat)

```
Context refresh for BGMI Tournament Management.

Read entirely: docs/tournament-management-implementation-plan.md

Key facts:
- Backend = source of truth (pt-maker-backend)
- Discord bot = separate repo, thin client
- Flutter = single app, TM vs Player at login
- v1 format: BATTLE_ROYALE_POINTS (BGMI) only
- Verification: all starters must verify; subs don't matter for team verified status
- Waitlist: TM manual promote
- Structure engine: suggest → TM confirm
- QuickPT is separate forever
- Exports: on-demand Excel (not Google Sheets)

I'm currently on Phase [X]. Continue from where we left off without breaking unrelated code.
```

---



## Appendix: Existing route map (reference)


| Prefix                                 | Purpose                                       |
| -------------------------------------- | --------------------------------------------- |
| `/api/v1/tournaments`                  | Tournament CRUD (extend)                      |
| `/api/v1/tournament-stages`            | Stages (extend)                               |
| `/api/v1/groups`                       | Groups (extend)                               |
| `/api/v1/team-registrations`           | Registrations (redesign)                      |
| `/api/v1/matches`                      | Matches                                       |
| `/api/v1/match-results`                | Results                                       |
| `/api/v1/team-advancement`             | Qualification/progression (add confirm layer) |
| `/api/v1/leaderboards`                 | Standings                                     |
| `/api/v1/collaborators`                | TM team permissions                           |
| **New** `/api/v1/player/...`           | Player mode                                   |
| **New** `/api/v1/bot/...`              | Discord bot service                           |
| **New** `/api/v1/public/standings/...` | Public page                                   |


---

*End of implementation plan.*