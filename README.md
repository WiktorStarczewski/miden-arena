# Miden Arena

**Provably fair on-chain card battles — powered by Miden, the Privacy Blockchain.**

Miden Arena is a fully on-chain, two-player tactical combat game built on top of the [Miden](https://polygon.technology/polygon-miden) rollup. Two players draft teams of three champions from a shared pool of ten, then battle head-to-head in a turn-based commit-reveal combat system. Every move and every draft pick is transmitted as a Miden note — there is **no backend server**. The entire multiplayer protocol runs peer-to-peer through the blockchain's UTXO note model.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Game Flow](#game-flow)
  - [Title Screen](#title-screen)
  - [Wallet Setup](#wallet-setup)
  - [Lobby & Matchmaking](#lobby--matchmaking)
  - [Champion Draft](#champion-draft)
  - [Battle](#battle)
  - [Game Over](#game-over)
- [Champions](#champions)
  - [Roster](#roster)
  - [Abilities](#abilities)
- [Element System](#element-system)
- [Combat Engine](#combat-engine)
  - [Damage Formula](#damage-formula)
  - [Burn Damage](#burn-damage)
  - [Turn Order](#turn-order)
  - [Ability Types](#ability-types)
  - [Move Encoding](#move-encoding)
- [Draft System](#draft-system)
- [Commit-Reveal Protocol](#commit-reveal-protocol)
  - [Why Commit-Reveal](#why-commit-reveal)
  - [Commitment Phase](#commitment-phase)
  - [Reveal Phase](#reveal-phase)
  - [Verification](#verification)
  - [NoteAttachment Transport](#noteattachment-transport)
- [Staking (Planned)](#staking-planned)
- [Miden Blockchain Integration](#miden-blockchain-integration)
  - [Session Wallet Architecture](#session-wallet-architecture)
  - [Note-Based Multiplayer](#note-based-multiplayer)
  - [Protocol Constants](#protocol-constants)
- [3D Rendering & Visual Effects](#3d-rendering--visual-effects)
  - [Draft Stage](#draft-stage)
  - [Battle Arena](#battle-arena)
  - [Champion Models](#champion-models)
  - [Attack Effects](#attack-effects)
  - [Elemental Auras](#elemental-auras)
  - [Post-Processing](#post-processing)
- [Audio System](#audio-system)
- [State Management](#state-management)
- [Persistence](#persistence)
- [Testing](#testing)
- [Configuration](#configuration)
- [Scripts](#scripts)

---

## Features

- **10 unique champions** across 4 elements (Fire, Water, Earth, Wind), each with 2 abilities
- **Snake draft** (A-B-B-A-A-B) from a shared pool of 10 — every pick matters
- **Cryptographic commit-reveal combat** — neither player can cheat or see the other's move before committing
- **Staking (planned)** — 10 MIDEN per player, winner takes all; see [VerificationService.md](./VerificationService.md) for the trustless escrow design
- **Zero backend** — all communication via Miden blockchain notes; no WebSocket server, no matchmaking service
- **3D champion previews and battle scenes** — Three.js with cel-shaded toon materials, per-element projectiles, camera shake, bloom, and particle effects
- **Responsive design** — works on desktop and mobile with adaptive UI layouts
- **Session wallet** — one browser popup per entire game session; all subsequent transactions are automatic
- **Sound system** — music playlists per screen (menu, draft, battle), SFX for game events, and per-champion voice announcements
- **61 unit tests** covering damage calculation, combat resolution, commitment cryptography, move encoding, draft logic, and full protocol integration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| 3D Engine | Three.js 0.170 via React Three Fiber 9 + Drei 10 |
| Post-Processing | @react-three/postprocessing 3 |
| Animations | Framer Motion 11, React Spring 9 |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Blockchain | Miden SDK (WASM) — `@miden-sdk/miden-sdk`, `@miden-sdk/react` |
| Wallet | `@miden-sdk/miden-wallet-adapter` |
| Build | Vite 6 |
| Language | TypeScript 5 |
| Testing | Vitest 3 |
| Fonts | Marcellus (display), Lora (body) — Google Fonts |

---

## Getting Started

### Prerequisites

- Node.js 18+
- The Miden client SDK built locally at `../miden-client` (for `@miden-sdk/miden-sdk` and `@miden-sdk/react`)
- A Miden-compatible browser wallet extension

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The dev server starts at `http://localhost:5173` with:
- COOP/COEP headers enabled (required for WASM SharedArrayBuffer)
- gRPC-web proxy to `https://rpc.testnet.miden.io`
- Local Miden SDK served from `../miden-client`

### Build

```bash
npm run build
```

Runs TypeScript type checking followed by Vite production build.

---

## Project Structure

```
miden-arena/
├── index.html                      # Entry HTML with Google Fonts, FOUC prevention
├── package.json                    # Dependencies and scripts
├── vite.config.ts                  # Vite config with WASM dedup, CORS proxy
├── tsconfig.json                   # TypeScript configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── VerificationService.md          # Planned trustless staking architecture
│
├── public/
│   ├── models/                     # GLB champion models + animation files
│   │   ├── inferno.glb
│   │   ├── inferno.idle.glb
│   │   ├── inferno.attack1.glb
│   │   ├── inferno.hit_reaction.glb
│   │   └── ... (per champion)
│   └── audio/
│       ├── music/                  # Playlist tracks (m4a)
│       │   ├── menu_1.m4a … menu_3.m4a
│       │   ├── draft_1.m4a, draft_2.m4a
│       │   └── battle_1.m4a … battle_3.m4a
│       ├── sfx/                    # Sound effects (m4a)
│       │   └── attack, hit, ko, select, pick, confirm, victory, defeat
│       └── voices/                 # Per-champion name announcements (m4a)
│           └── inferno, boulder, ember, ... (10 files)
│
└── src/
    ├── main.tsx                    # React root mount
    ├── App.tsx                     # Screen router with AnimatePresence transitions
    ├── index.css                   # Tailwind import, CSS variables, font-display class
    ├── three-extend.ts             # Three.js catalogue extension
    │
    ├── screens/                    # Top-level screen components
    │   ├── TitleScreen.tsx         # Animated title, PLAY button
    │   ├── SetupScreen.tsx         # 5-step wallet setup wizard
    │   ├── LobbyScreen.tsx         # Host/Join game modes
    │   ├── DraftScreen.tsx         # 3D preview + snake draft UI
    │   ├── PreBattleLoadingScreen.tsx  # Model preloader
    │   ├── BattleScreen.tsx        # 3D arena + battle HUD
    │   ├── GameOverScreen.tsx      # Results, MVP, withdraw
    │   ├── LoadingScreen.tsx       # Initial loading state
    │   └── ErrorScreen.tsx         # Fallback error display
    │
    ├── scenes/                     # Three.js 3D scenes
    │   ├── DraftStage.tsx          # Rotating champion pedestal
    │   ├── DraftBackground.tsx     # Per-champion parallax background
    │   ├── ArenaScene.tsx          # Battle arena with 2 champions
    │   ├── ChampionModel.tsx       # GLB loader with animation system
    │   ├── AttackEffect.tsx        # Projectile + impact VFX
    │   ├── ElementalAura.tsx       # Per-element particle auras
    │   ├── ArenaEnvironment.tsx    # Arena ground, lighting, pillars
    │   ├── AmbientParticles.tsx    # Dust, wisps, fireflies
    │   └── PostProcessing.tsx      # Bloom, vignette, hit flash
    │
    ├── components/
    │   ├── battle/                 # Battle-specific UI
    │   │   ├── BattleHUD.tsx       # Health bars, abilities, confirm
    │   │   ├── BattleLog.tsx       # Turn event history
    │   │   ├── ChampionSelector.tsx # Switch active champion
    │   │   └── CommitRevealStatus.tsx # Protocol status display
    │   ├── draft/                  # Draft-specific UI
    │   │   ├── DraftPool.tsx       # Available champions grid
    │   │   ├── DraftTimeline.tsx   # A-B-B-A-A-B pick order visual
    │   │   ├── ElementChart.tsx    # Type advantage diagram
    │   │   └── TeamPreview.tsx     # Drafted team display
    │   ├── layout/                 # Shared layout
    │   │   ├── GameLayout.tsx      # Page frame with header
    │   │   ├── GlassPanel.tsx      # Glassmorphism card
    │   │   └── ScreenTransition.tsx # Framer Motion page transitions
    │   └── ui/                     # Reusable UI primitives
    │       ├── AbilityCard.tsx     # Ability display card
    │       ├── AccountBadge.tsx    # Miden address badge + copy
    │       ├── ChampionCard.tsx    # Champion stat card
    │       ├── DamageNumber.tsx    # Floating damage indicator
    │       ├── ElementBadge.tsx    # Element colored pill
    │       ├── HealthBar.tsx       # Animated HP bar
    │       ├── StatusEffectIcon.tsx # Buff/debuff/burn icons
    │       ├── Timer.tsx           # Countdown timer
    │       ├── TransactionProgress.tsx # TX spinner
    │       └── TurnPhaseIndicator.tsx  # Phase status label
    │
    ├── engine/                     # Pure game logic (no React)
    │   ├── damage.ts              # Damage formula + burn
    │   ├── combat.ts              # Turn resolution + team state
    │   ├── commitment.ts          # SHA-256 commit-reveal crypto
    │   ├── codec.ts               # Move/draft encoding
    │   ├── draft.ts               # Draft pool + picker logic
    │   └── __tests__/             # Vitest test suites
    │       ├── damage.test.ts     # 8+ tests
    │       ├── combat.test.ts     # 9+ tests
    │       ├── commitment.test.ts # 21 tests
    │       ├── codec.test.ts      # 8+ tests
    │       ├── draft.test.ts      # 7+ tests
    │       └── protocol.test.ts   # 40 tests (full integration)
    │
    ├── audio/
    │   └── audioManager.ts         # Singleton audio: music playlists, SFX, voices
    │
    ├── hooks/                     # React hooks for game systems
    │   ├── useSessionWallet.ts    # Wallet setup flow
    │   ├── useMatchmaking.ts      # Host/join protocol
    │   ├── useDraft.ts            # Draft pick management
    │   ├── useCommitReveal.ts     # Cryptographic move exchange
    │   ├── useCombatTurn.ts       # Turn lifecycle orchestrator
    │   ├── useNoteDecoder.ts      # Note filtering & categorization
    │   └── useStaking.ts          # P2IDE stake management
    │
    ├── store/                     # Zustand state
    │   ├── gameStore.ts           # Central game store
    │   └── selectors.ts           # Derived selectors
    │
    ├── constants/                 # Game data & protocol values
    │   ├── champions.ts           # All 10 champion definitions
    │   ├── elements.ts            # Element matchup table
    │   ├── miden.ts               # Blockchain constants
    │   └── protocol.ts            # Note signal values
    │
    ├── types/                     # TypeScript type definitions
    │   ├── game.ts                # Champion, Ability, Buff, TurnEvent, etc.
    │   ├── protocol.ts            # CommitData, RevealData, NoteSignal
    │   └── index.ts               # Re-exports
    │
    └── utils/                     # Shared utilities
        ├── bytes.ts               # BigInt ↔ byte array conversion
        ├── formatting.ts          # Display formatting helpers
        ├── persistence.ts         # localStorage wrapper
        ├── sounds.ts              # Audio utilities
        └── __tests__/
            └── bytes.test.ts      # Byte utility tests
```

---

## Game Flow

### Title Screen

The entry point displays an animated title — "MIDEN ARENA" — with a radial amber gradient on a dark `#0a0a1a` background. A large "PLAY" button transitions to the wallet setup screen. The tagline reads: *"Provably fair on-chain card battles / Powered by Miden, the Privacy Blockchain"*. A decorative footer shows *"10 Champions · 4 Elements · Commit-Reveal Combat"*.

### Wallet Setup

A 5-step progress wizard:

1. **Connect Wallet** — opens the Miden browser extension popup to approve the connection
2. **Create Session Wallet** — generates a local Falcon-512 key pair via the Miden client. This session wallet is used for all subsequent in-game transactions without additional popups
3. **Fund Session (15 MIDEN)** — the MidenFi wallet sends 15,000,000 microtokens to the session wallet for protocol note fees (matchmaking, draft picks, commit-reveal moves)
4. **Claim Funds** — the session wallet consumes the incoming funding note (polled every 3 seconds)
5. **Ready** — "Enter Lobby" button appears

The session wallet ID and MidenFi address are persisted to `localStorage`. On page reload, the setup is restored without re-running the wizard.

### Lobby & Matchmaking

The lobby offers two modes:

- **Host Game** — displays your session wallet ID for your opponent to copy. A pulsing "Waiting for opponent..." indicator shows while listening for incoming `JOIN_SIGNAL` (amount `100n`) notes. Upon receiving a join request, the host sends an `ACCEPT_SIGNAL` (amount `101n`) back. If rehosting (previous opponent exists), a `LEAVE_SIGNAL` (amount `102n`) is sent to the old opponent first.

- **Join Game** — enter the host's session wallet ID (bech32 `mtst1...` format). Sends a `JOIN_SIGNAL` note and waits for the `ACCEPT_SIGNAL` response.

Once matched, a "Match Found!" panel appears with the opponent's account badge, and both players transition to the draft.

### Champion Draft

The draft screen is split vertically:

- **Top half (50vh)** — a 3D canvas (`DraftStage`) renders the currently previewed champion rotating on a glowing pedestal with element-colored lighting. Overlaid on the 3D scene:
  - Left rail: **Draft Timeline** showing the A-B-B-A-A-B pick order with completed (green), active (purple/amber), and upcoming (grey) indicators
  - Right rail: **Element Chart** showing the Fire → Earth → Wind → Water → Fire advantage cycle with directional arrows

  On mobile, these are thin compact vertical rails. On desktop (sm+), they expand into full glass panels.

- **Bottom half** — the draft UI with:
  - Turn indicator ("Your Pick!" / "Opponent is choosing...")
  - Pick button styled with the previewed champion's element color gradient
  - Two team preview rows (Your Team / Opponent) showing drafted champions as name + element color bar
  - Scrollable grid of available champions from the remaining pool

The draft follows a **snake order**: picks alternate A-B-B-A-A-B where "A" is the host and "B" is the joiner. Each pick is transmitted as a note with amount `championId + 1` (range 1–10). After all 6 picks, both teams are locked and the game transitions through a model preloading screen into battle.

### Battle

The battle screen has two zones:

- **Top (35vh)** — the 3D arena with both champions facing each other on a toon-shaded ground with crystal pillars, ambient particles, and fog. Projectile attacks fly between champions with element-specific shapes, impact explosions, camera shake, and floating damage/buff indicators.

- **Bottom** — the Battle HUD with:
  - Opponent's champion info (name, element, HP bar, status effects)
  - Turn phase indicator
  - Your champion info + champion selector (if multiple survivors)
  - Two ability cards
  - Confirm Move button

Each turn follows a 7-phase lifecycle:

1. **Choosing** — select champion + ability, press Confirm
2. **Committing** — SHA-256 commitment of your move sent via NoteAttachment
3. **Waiting for Commit** — waiting for opponent's commitment note
4. **Revealing** — your actual move + nonce sent via NoteAttachment
5. **Waiting for Reveal** — waiting for opponent's reveal note
6. **Resolving** — both moves decoded, damage calculated, state updated
7. **Animating** — 4-second animation sequence showing both actions sequentially

After animation, if a team is eliminated the game ends. Otherwise, the next round begins. The champion with the highest total damage dealt across both teams is crowned MVP.

### Game Over

The results screen shows:
- **VICTORY / DEFEAT / DRAW** banner
- Total rounds played and surviving champions (X/3)
- MVP panel highlighting the champion with the most total damage dealt
- "Play Again" and "Lobby" buttons (both reset game state)

---

## Champions

### Roster

| ID | Name | Element | HP | ATK | DEF | SPD | Archetype |
|----|------|---------|-----|-----|-----|-----|-----------|
| 0 | **Inferno** | Fire | 80 | 20 | 5 | 16 | Glass cannon with DoT |
| 1 | **Boulder** | Earth | 140 | 14 | 16 | 5 | Slow tank with self-buff |
| 2 | **Ember** | Fire | 90 | 16 | 8 | 14 | Balanced fire mage |
| 3 | **Torrent** | Water | 110 | 12 | 12 | 10 | Healer/attacker hybrid |
| 4 | **Gale** | Wind | 75 | 15 | 6 | 18 | Fastest champion, speed buffer |
| 5 | **Tide** | Water | 100 | 11 | 14 | 9 | Defensive debuffer |
| 6 | **Quake** | Earth | 130 | 13 | 15 | 7 | Heavy wall with burst shield |
| 7 | **Storm** | Wind | 85 | 17 | 7 | 15 | High ATK wind striker |
| 8 | **Phoenix** | Fire | 65 | 22 | 4 | 17 | Highest ATK, self-heal |
| 9 | **Kraken** | Water | 120 | 10 | 16 | 6 | Durable defensive tank |

### Abilities

Every champion has exactly 2 abilities. The first is always a damage-dealing attack; the second is a utility ability (heal, buff, debuff, or damage-over-time).

| Champion | Ability 1 | Power | Type | Ability 2 | Power/Value | Type | Details |
|----------|-----------|-------|------|-----------|-------------|------|---------|
| **Inferno** | Eruption | 35 | damage | Scorch | 15 | damage_dot | Applies 3-turn burn |
| **Boulder** | Rock Slam | 28 | damage | Fortify | +6 DEF | buff | 2-turn duration |
| **Ember** | Fireball | 25 | damage | Flame Shield | +5 DEF | buff | 2-turn duration |
| **Torrent** | Tidal Wave | 22 | damage | Heal | +25 HP | heal | Capped at max HP |
| **Gale** | Wind Blade | 24 | damage | Haste | +5 SPD | buff | 2-turn duration |
| **Tide** | Whirlpool | 20 | damage | Mist | -4 ATK | debuff | 2-turn, applied to opponent |
| **Quake** | Earthquake | 26 | damage | Stone Wall | +8 DEF | buff | 1-turn duration (burst) |
| **Storm** | Lightning | 30 | damage | Dodge | +6 SPD | buff | 2-turn duration |
| **Phoenix** | Blaze | 38 | damage | Rebirth | +30 HP | heal | Highest single heal |
| **Kraken** | Depth Charge | 24 | damage | Shell | +7 DEF | buff | 2-turn duration |

---

## Element System

Four elements form a cyclical advantage system:

```
    Fire
   ↗    ↘
Water ← Wind
   ↖    ↙
    Earth
```

**Fire beats Earth → Earth beats Wind → Wind beats Water → Water beats Fire**

| Matchup | Multiplier |
|---------|-----------|
| Super effective (e.g., Fire → Earth) | **1.5×** |
| Resisted (e.g., Fire → Water) | **0.67×** |
| Neutral (e.g., Fire → Wind) | **1.0×** |
| Same element | **1.0×** |

Element colors used throughout the UI:

| Element | Color | Hex |
|---------|-------|-----|
| Fire | Orange-red | `#ff6b35` |
| Water | Light blue | `#4fc3f7` |
| Earth | Brown | `#8d6e63` |
| Wind | Light green | `#aed581` |

---

## Combat Engine

All combat logic lives in `src/engine/` as pure functions with zero React dependencies, making them fully testable.

### Damage Formula

```
effectiveAttack  = max(0, attacker.attack - Σ(attack debuffs on attacker))
baseDamage       = ability.power × (1 + effectiveAttack / 20)
typeMultiplier   = elementMatchup(attacker.element, defender.element)
effectiveDefense = defender.defense + Σ(defense buffs on defender)
finalDamage      = max(1, floor(baseDamage × typeMultiplier - effectiveDefense))
```

Example: Ember (ATK 16) uses Fireball (power 25) against Boulder (DEF 16, Earth):
- `baseDamage = 25 × (1 + 16/20) = 25 × 1.8 = 45`
- `typeMultiplier = 1.5` (Fire → Earth, super effective)
- `finalDamage = max(1, floor(45 × 1.5 - 16)) = max(1, floor(51.5)) = 51`

### Burn Damage

Applied at the end of each turn for champions with active burn:

```
burnDamage = max(1, floor(champion.maxHp × 0.1))
```

Burn ticks down each turn. Inferno's Scorch applies a 3-turn burn.

### Turn Order

1. Both players' moves are revealed simultaneously via commit-reveal
2. The faster champion acts first (higher effective speed = base speed + speed buff total)
3. Speed tie is broken by **lower champion ID** (deterministic)
4. If the first attacker KOs the defender, the second attack is skipped
5. After both actions resolve: burn damage ticks, buff durations decrement, expired buffs are removed

### Ability Types

| Type | Target | Effect |
|------|--------|--------|
| `damage` | Opponent | Deals calculated damage |
| `damage_dot` | Opponent | Deals damage + applies burn (if `appliesBurn`) |
| `heal` | Self | Restores `healAmount` HP (capped at max) |
| `buff` | Self | Adds stat modifier for `duration` turns |
| `debuff` | Opponent | Adds negative stat modifier for `duration` turns |

### Move Encoding

Moves are encoded as integers 1–20 for transmission:

```
encoded = championId × 2 + abilityIndex + 1
```

- Champion 0, Ability 0 → 1
- Champion 0, Ability 1 → 2
- Champion 4, Ability 0 → 9
- Champion 9, Ability 1 → 20

Draft picks are encoded as `championId + 1` (range 1–10).

---

## Draft System

The draft uses a **snake order** to ensure fairness:

| Pick # | Player |
|--------|--------|
| 1 | Host (A) |
| 2 | Joiner (B) |
| 3 | Joiner (B) |
| 4 | Host (A) |
| 5 | Host (A) |
| 6 | Joiner (B) |

This pattern (`A-B-B-A-A-B`) gives the second picker two consecutive picks to compensate for not picking first.

- Pool starts with all 10 champions (IDs 0–9)
- Each pick removes the champion from the pool for both players
- Teams are 3 champions each
- Draft state is persisted to `localStorage` to survive page reloads

---

## Commit-Reveal Protocol

### Why Commit-Reveal

In a simultaneous-move game, neither player should see the other's choice before committing to their own. Miden Arena implements this cryptographically:

1. Both players **commit** a hash of their move (without revealing the move itself)
2. Once both commitments are on-chain, both players **reveal** their actual moves
3. Each player verifies the opponent's reveal matches their commitment
4. Only then is the turn resolved

This makes cheating impossible — changing your move after seeing the opponent's commitment would require breaking SHA-256.

### Commitment Phase

```typescript
// Generate random 4-byte nonce
nonce = crypto.getRandomValues(new Uint8Array(4))

// Hash: SHA-256(move || nonce)
hash = SHA-256([move, ...nonce])

// Extract first 32 bits as two 16-bit values
part1 = (hash[0] << 8 | hash[1]) + 1n    // range [1, 65536]
part2 = (hash[2] << 8 | hash[3]) + 1n    // range [1, 65536]
```

### Reveal Phase

```typescript
// Split 4-byte nonce into two 16-bit values
noncePart1 = nonce[0] << 8 | nonce[1]    // range [0, 65535]
noncePart2 = nonce[2] << 8 | nonce[3]    // range [0, 65535]
```

### Verification

The verifier reconstructs the hash from the revealed move + nonce parts and checks it matches the commitment. Because Miden note arrival order is non-deterministic, verification tries all 4 combinations of `(part1, part2) × (noncePart1, noncePart2)` swaps.

### NoteAttachment Transport

Game data is carried in **NoteAttachment** fields rather than token amounts. This was a critical design decision:

**Problem with amount-based encoding**: Each turn required 5 notes totalling ~265,000 microtokens. With only ~15M in the session wallet, the wallet would be drained after relatively few turns.

**Solution**: Protocol notes carry a fixed `1n` amount with game data in the attachment's Word:

**Commit note** (1 note, amount `1n`):
```
Word([
  Felt(1n),          // MSG_TYPE_COMMIT
  Felt(hashPart1),   // 16-bit hash chunk
  Felt(hashPart2),   // 16-bit hash chunk
  Felt(0n),          // padding
])
```

**Reveal note** (1 note, amount `1n`):
```
Word([
  Felt(2n),              // MSG_TYPE_REVEAL
  Felt(move),            // raw move (1-20)
  Felt(noncePart1),      // raw nonce uint16
  Felt(noncePart2),      // raw nonce uint16
])
```

Notes use `NoteAttachment.newWord()` (Word = 4 felts, no advice map) to avoid a bug in miden-standards 0.13.x that affected Array attachments.

This reduces wallet drain from ~265,000 per turn to just **2n per turn** (1 commit + 1 reveal note), making games of 50+ turns viable.

---

## Staking (Planned)

Staking is **not yet active**. The `useStaking` hook exists with `sendStake()` and `withdraw()` fully coded, but staking is not wired into the game flow — `sendStake()` is never called, so the 15 MIDEN funded to the session wallet stays untouched during gameplay.

The current peer-to-peer staking design (each player sends 10 MIDEN directly to the other) has a fundamental trust issue: since combat resolution is client-side, there is no on-chain enforcement of who won. A trustless solution requires an escrow account + verification service.

See **[VerificationService.md](./VerificationService.md)** for the planned architecture:
- Both players stake to an on-chain escrow account
- A verification service reads public commit-reveal notes, replays the deterministic combat engine, and attests the winner
- The escrow releases the pot based on the service's signed attestation
- Timeout refund protects against service downtime or player abandonment

---

## Miden Blockchain Integration

### Session Wallet Architecture

Miden Arena uses a **session wallet** pattern to avoid repeated browser extension popups:

1. User connects their MidenFi wallet (browser extension) — **one popup**
2. App creates a local session wallet (Falcon-512 keypair) via the Miden client SDK
3. MidenFi sends 15 MIDEN to the session wallet (protocol note budget)
4. All subsequent game transactions (draft picks, commits, reveals, stakes) are sent from the session wallet automatically — **zero popups**
5. At game end, remaining funds are sent back to MidenFi

### Note-Based Multiplayer

Every game action is a Miden note sent from one player's session wallet to the other's:

| Action | Note Amount | Attachment |
|--------|------------|------------|
| Join request | `100n` | None |
| Accept match | `101n` | None |
| Leave/rehost | `102n` | None |
| Draft pick | `1n–10n` (championId + 1) | None |
| Commit move | `1n` | `[MSG_TYPE_COMMIT, hashPart1, hashPart2]` |
| Reveal move | `1n` | `[MSG_TYPE_REVEAL, move, noncePart1, noncePart2]` |
| Stake (planned) | `10,000,000n` | None |

Notes are detected by polling `useNotes({ status: "committed" })` from the Miden React SDK, filtered by sender (opponent's account ID). A deduplication system tracks handled note IDs to prevent re-processing.

### Protocol Constants

```typescript
// Matchmaking signals
JOIN_SIGNAL    = 100n
ACCEPT_SIGNAL  = 101n
LEAVE_SIGNAL   = 102n

// Draft
DRAFT_PICK_MIN = 1n     // championId 0
DRAFT_PICK_MAX = 10n    // championId 9

// Battle moves
MOVE_MIN = 1n           // champion 0, ability 0
MOVE_MAX = 20n          // champion 9, ability 1

// Attachment message types
MSG_TYPE_COMMIT = 1n
MSG_TYPE_REVEAL = 2n

// Draft order
DRAFT_ORDER = ["A", "B", "B", "A", "A", "B"]
TEAM_SIZE   = 3
POOL_SIZE   = 10

// Blockchain
MIDEN_FAUCET_ID       = "mtst1aqmat9m63ctdsgz6xcyzpuprpulwk9vg_qruqqypuyph"
MIDEN_DECIMALS        = 6
STAKE_AMOUNT          = 10_000_000n   // 10 MIDEN
FUND_AMOUNT           = 15_000_000n   // 15 MIDEN (protocol note budget)
RECALL_BLOCK_OFFSET   = 200
PROTOCOL_NOTE_AMOUNT  = 1n
```

---

## 3D Rendering & Visual Effects

### Draft Stage

The draft preview renders a single champion on a glowing pedestal:

- **Canvas**: DPR 1.5, FOV 35, camera at `[0, 2.5, 4.5]`, shadow maps enabled
- **Adaptive quality**: `PerformanceMonitor` + `AdaptiveDpr` (DPR range 1–2)
- **Interaction**: Drag-to-rotate with pointer capture (sensitivity 0.01 rad/px), auto-rotate at 0.4 rad/s
- **Pedestal**: Cylinder base + accent ring in element color + inner glowing disc
- **Lighting**: Top spotlight, front directional, back rim light, element-colored point light below the model
- **Environment**: Night preset with bloom (intensity 0.6) and vignette
- **Per-champion themed background** (`DraftBackground`): Multi-layer parallax scene unique to each champion:
  - **Gradient sky** — two-tone color wash (custom ShaderMaterial with `topColor`/`bottomColor` uniforms)
  - **Midground silhouettes** — procedural BufferGeometry shapes (peaks, waves, dunes, crystals, clouds, coral, rays, tentacles) in dark tints
  - **Atmospheric particles** — floating embers, dust motes, rain, bubbles, etc. using Points with AdditiveBlending
  - **Mouse-reactive parallax** — 3 depth layers shift at different rates based on pointer position (back ±0.1, mid ±0.3, front ±0.5)
  - **Smooth crossfade** — colors and parameters lerp over ~1 second when switching champions
  - All 10 champions have visually distinct themes (e.g., Inferno: volcanic peaks + rising embers; Kraken: abyss + bioluminescent dots; Storm: thunderclouds + lightning)

### Battle Arena

Two champions face each other in a dark fantasy arena:

- **Canvas**: DPR 1.5, FOV 40, camera at `[0, 4, 7]`
- **Champion positions**: Left `[-2, 0, 0]` (player), Right `[2, 0, 0]` (opponent)
- **Camera**: Subtle orbital drift + shake system (registered via module-level singleton callback)
  - Hit shake: intensity 0.25, duration 0.5s
  - KO shake: intensity 0.35, duration 0.6s
- **Arena ground**: 20×20 toon-shaded plane + lighter inner overlay + center line + perimeter ring
- **Crystal pillars**: 4 glowing columns at arena corners with point lights and sparkles
- **Ambient particles**: 80 dust motes (gentle drift), 20 purple energy wisps (slow orbit), 15 yellow firefly sparkles (blinking)
- **Fog**: Distance fog for atmospheric depth
- **Post-processing**: Bloom (intensity 0.8), vignette, hit flash (white overlay on impact)

### Champion Models

Each champion has a `.glb` model file with separate animation files:

- **Loading**: `useGLTF` from Drei; external animation clips loaded from `{model}.{animation}.glb`
- **Available animations**: `idle`, `attack1`, `hit_reaction`
- **Animation blending**: 0.25s fade in/out between clips
- **Material**: `meshToonMaterial` with 4-step `DataTexture` gradient map for cel-shading
- **Orientation**: Champions face each other at ±60° (3/4 view); opponent side is mirrored on X axis
- **Fallback**: Slowly rotating colored box shown while GLB loads

### Attack Effects

A three-phase projectile system per attack:

**1. Travel (0.20s)**
- Straight-line lerp from attacker to defender position
- Element-specific projectile geometry:
  - **Fire**: Rotating sphere cluster with 7 flame tongues
  - **Water**: Horizontally elongated blob with wave pulsation + trailing droplets
  - **Earth**: Spinning dodecahedron with rocky crust + 6 orbiting rock chunks
  - **Wind**: Vortex with 6 spinning blade arms + outer wispy ring
- 18-segment mesh trail behind projectile
- Sparkles cloud, 2 point lights
- Projectile grows 40% as it approaches target

**2. Impact (0.40s)**
- Primary expanding sphere (up to 5× scale)
- Secondary expanding sphere
- Impact flash
- 3 staggered expanding rings
- Shockwave ring on ground (up to 7× scale)
- 3 layers of debris particles (60 + 40 + 25 particles)
- 3 Sparkles layers
- 3 point lights
- Triggers camera shake

**3. Linger (0.60s)**
- 40 rising particles that gradually fade out

### Elemental Auras

Each champion is surrounded by a four-layer sparkle system (primary, secondary, tertiary, quaternary) plus element-specific mesh effects:

- **Fire**: 8 rising ember meshes that float up, fade, and loop
- **Water**: 10 floating bubble meshes with gentle drift
- **Earth**: 6 orbiting box fragments with rotation
- **Wind**: 10 spinning leaf-like plane meshes in orbital paths

Additional effects: orbiting particle ring, pulsing ground glow ring (inner/outer rings + fill disc), 2 colored point lights. All particle counts scale with `performanceScale`.

### Post-Processing

Applied via `@react-three/postprocessing`:

- **Bloom**: Configurable intensity (0.6 in draft, 0.8 in battle), luminance threshold 0.6
- **Vignette**: Subtle edge darkening when enabled
- **Hit flash**: Brief white overlay triggered on attack impact

---

## Audio System

The game uses a singleton audio manager (`src/audio/audioManager.ts`) built on the Web Audio API. `initAudio()` must be called from a user gesture (triggered on the PLAY button) to satisfy browser autoplay policies. All audio functions are wrapped in try-catch — failures never crash the game.

### Music

Music is organised as **playlists** per screen. Tracks play sequentially within a playlist, looping back to the first when the last ends. Switching screens crossfades between playlists (1.5s fade).

| Screen | Tracks | Style |
|--------|--------|-------|
| Menu (title, setup, lobby) | `menu_1`, `menu_2`, `menu_3` | Lively dark waltz / driving |
| Draft | `draft_1`, `draft_2` | Dark, brooding |
| Battle | `battle_1`, `battle_2`, `battle_3` | Epic orchestral / intense |

Music plays at 40% master volume. The next track in the playlist is eagerly preloaded to avoid loading gaps.

### Sound Effects

One-shot SFX that support overlapping (each play creates a fresh `AudioBufferSourceNode`):

| SFX | Trigger |
|-----|---------|
| `attack` | Attack animation start |
| `hit` | Attack impact |
| `ko` | Champion knocked out |
| `select` | UI selection |
| `pick` | Draft champion picked |
| `confirm` | Move confirmed |
| `victory` | Game won |
| `defeat` | Game lost |

### Voice Announcements

Each champion has a name voice clip (`/audio/voices/{name}.m4a`) played when hovering over a champion in the draft pool. Only one voice clip plays at a time — starting a new one stops the current.

All audio files are `.m4a` format under `public/audio/`.

---

## State Management

The game uses a single Zustand store (`src/store/gameStore.ts`) with the following shape:

```typescript
{
  screen: "loading" | "title" | "setup" | "lobby" | "draft" | "preBattleLoading" | "battle" | "gameOver"

  setup: {
    midenFiAddress: string | null
    sessionWalletId: string | null
    step: "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done"
  }

  match: {
    opponentId: string | null
    role: "host" | "joiner" | null
  }

  draft: {
    pool: number[]               // remaining champion IDs
    myTeam: number[]
    opponentTeam: number[]
    currentPicker: "me" | "opponent"
    pickNumber: number           // 0-5, counts completed picks
    staleNoteIds: string[]
  }

  battle: {
    round: number
    phase: "choosing" | "committing" | "waitingCommit" | "revealing" | "waitingReveal" | "resolving" | "animating"
    myChampions: ChampionState[]
    opponentChampions: ChampionState[]
    selectedChampion: number | null
    selectedAbility: number | null
    myCommit: CommitData | null
    opponentCommitNotes: NoteRef[]
    myReveal: RevealData | null
    opponentReveal: RevealData | null
    turnLog: TurnRecord[]
    staleNoteIds: string[]
  }

  result: {
    winner: "me" | "opponent" | "draw" | null
    totalRounds: number
    mvp: number | null            // champion ID
  }
}
```

Derived selectors (`src/store/selectors.ts`): `useMySurvivors`, `useOpponentSurvivors`, `useCanSubmitMove`, `useSelectedChampionInfo`, `useMvp`, `useIsGameOver`, `useDraftProgress`.

---

## Persistence

The game persists critical state to `localStorage` (prefix `miden-arena:`) to survive page reloads:

| Key | Value |
|-----|-------|
| `miden-arena:sessionWalletId` | Session wallet bech32 address |
| `miden-arena:midenFiAddress` | MidenFi wallet address |
| `miden-arena:setupComplete` | Boolean flag |
| `miden-arena:opponentId` | Current opponent's account ID |
| `miden-arena:role` | `"host"` or `"joiner"` |
| `miden-arena:draftState` | JSON: pool, teams, pick number, processed notes |

On fresh page load, the app checks for persisted session data and restores the wallet setup state without re-running the wizard. Draft state is validated structurally before restoration.

---

## Testing

61 tests across 7 test files:

### Damage Tests (`damage.test.ts`)
- Basic damage with element advantage (Fire → Earth = 1.5×)
- Element disadvantage (Fire → Water = 0.67×)
- Neutral matchup (Fire → Wind = 1.0×)
- Defense buff damage reduction
- Attack debuff output reduction
- Minimum 1 damage floor
- Full 100-champion matchup matrix (10×10 pairs, all damage abilities)
- Burn damage (10% of max HP, minimum 1)

### Combat Tests (`combat.test.ts`)
- Correct initialization for all 10 champions
- Team elimination detection
- Speed-based turn ordering
- Speed tie breaking by lower ID
- Heal application with HP cap
- Buff application and duration tick-down
- Burn application and tick events
- KO prevents second attacker
- Debuff applied to opponent

### Commitment Tests (`commitment.test.ts`)
- Valid commitments for all moves 1–20
- Hash part ranges [1n, 65536n]
- Different nonces produce different commitments
- Invalid move rejection (0, 21, -1)
- Correct nonce splitting
- Deterministic output for known nonce
- Max nonce handling (65535n)
- Verification for all 20 moves
- Swapped commit parts verification
- Swapped nonce parts verification
- Both parts swapped verification
- Wrong move rejection
- Wrong nonce rejection
- Tampered commit rejection
- 1000 random roundtrip verifications
- 500 collision-free commitments
- FeltArray attachment format roundtrip
- All values within Miden Felt range (<2^63)

### Codec Tests (`codec.test.ts`)
- Move encode/decode roundtrip for all 20 moves
- Expected encoding values
- Invalid move decoding rejection
- Draft pick encode/decode roundtrip for all 10 champions
- Invalid draft pick rejection

### Draft Tests (`draft.test.ts`)
- Initial pool generation (0–9)
- Picker assignment per A-B-B-A-A-B order (host and joiner perspectives)
- Invalid pick number rejection
- Draft completion detection
- Pool removal and validity checks

### Protocol Integration Tests (`protocol.test.ts`) — 40 tests
Using a virtual `NoteNetwork` simulator and `SequentialWallet` concurrency model:

- **Matchmaking** (6): Full host-join flow, stale JOIN filtering on rehost, deferred baseline, first game baseline skip, multiple stale notes, LEAVE non-interference
- **Draft** (4): Amount ranges, roundtrip note exchange, stale pick filtering, no signal overlap
- **Commit-reveal** (8): Full attachment flow, parallel exchange, stale filtering, 1n amounts, all 4 ordering combinations (50 random × 4)
- **Attachment edge cases** (8): Non-attachment ignored, truncated commit/reveal, empty attachment, unknown type, commit/reveal not confused, extra felts tolerated
- **Mixed signals** (3): Attachment overlap with draft range, all signal coexistence, MSG_TYPE distinctness
- **Data integrity** (3): Hash parts preserved, reveal values preserved, values survive transit
- **Wallet drain** (3): 2n per turn, 20 turns = 40n, 50 turns viable
- **Multi-round** (3): 5 consecutive rounds, bidirectional 3-round exchange, round boundary snapshot
- **Wallet sequencing** (4): Concurrent send failure, sequential send success, rehost flow, first game flow
- **Full game flow** (1): End-to-end matchmaking → 6-pick snake draft → 1 battle round

### Run Tests

```bash
npm test           # single run
npm run test:watch # watch mode
```

---

## Configuration

### Vite (`vite.config.ts`)

- **WASM deduplication**: Forces a single instance of `@miden-sdk/miden-sdk` via `resolve.alias`, `resolve.dedupe`, and `resolve.preserveSymlinks` — critical for WASM class identity checks (`_assertClass`) to pass when using symlinked local packages
- **CORS headers**: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — required for SharedArrayBuffer / WASM threading
- **gRPC proxy**: `/rpc.Api` routes proxied to `https://rpc.testnet.miden.io` to bypass browser CORS restrictions on gRPC-web
- **Filesystem access**: Dev server serves files from both `.` and `../miden-client`
- **Build target**: ES2020
- **WASM exclusion**: `@miden-sdk/miden-sdk` excluded from Vite's dependency pre-bundling (`optimizeDeps.exclude`)

### CSS (`src/index.css`)

CSS custom properties for the dark fantasy theme:

```css
:root {
  --color-fire:    #ff6b35;
  --color-water:   #4fc3f7;
  --color-earth:   #8d6e63;
  --color-wind:    #aed581;
  --color-bg:      #0a0a1a;
  --color-panel:   rgba(0, 0, 0, 0.4);
  --color-border:  rgba(255, 255, 255, 0.1);
  --color-text:    #e0e0e0;
  --color-text-dim: #888;
  --color-accent:  #f59e0b;
}
```

---

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start development server (port 5173) |
| `build` | `tsc --noEmit && vite build` | Type check + production build |
| `preview` | `vite preview` | Preview production build locally |
| `typecheck` | `tsc --noEmit` | Run TypeScript type checker |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Run tests in watch mode |
