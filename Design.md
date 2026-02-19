# Miden Champions - Card Battle Game

## Context

A polished 2-player card battle game built on Miden blockchain demonstrating privacy, throughput, and trustless mechanics. Players draft champions from a shared roster, then battle turn-by-turn with provably fair commit-reveal. No backend beyond the Miden node RPC.

**Key constraints from the user:**
- Provably fair: even a hacked client cannot peek at the opponent's moves
- No honor system: cryptographic commit-reveal enforced
- Delegated proving (remote prover for fast transactions)
- Fully responsive / mobile-first (playable on phones)
- 1-second auto-sync for responsive gameplay
- Standalone repo at `~/miden/miden-arena`, packages from npm
- Top-notch graphics: 2.5D illustrated style with toon-shaded 3D Mixamo models
- Connect via MidenFi wallet adapter (`~/miden/miden-wallet-adapter`) with session wallet pattern (max 1 popup)
- No custom tokens or faucets — use native MIDEN token only
- 10 MIDEN to play, winner withdraws 20

---

## Tech Stack

```
Rendering:
  react-three-fiber          - React renderer for Three.js (3D champions)
  @react-three/drei          - Helpers: Environment, ContactShadows, useGLTF, useAnimations
  @react-three/postprocessing - Bloom, vignette, chromatic aberration, SSAO
  three                      - Core 3D engine

UI & Animation:
  framer-motion              - Screen transitions, card animations, damage pop-ups
  @react-spring/web          - Spring-physics health bars, mana fills

Styling:
  tailwindcss                - Utility-first CSS for game UI panels
  CSS custom properties      - Dark fantasy arena theme

State:
  zustand                    - Game state management

Build:
  vite                       - Build tool + dev server
  typescript                 - Strict mode
  @vitejs/plugin-react       - React Fast Refresh

Miden:
  @miden-sdk/react           - React SDK hooks (from npm)
  @miden-sdk/miden-sdk       - WASM client (from npm)

Wallet:
  window.midenWallet         - MidenFi browser extension (direct API)
  Session wallet pattern     - Local game wallet, 0 popups during play

3D Assets:
  Mixamo                     - Free character models + auto-rigging + animations
  GLB format                 - Compact, web-optimized
  Custom toon materials      - MeshToonMaterial + outline pass for illustrated look
  Elemental particles        - Fire/water/earth/wind auras via drei sprites
```

---

## Visual Design

### Style: "Illustrated 2.5D"

Toon-shaded 3D Mixamo characters viewed from a fixed 3/4 camera angle, giving a hand-drawn illustration feel. Dark fantasy arena background with parallax layers.

### Champion Rendering
- **MeshToonMaterial** with custom gradient maps (3-4 color steps for cel-shading)
- **Outline pass** via postprocessing (thick dark outlines like anime/manga)
- **Elemental auras:** particle sprites around each champion matching their element
  - Fire: floating embers + orange glow
  - Water: rippling rings + blue shimmer
  - Earth: orbiting rock fragments + dust
  - Wind: swirling leaves + speed lines
- **Animations from Mixamo:** idle (breathing), attack1, attack2, hit_reaction, death, victory
- **Fixed side-view camera** with slight drift (adds life without requiring orbit controls)

### Battle UI (DOM overlay on top of 3D scene)
- Frosted glass panels (backdrop-filter: blur) for health/ability cards
- Animated health bars with spring physics (react-spring)
- Floating damage numbers that pop up and fade (framer-motion)
- Ability cards with illustrated icons that flip/glow on selection
- Screen shake on heavy hits (camera spring in R3F)
- Flash/vignette on KO

### Screen Transitions
- Framer-motion page transitions (slide, fade, scale)
- Draft picks: card flip animation revealing the chosen champion
- Combat start: dramatic zoom into the arena
- Turn resolution: slow-motion hit effect with bloom spike

### Responsive / Mobile Design

**Layout strategy:** Mobile-first, single-column. All UI fits within 375px width (iPhone SE).

**3D scene adaptation:**
- Portrait orientation: arena scene occupies top ~40% of screen, UI controls below
- R3F Canvas resizes via `useThree` viewport hooks, champions scale proportionally
- On low-end devices: disable postprocessing (bloom, SSAO), reduce particle count via `drei`'s `AdaptiveDpr` + `PerformanceMonitor`
- Touch-friendly: ability cards are large tap targets (min 48px), swipe to switch champions

**Mobile-specific UI:**
- Bottom sheet pattern for ability selection (slide up from bottom, easy thumb reach)
- Swipeable champion selector (horizontal scroll with snap)
- Health bars stacked vertically (opponent on top, you on bottom)
- Battle log collapsed by default, expandable via pull-up handle
- Draft pool: 2×5 grid with large touch targets
- All text scales via `clamp()` CSS functions

**Breakpoints (Tailwind):**
- `<640px` (sm): single-column, bottom-sheet abilities, stacked champion panels
- `640-1024px` (md): side-by-side champion panels, larger arena viewport
- `>1024px` (lg): full desktop layout with battle log sidebar

**Performance on mobile:**
- `AdaptiveDpr` from drei: auto-lowers pixel ratio on slow devices
- `PerformanceMonitor` from drei: disables postprocessing effects when FPS drops
- GLB models compressed with Draco (smaller download, faster parse)
- Lazy-load non-active champion models (only load the 6 drafted champions for combat)

---

## Game Mechanics

### 10 Champions (4 elements, 2 abilities each)

| ID | Name | HP | ATK | DEF | SPD | Element | Ability 1 | Ability 2 |
|----|------|----|-----|-----|-----|---------|-----------|-----------|
| 0 | Ember | 90 | 16 | 8 | 14 | Fire | Fireball (25 dmg) | Flame Shield (+5 DEF, 2 turns) |
| 1 | Torrent | 110 | 12 | 12 | 10 | Water | Tidal Wave (22 dmg) | Heal (+25 HP) |
| 2 | Boulder | 140 | 14 | 16 | 5 | Earth | Rock Slam (28 dmg) | Fortify (+6 DEF, 2 turns) |
| 3 | Gale | 75 | 15 | 6 | 18 | Wind | Wind Blade (24 dmg) | Haste (+5 SPD, 2 turns) |
| 4 | Inferno | 80 | 20 | 5 | 16 | Fire | Eruption (35 dmg) | Scorch (15 dmg + burn 3 turns) |
| 5 | Tide | 100 | 11 | 14 | 9 | Water | Whirlpool (20 dmg) | Mist (-4 opp ATK, 2 turns) |
| 6 | Quake | 130 | 13 | 15 | 7 | Earth | Earthquake (26 dmg) | Stone Wall (+8 DEF, 1 turn) |
| 7 | Storm | 85 | 17 | 7 | 15 | Wind | Lightning (30 dmg) | Dodge (+6 SPD, 2 turns) |
| 8 | Phoenix | 65 | 22 | 4 | 17 | Fire | Blaze (38 dmg) | Rebirth (+30 HP, self only) |
| 9 | Kraken | 120 | 10 | 16 | 6 | Water | Depth Charge (24 dmg) | Shell (+7 DEF, 2 turns) |

### Element Matchups

Fire → Earth → Wind → Water → Fire (cycle)
- Advantage: 1.5x damage
- Disadvantage: 0.67x damage
- Neutral: 1.0x

### Damage Formula

```
baseDamage = ability.power × (1 + attacker.attack / 20)
typeMultiplier = elementMatchup(attacker.element, defender.element)
effectiveDefense = defender.defense + defenseBuffs
finalDamage = max(1, floor(baseDamage × typeMultiplier - effectiveDefense))
```

### Speed Priority

Faster champion attacks first. If the faster champion KOs the slower one, the slower one doesn't act that turn. Ties broken by lower champion ID.

### Status Effects
- **Burn:** 10% max HP damage at end of turn, lasts N turns
- **DEF buff:** adds to defense, expires after N turns
- **SPD buff:** adds to speed, expires after N turns
- **ATK debuff:** reduces opponent's attack, expires after N turns

### Draft Phase

Snake draft from a pool of 10: **A → B → B → A → A → B**

Each pick is a `useSend()` with amount = championId + 1 (1-10 units, i.e. 0.000001-0.00001 MIDEN). Picks are sequential and visible (no commit-reveal needed for draft).

### Combat Phase

Both players each turn select: **which champion** (of their 3 surviving) and **which ability** (1 or 2).

Move encoding: `championId × 2 + abilityIndex` → value 0-19, sent as amount + 1 = 1-20.

Game ends when all 3 of one player's champions are KO'd.

---

## Provably Fair Commit-Reveal Protocol

### Why This Is Needed

Without commit-reveal, the first player to submit their move would have it visible on-chain before the opponent submits. A hacked client could sync, see the opponent's move, and counter it.

### Scheme: 96-bit SHA-256 Commitment + 64-bit Nonce

**COMMIT (1 transaction via useMultiSend):**
```typescript
// Player selects move (1-20) and generates random nonce
const move = championId * 2 + abilityIndex + 1;  // 1-20
const nonce = crypto.getRandomValues(new Uint8Array(8));  // 64-bit nonce
const data = new Uint8Array([move, ...nonce]);  // 9 bytes
const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

// Split first 96 bits of hash into 2 × 48-bit values
const commitPart1 = bytesToBigInt(hash.slice(0, 6)) + 1n;  // 1 to 2^48
const commitPart2 = bytesToBigInt(hash.slice(6, 12)) + 1n; // 1 to 2^48

// Send both parts as public notes in one transaction
await sendMany({
  from: walletId, assetId: faucetId,
  recipients: [
    { to: opponentId, amount: commitPart1 },
    { to: opponentId, amount: commitPart2 },
  ],
  noteType: "public",
});

// Store locally: { move, nonce, commitPart1, commitPart2 }
```

**REVEAL (1 transaction via useMultiSend, after both commits received):**
```typescript
const noncePart1 = bytesToBigInt(nonce.slice(0, 4)) + 1n;  // 1 to 2^32
const noncePart2 = bytesToBigInt(nonce.slice(4, 8)) + 1n;  // 1 to 2^32

await sendMany({
  from: walletId, assetId: faucetId,
  recipients: [
    { to: opponentId, amount: BigInt(move) },     // 1-20
    { to: opponentId, amount: noncePart1 },        // nonce first half
    { to: opponentId, amount: noncePart2 },        // nonce second half
  ],
  noteType: "public",
});
```

**VERIFY (client-side, both players independently):**
```typescript
// Reconstruct nonce from reveal notes
const nonce = concatBytes(bigIntToBytes(noncePart1 - 1n, 4), bigIntToBytes(noncePart2 - 1n, 4));
const data = new Uint8Array([move, ...nonce]);
const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

// Check against committed values
const expectedPart1 = bytesToBigInt(hash.slice(0, 6)) + 1n;
const expectedPart2 = bytesToBigInt(hash.slice(6, 12)) + 1n;
assert(expectedPart1 === committedPart1);  // from commit note 1
assert(expectedPart2 === committedPart2);  // from commit note 2
```

### Security Properties

| Attack | Difficulty | Why |
|--------|-----------|-----|
| **Peek at opponent's move from commitment** | Impossible (2^64 nonce space) | Attacker must try 6 moves × 2^64 nonces ≈ 10^20 hashes |
| **Change move after committing** | Infeasible (96-bit hash) | Second preimage requires ~2^96 ≈ 10^28 hash attempts |
| **Submit after seeing opponent's commit** | Harmless | Commitment reveals nothing about the move |
| **Skip reveal** | Detectable | Opponent times out, game aborted, stakes reclaimable |

### Token Flow (MIDEN token, 6 decimals)

- **Faucet ID (testnet):** `mtst1aqmat9m63ctdsgz6xcyzpuprpulwk9vg_qruqqypuyph`
- **Decimals:** 6 (1 MIDEN = 1,000,000 units)
- **Stake:** 10 MIDEN per player (10,000,000 units)
- **Session wallet funded with:** ~15 MIDEN (10 stake + 5 communication buffer)
- **Max single note amount:** 2^48 units ≈ 281 MIDEN ← easily fits
- **Communication cost per round:** 5 notes × ~0.07 MIDEN max = ~0.35 MIDEN
- **Tokens flow back and forth:** after consuming opponent's notes, balance recovers
- **Winner collects:** opponent's 10 MIDEN stake, then auto-withdraws all back to MidenFi wallet

---

## Session Wallet Architecture (MidenFi Integration)

### Problem
MidenFi wallet adapter has NO auto-confirm mode. Every `requestSend` / `requestTransaction` triggers a browser extension popup. A card battle game needs dozens of transactions per game — popup fatigue would ruin the experience.

### Solution: Session Wallet Pattern (1 popup total)

```
┌─────────────────────────────────────────────────────────┐
│  MidenFi Extension (identity + funds)                   │
│  - Holds user's real MIDEN balance                      │
│  - Only used ONCE: to fund the session wallet           │
└────────────────┬────────────────────────────────────────┘
                 │ window.midenWallet.requestSend()  ← 1 POPUP
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Session Wallet (local, in-browser)                     │
│  - Created via useCreateWallet() — no signer needed     │
│  - Private keys in local WASM store                     │
│  - All game transactions sign locally → 0 POPUPS        │
│  - Auto-withdraws back to MidenFi on game end           │
└─────────────────────────────────────────────────────────┘
```

### Flow

```
1. CONNECT: Detect window.midenWallet → connect() → get user address + publicKey
   └→ Extension popup: "Allow Miden Arena to connect?" (standard connect popup)

2. CREATE SESSION: useCreateWallet({ storageMode: "private" })
   └→ Local WASM operation, no popup

3. FUND SESSION: window.midenWallet.requestSend({
     senderAddress: midenFiAddress,
     recipientAddress: sessionWalletAddress,
     faucetId: MIDEN_FAUCET_ID,
     amount: 15_000_000n,   // 15 MIDEN
     noteType: "public",
   })
   └→ Extension popup: "Send 15 MIDEN to session wallet?" ← THE ONLY POPUP

4. SYNC + CONSUME: Wait for note → consume into session wallet
   └→ Session wallet now has 15 MIDEN, fully self-signing

5. GAMEPLAY: All sends/commits/reveals use session wallet
   └→ Local key → zero popups

6. GAME OVER: Auto-withdraw remaining balance back to MidenFi
   └→ useSend({ from: sessionWallet, to: midenFiAddress, ... })
   └→ Local key → zero popups
```

### Component Tree

```tsx
// No MidenFiSignerProvider needed — we use window.midenWallet directly
<MidenProvider
  config={{
    rpcUrl: "testnet",
    prover: "testnet",
    autoSyncInterval: 1000,
  }}
>
  <App />
</MidenProvider>
```

### Persistence

- Session wallet ID → localStorage
- MidenFi address → localStorage
- On page refresh: if session wallet exists in store, resume; if not, re-create + re-fund

---

## Architecture

### Project Structure

```
~/miden/miden-arena/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── public/
│   ├── models/                          # Mixamo GLB files
│   ├── textures/
│   │   ├── toon-gradient.png            # Cel-shading gradient map
│   │   └── arena-bg-layers/             # Parallax background layers
│   ├── particles/
│   │   ├── ember.png                    # Fire particle sprite
│   │   ├── droplet.png                  # Water particle sprite
│   │   ├── rock.png                     # Earth particle sprite
│   │   └── leaf.png                     # Wind particle sprite
│   └── sfx/                             # Sound effects (optional)
├── src/
│   ├── main.tsx                          # ReactDOM root
│   ├── App.tsx                           # Screen router + MidenProvider
│   │
│   ├── types/
│   │   ├── game.ts                       # Champion, Ability, GameAction, TurnOutcome
│   │   ├── protocol.ts                   # CommitData, RevealData, NoteSignal
│   │   └── index.ts
│   │
│   ├── constants/
│   │   ├── champions.ts                  # Full roster with stats
│   │   ├── elements.ts                   # Type matchup table
│   │   ├── miden.ts                      # MIDEN_FAUCET_ID, DECIMALS, STAKE_AMOUNT
│   │   └── protocol.ts                   # Signal amounts, encoding constants
│   │
│   ├── engine/
│   │   ├── damage.ts                     # Damage formula, type multipliers
│   │   ├── combat.ts                     # Turn resolution: speed priority, effects
│   │   ├── draft.ts                      # Draft order, pool management
│   │   ├── commitment.ts                 # SHA-256 commit/reveal/verify functions
│   │   └── codec.ts                      # Move ↔ amount encoding/decoding
│   │
│   ├── store/
│   │   ├── gameStore.ts                  # Zustand: setup, match, draft, battle state
│   │   └── selectors.ts                  # Derived state: survivingChampions, canUseAbility
│   │
│   ├── hooks/
│   │   ├── useSessionWallet.ts           # MidenFi connect + session wallet + funding
│   │   ├── useMatchmaking.ts             # Join/accept via note exchange
│   │   ├── useDraft.ts                   # Draft pick sending + opponent pick detection
│   │   ├── useCommitReveal.ts            # Core: commit hash, reveal, verify
│   │   ├── useCombatTurn.ts              # Full turn lifecycle using useCommitReveal
│   │   ├── useNoteDecoder.ts             # Filter + decode incoming game notes
│   │   └── useStaking.ts                 # P2IDE stake/settlement + auto-withdraw
│   │
│   ├── scenes/                           # React Three Fiber 3D scenes
│   │   ├── ArenaScene.tsx                # Main 3D viewport: arena + champions
│   │   ├── ChampionModel.tsx             # Single champion: GLB loader + toon material
│   │   ├── ElementalAura.tsx             # Particle system per element type
│   │   ├── AttackEffect.tsx              # Projectile/impact VFX per ability
│   │   ├── ArenaEnvironment.tsx          # Background, lighting, fog, ground plane
│   │   ├── DraftStage.tsx                # 3D scene for draft (champion showcase)
│   │   └── PostProcessing.tsx            # Bloom, vignette, outline pass config
│   │
│   ├── screens/                          # Full-page screens (DOM + optional 3D)
│   │   ├── LoadingScreen.tsx             # WASM init + asset preloading
│   │   ├── TitleScreen.tsx               # Game title, "Play" button, settings
│   │   ├── SetupScreen.tsx               # MidenFi connect + session wallet funding
│   │   ├── LobbyScreen.tsx               # Host/join match
│   │   ├── DraftScreen.tsx               # Champion draft with 3D showcase
│   │   ├── BattleScreen.tsx              # Main combat (3D arena + UI overlay)
│   │   ├── GameOverScreen.tsx            # Victory/defeat + settlement
│   │   └── ErrorScreen.tsx               # Error display + recovery
│   │
│   ├── components/                       # Reusable UI components (DOM)
│   │   ├── ui/
│   │   ├── battle/
│   │   ├── draft/
│   │   └── layout/
│   │
│   └── utils/
│       ├── bytes.ts                      # BigInt ↔ Uint8Array conversions
│       ├── formatting.ts                 # Account ID truncation
│       ├── sounds.ts                     # Web Audio API manager (optional)
│       └── persistence.ts               # localStorage for wallet/faucet IDs
```

### Key Dependencies (package.json)

```json
{
  "dependencies": {
    "@miden-sdk/miden-sdk": "^0.13.0",
    "@miden-sdk/react": "^0.13.0",
    "@react-spring/web": "^9.7.0",
    "@react-three/drei": "^10.0.0",
    "@react-three/fiber": "^9.0.0",
    "@react-three/postprocessing": "^3.0.0",
    "framer-motion": "^11.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "three": "^0.170.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/three": "^0.170.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

---

## Game Flow (Complete)

### Phase 1: Setup (~20 seconds)

```
1. Detect window.midenWallet → connect() → get MidenFi address
2. createWallet({ storageMode: "private" }) → session wallet
3. window.midenWallet.requestSend(15 MIDEN → session wallet) ← 1 POPUP
4. sync() → consume funded note into session wallet
→ Session wallet has 15 MIDEN, all future ops popup-free
```

### Phase 2: Matchmaking (~15 seconds)

```
Host:                                  Joiner:
─────                                  ──────
1. Displays session wallet ID          1. Enters host's session wallet ID
2. Clicks "Host"                       2. Clicks "Join"
                                       3. useSend(to: host, amount: 100, public)  ← JOIN signal (0.0001 MIDEN)
3. Detects JOIN note, consumes
4. useSend(to: joiner, amount: 101, public) ← ACCEPT signal
Both enter Draft
```

### Phase 3: Draft (~2 minutes)

```
Pool: all 10 champions
Order: A → B → B → A → A → B

Each pick:
  1. Player selects champion in UI (3D model showcase rotates)
  2. useSend(to: opponent, amount: championId + 1, noteType: "public")
  3. Opponent syncs, detects pick, removes from pool
  4. Next player's turn

6 transactions total. ~20 seconds per pick.
```

### Phase 4: Combat (~2-3 minutes)

```
Each round (2 transactions per player):

1. CHOOSE: Both select champion + ability in UI
   └→ Move = championId × 2 + abilityIndex + 1 (1-20)

2. COMMIT: useMultiSend → 2 notes (96-bit hash in 2 × 48-bit amounts)
   └→ ~3 seconds (execute + remote prove + submit)

3. WAIT: Auto-sync detects opponent's 2 commit notes
   └→ ~1-5 seconds

4. REVEAL: useMultiSend → 3 notes (move + nonce parts)
   └→ ~3 seconds

5. WAIT: Auto-sync detects opponent's 3 reveal notes
   └→ ~1-5 seconds

6. VERIFY: SHA-256(move || nonce) matches commitment
   └→ Instant (client-side)

7. RESOLVE: Damage calculation, effects, KO check
   └→ Instant + battle animation (~3 seconds)

Per round: ~15-25 seconds
Full combat (5-7 rounds): ~1.5-3 minutes
```

### Phase 5: Staking (between matchmaking and draft)

```
Both players send 10 MIDEN to each other as P2IDE stake notes:
  useSend({ from: sessionWallet, to: opponent, amount: 10_000_000n, noteType: "public", recallHeight: currentBlock + 200 })
Both consume the other's stake → held in escrow until game ends
```

### Phase 6: Game Over (~10 seconds)

```
1. Victory/defeat animation + stats recap
2. Winner keeps opponent's 10 MIDEN stake (already consumed)
3. Loser's 10 MIDEN was consumed by winner — net: winner +10, loser -10
4. Auto-withdraw: remaining session wallet balance → MidenFi wallet
   useSend({ from: sessionWallet, to: midenFiAddress, ... }) ← no popup
5. "Play Again" or "Return to Lobby"
```

---

## Zustand Store Shape

```typescript
interface GameStore {
  screen: "loading" | "title" | "setup" | "lobby" | "draft" | "battle" | "gameOver";

  setup: {
    midenFiAddress: string | null;
    sessionWalletId: string | null;
    step: "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done";
  };

  match: {
    opponentId: string | null;
    role: "host" | "joiner" | null;
  };

  draft: {
    pool: number[];
    myTeam: number[];
    opponentTeam: number[];
    currentPicker: "me" | "opponent";
    pickNumber: number;
  };

  battle: {
    round: number;
    phase: "choosing" | "committing" | "waitingCommit" | "revealing" | "waitingReveal" | "resolving" | "animating";
    myChampions: ChampionState[];
    opponentChampions: ChampionState[];
    selectedChampion: number | null;
    selectedAbility: number | null;
    myCommit: CommitData | null;
    opponentCommitNotes: NoteRef[];
    myReveal: RevealData | null;
    opponentReveal: RevealData | null;
    turnLog: TurnRecord[];
  };

  result: {
    winner: "me" | "opponent" | "draw" | null;
    totalRounds: number;
    mvp: number | null;
  };
}
```

---

## Miden SDK Hooks Used

| Feature | Hooks / API | Notes |
|---------|-------------|-------|
| Connect MidenFi | `window.midenWallet.connect()` | Get user address (1 popup) |
| Fund session wallet | `window.midenWallet.requestSend()` | 15 MIDEN → session wallet (1 popup) |
| Create session wallet | `useCreateWallet` | `storageMode: "private"`, local keys |
| Consume funded note | `useConsume` | Session wallet now has MIDEN |
| Matchmaking | `useSend`, `useNotes`, `useSyncState` | Amount signals: 100=join, 101=accept |
| Staking | `useSend` | 10 MIDEN P2IDE with recallHeight |
| Draft picks | `useSend` | Amount = championId + 1 (1-10 units) |
| Combat commit | `useMultiSend` | 2 notes with 48-bit hash chunks |
| Combat reveal | `useMultiSend` | 3 notes: move + nonce parts |
| Note detection | `useNotes`, `useSyncState` | Filter by sender + amount range |
| Note claiming | `useConsume` | Reclaim tokens from game notes |
| Auto-withdraw | `useSend` | Session wallet → MidenFi address (0 popups) |
| TX progress display | `useSend` / `useMultiSend` stage | `executing → proving → submitting → complete` |
| Sync status | `useSyncState` | Display sync height, trigger manual sync |

---

## Miden Provider Config

```tsx
<MidenProvider
  config={{
    rpcUrl: "testnet",
    prover: "testnet",
    autoSyncInterval: 1000,
  }}
  loadingComponent={<LoadingScreen />}
  errorComponent={(err) => <ErrorScreen error={err} />}
>
  <App />
</MidenProvider>
```

---

## Miden Features Showcased

| Feature | Where | Visual |
|---------|-------|--------|
| Private accounts | Session wallets | "Your balance is hidden from opponents" badge |
| Native MIDEN token | All phases | Real token with economic stakes |
| Session wallet pattern | Setup | "Fund game wallet" → 1 popup, then 0 popups |
| Public notes as messages | All game phases | Note activity feed in debug panel |
| Note consumption | After each round | Tokens reclaimed for next round |
| P2IDE (time-locked notes) | Staking | "Stake locked until block #X" display |
| Transaction lifecycle | Every action | Animated progress: execute → prove → submit |
| Delegated proving | Every action | Remote prover for fast proof generation |
| State synchronization | Continuous (1s) | Sync heartbeat indicator, block height counter |
| WASM in browser | Entire game | All crypto + chain ops run in-browser |
| Commit-reveal fairness | Combat phase | "Commitment verified" after each reveal |

---

## Implementation Phases

### Phase 1: Foundation + Tooling
- Project scaffold: Vite + React + TS + Tailwind + R3F
- Type definitions (game.ts, protocol.ts)
- Constants (champions.ts, elements.ts, protocol.ts)
- Engine: damage.ts, combat.ts, commitment.ts, codec.ts
- Zustand store + selectors
- Unit tests for engine (all matchup combinations, commit-reveal roundtrip)

### Phase 2: 3D Scene Setup
- Download + process 10 Mixamo characters → GLB
- ChampionModel.tsx (GLB loader + toon material + outline)
- ElementalAura.tsx (particle sprites per element)
- ArenaEnvironment.tsx (ground, lighting, fog, parallax background)
- PostProcessing.tsx (bloom, vignette, outline pass)
- DraftStage.tsx (champion showcase with rotation)

### Phase 3: Setup + Matchmaking Screens
- LoadingScreen (WASM + 3D asset preloading with progress bar)
- TitleScreen (animated title, play button)
- SetupScreen (MidenFi connect + session wallet creation + funding)
- LobbyScreen (host/join with useMatchmaking hook)
- Shared components: GlassPanel, AccountBadge, TransactionProgress

### Phase 4: Draft
- DraftScreen with 3D champion showcase
- DraftPool (grid of available champions with stats)
- DraftTimeline (visual turn order)
- TeamPreview (your drafted team)
- useDraft hook (send picks, detect opponent picks)

### Phase 5: Combat (core gameplay)
- BattleScreen with ArenaScene (3D) + BattleHUD (DOM overlay)
- useCommitReveal hook (SHA-256 commit, reveal, verify)
- useCombatTurn hook (full lifecycle: choose → commit → reveal → resolve)
- ChampionSelector, AbilityCard, HealthBar, DamageNumber
- BattleLog, CommitRevealStatus, TurnPhaseIndicator
- AttackEffect.tsx (projectile VFX per ability)
- Screen shake, bloom spike on hit

### Phase 6: End Game + Polish
- GameOverScreen (victory/defeat animation, stats, settlement)
- useStaking hook (P2IDE stake/claim)
- Sound effects (Web Audio API)
- Responsive layout tweaks
- Error boundaries + recovery flows
- localStorage persistence (wallet/faucet IDs survive refresh)

---

## 3D Asset Pipeline (Mixamo)

1. Go to mixamo.com → Characters → pick 10 distinct fantasy/warrior characters
2. For each character, download animations:
   - Idle (breathing) - looping
   - Attack 1 (sword swing / punch) - one-shot
   - Attack 2 (magic cast / kick) - one-shot
   - Hit Reaction - one-shot
   - Death - one-shot
   - Victory - looping
3. Export each as GLB with "In Place" (no root motion)
4. Place in `public/models/`
5. In R3F: `useGLTF` + `useAnimations` from drei to load + play

### Toon Material Setup (ChampionModel.tsx)

```tsx
const gradientMap = useTexture('/textures/toon-gradient.png');
gradientMap.minFilter = NearestFilter;
gradientMap.magFilter = NearestFilter;

<mesh>
  <meshToonMaterial
    map={diffuseTexture}
    gradientMap={gradientMap}
    color={elementColor}
  />
</mesh>

// Outline via postprocessing outline pass (in PostProcessing.tsx)
<EffectComposer>
  <Outline selection={selectedChampions} edgeStrength={3} />
  <Bloom intensity={0.3} />
  <Vignette />
</EffectComposer>
```

---

## Verification

1. **Unit tests (vitest):**
   - All 100 champion matchups (10×10) for damage calculation
   - All 20 ability effects
   - Commit-reveal roundtrip for all moves (1-20)
   - Second preimage resistance (verify no collisions in 10^6 random samples)
   - Zustand store state transitions

2. **Manual E2E test:**
   - Open two browser tabs pointing to testnet
   - Each connects MidenFi, creates session wallet, funds with 15 MIDEN
   - Complete matchmaking handshake
   - Both stake 10 MIDEN
   - Draft 3 champions each
   - Play 3+ combat rounds with commit-reveal
   - Verify fairness: check commitment hashes match reveals
   - Complete game, verify winner gets opponent's stake
   - Verify auto-withdraw back to MidenFi wallet

3. **Build verification:**
   - `tsc --noEmit` passes
   - `vite build` produces working production bundle
   - Deployed with COOP/COEP headers for SharedArrayBuffer
