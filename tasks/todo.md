# Miden Compiler & Arena Account Component

## Phase 1 — Completed

- [x] Install Miden compiler toolchain (cargo-miden v0.7.1)
- [x] Verify compatibility (compiler uses miden-core 0.20, matches local miden-base)
- [x] Scaffold counter-test account component via `cargo miden new --account`
- [x] Build & validate: Rust → WASM → MASM pipeline produces .masp
- [x] Prototype arena storage: Value + StorageMap both compile cleanly
- [x] Document findings
- [x] Test combat-engine import in Miden program — compiles and builds .masp (145KB)
- [x] Execute combat in Miden VM — `miden vm run` works
- [x] Verify determinism: Miden VM output matches native Rust output exactly
- [x] Identify compiler bug: large struct returns broken, workaround = inline logic

## Phase 2 — Arena Account Component — Completed

- [x] Add `pack.rs` module to combat-engine (ChampionState ↔ [u64; 4] packing)
- [x] Create `contracts/arena-account/` crate with 21-slot storage layout
- [x] Implement `join` procedure (first/second player joins, stake validation)
- [x] Implement `set_team` procedure (team validation, overlap check, champion init)
- [x] Implement `submit_commit` procedure (hash commitment storage)
- [x] Implement `submit_reveal` procedure (move validation, triggers resolution)
- [x] Implement `resolve_current_turn` with fully inlined combat resolution
- [x] Implement `claim_timeout` procedure (forfeit/refund logic)
- [x] Build produces .masp (381KB)
- [x] All 40 combat-engine tests pass (33 existing + 7 new packing tests)

## Phase 3 — Hash, Timeouts, Payouts & Note Scripts — Completed

- [x] RPO hash verification in `submit_reveal` (using `hash_elements`, ~1 cycle)
- [x] Block height access for timeout logic (`tx::get_block_number()`)
- [x] Refactor player ID storage from single Felt to 2-Felt AccountId (prefix, suffix)
- [x] P2ID note creation in `resolve_current_turn` and `claim_timeout` payouts
- [x] Add `faucet_id` and `p2id_script_hash` storage slots (23 total)
- [x] `send_payout` helper with `Recipient::compute`, `build_fungible_asset`, unique serial numbers
- [x] `submit_commit` accepts full 4-Felt RPO commitment Word
- [x] Note script crates: `submit-move-note`, `process-team-note`, `process-stake-note`
- [x] All 3 note scripts build to .masp (27-100KB each)
- [x] Arena account builds to .masp (475KB)
- [x] All 40 combat-engine tests pass
- [x] Code review fixes: unique payout serial numbers, decode_move defense-in-depth, saturating_add for damage

## Phase 3b — Cross-Context Note Scripts — Completed

- [x] Add `receive_asset` procedure to arena account (accepts Asset, calls `self.add_asset()`)
- [x] Copy generated WIT to `contracts/arena-account/wit/` for note script imports
- [x] Rewrite `process-stake-note` with `generate!()`/`export!()` cross-context pattern
  - Calls `receive_asset()` to deposit stake, then `join()` to register player
- [x] Rewrite `process-team-note` with cross-context pattern
  - Calls `set_team()` with sender ID and champion IDs from arg Word
- [x] Rewrite `submit-move-note` with cross-context pattern
  - Phase 0: calls `submit_commit()` with 4-Felt RPO commitment
  - Phase 1: calls `submit_reveal()` with encoded move + nonce
- [x] All 3 note scripts build to .masp (24-106KB each)
- [x] Arena account builds to .masp (510KB) with `receive_asset`
- [x] All 40 combat-engine tests pass
- [x] Caller authentication: note scripts pass `active_note::get_sender()` to account procedures

## Phase 4 — Deployment Automation — Completed

- [x] Create `scripts/deploy.sh` (build contracts, deploy arena account, write config)
- [x] Create `src/constants/contracts.ts` (centralized contract IDs + note script paths)
- [x] Re-export contract constants from `src/constants/miden.ts`
- [x] Add `public/contracts/` to `.gitignore` (binary .masp artifacts)
- [x] Prerequisite: `miden-client` CLI installed from local source

## Phase 3 — Remaining Items

- [ ] Single-use contract: no reset mechanism after game_state=4 (one game per account)
- [ ] Consider penalizing staller in state 2 timeout (award to team-submitter)
- [ ] Consider resetting timeout on each commit/reveal for fairer timing

---

# Phase 5 — Frontend Arena Contract Integration

## Context

The frontend currently uses **P2P notes** (P2ID/P2IDE between session wallets) for all game interactions — matchmaking signals, draft picks, stakes, and combat commit/reveal. The on-chain arena contracts expect **notes sent to the arena account** that trigger account procedures (`join`, `set_team`, `submit_commit`, `submit_reveal`).

This plan adapts the hooks to create and consume custom note scripts targeting the arena account, replacing the P2P note patterns for staking, team submission, and combat.

**Hybrid approach:** Matchmaking and draft pick exchange remain P2P (no corresponding contract). Staking, team submission, and combat go through the arena.

---

## Architecture Overview

### Transaction Flow (per arena interaction)

Each arena interaction requires **two sequential transactions**:

1. **Create note** (session wallet tx) — builds a note with a custom script (loaded from `.masp`) targeting the arena account, submitted from the session wallet
2. **Consume note** (arena account tx) — the player's client submits a tx against the imported arena account that consumes the note, triggering the note script which calls arena procedures

**Auth model:** The arena is a public account deployed with `--storage-mode public`. Public accounts use `NoAuth` — no secret key is required. After `client.importAccountById(arenaId)`, the client can call `client.submitNewTransactionWithProver(arenaId, txRequest, prover)` directly. Confirmed by existing `useSessionWallet.ts` pattern (lines 278-281). **Note:** Always use `submitNewTransactionWithProver` (not `submitNewTransaction`) — the codebase consistently requires an explicit prover.

**Public account import:** `importAccountById` pulls the full account data (code, storage, vault) for public accounts. The note scripts require the arena's component code to be available locally so the VM can execute cross-context calls during the consume transaction.

**Note consumption API:** `TransactionRequestBuilder.withInputNotes()` takes `NoteAndArgsArray`, which wraps `NoteAndArgs(note: Note, args?: Word | null)`. This requires the **full `Note` object** (not just a `NoteId`). After creating the output note and syncing, retrieve it via `client.getConsumableNotes(arenaAccountId)` → `record.inputNoteRecord().toNote()` to get the full `Note`, then wrap with args.

### Key SDK APIs (all confirmed exported via `@miden-sdk/miden-sdk`)

| API | Purpose |
|-----|---------|
| `Package.deserialize(bytes)` + `NoteScript.fromPackage(pkg)` | Load note scripts from `.masp` files |
| `Rpo256.hashElements(FeltArray)` → `Word` | RPO256 hashing in browser (replaces SHA-256) |
| `client.importAccountById(arenaId)` | Import public arena account (no auth key needed) |
| `client.getAccountStorage(arenaId)` → `AccountStorage` | Read arena storage slots |
| `AccountStorage.getItem(slot)` | Read individual slot values — verify access pattern (string name vs numeric index) during Step 0 |
| `AccountStorage.getSlotNames()` → `string[]` | Discover actual slot names |
| `NoteRecipient(serialNum, noteScript, storage)` | Build note with custom script |
| `NoteTag.withAccountTarget(arenaId)` | Tag note for arena account consumption |
| `NoteStorage(FeltArray)` | Note inputs — verify constructor signature during Step 0 |
| `NoteAndArgs(note, args?)` + `NoteAndArgsArray` | Wrap full Note + Word args for consumption |
| `client.getConsumableNotes(arenaAccountId)` | Find notes ready for arena to consume |
| `client.submitNewTransactionWithProver(id, req, prover)` | Submit tx (always use this variant) |

### All notes require at least 1 asset

The Miden protocol requires every note to contain **at least 1 asset**. Team and move notes that don't logically carry value still need a dust asset: `FungibleAsset(faucetId, PROTOCOL_NOTE_AMOUNT)` (1 unit). This matches the existing `useCommitReveal.ts` pattern.

### Arena Storage Slot Layout

The `#[component]` macro assigns slots by declaration order. Slot names depend on the macro's naming convention — **Step 0 verifies the actual names**.

| Slot | Field | Type | Values |
|------|-------|------|--------|
| 0 | `game_state` | Felt | 0=waiting, 1=p1_joined, 2=both_joined, 3=combat, 4=resolved |
| 1 | `player_a` | Word | [prefix, suffix, 0, 0] |
| 2 | `player_b` | Word | [prefix, suffix, 0, 0] |
| 3 | `team_a` | Word | [c0, c1, c2, 0] |
| 4 | `team_b` | Word | [c0, c1, c2, 0] |
| 5 | `round` | Felt | Current round number |
| 6 | `move_a_commit` | Word | RPO hash commitment (4 Felts) |
| 7 | `move_b_commit` | Word | RPO hash commitment (4 Felts) |
| 8 | `move_a_reveal` | Word | [encoded_move, nonce_p1, nonce_p2, 0] |
| 9 | `move_b_reveal` | Word | [encoded_move, nonce_p1, nonce_p2, 0] |
| 10-12 | `champ_a_0..2` | Word | Packed ChampionState |
| 13-15 | `champ_b_0..2` | Word | Packed ChampionState |
| 16 | `timeout_height` | Felt | Block height for timeout |
| 17 | `winner` | Felt | 0=undecided, 1=p_a, 2=p_b, 3=draw |
| 18 | `stake_a` | Felt | Player A stake amount |
| 19 | `stake_b` | Felt | Player B stake amount |
| 20 | `teams_submitted` | Felt | Bitfield: bit0=team_a, bit1=team_b |
| 21 | `faucet_id` | Word | Faucet AccountId — **must be initialized at deploy time** |
| 22 | `p2id_script_hash` | Word | P2ID script digest — **must be initialized at deploy time** |

### Game Flow Change

**Current:** Lobby → Match → Draft → Stake (P2P) → Battle (P2P)

**New:** Lobby → Match → Draft → **Arena Setup** → Battle (arena)

The "Arena Setup" phase (new `"arenaSetup"` screen state) is where both players:
1. Send `process_stake_note` to arena → triggers `join()`
2. Poll arena until `game_state >= 2` (both joined)
3. Send `process_team_note` to arena → triggers `set_team()`
4. Poll arena until `game_state === 3` (combat ready)
5. Transition to battle

**Critical ordering:** `set_team` asserts `game_state == 2` (both joined). Team submission MUST be gated on `gameState >= 2` — never attempt before both players have staked.

---

## Step 0: Prerequisites — Deploy & Verify

Before writing any integration code:

### 0a. Initialize arena storage slots

The deploy script (`scripts/deploy.sh`) creates the arena account but **does not initialize `faucet_id` (slot 21) or `p2id_script_hash` (slot 22)**. Without these, payout notes in `resolve_current_turn` and `claim_timeout` will fail.

**Options:**
1. **Deploy script enhancement:** After `miden-client new-account`, run a setup transaction that writes faucet ID and P2ID script hash to the arena's storage
2. **Constructor pattern:** If the Miden compiler supports initial storage values, set them in the account definition
3. **First-use initialization:** Have the first `join()` call detect empty `faucet_id` and write it from the incoming asset's faucet — requires modifying the Rust contract

**Action:** Choose an approach, implement, and verify both slots are populated after deployment.

### 0b. Verify SDK API signatures

Deploy the arena account and run these checks in a test script or browser console:

```typescript
// 1. Verify AccountStorage access pattern
const storage = await client.getAccountStorage(arenaId);
const slotNames = storage.getSlotNames(); // → string[] — what format?
console.log("Slot names:", slotNames);

// 2. Verify getItem accepts those names
const gs = storage.getItem(slotNames[0]); // or storage.getItem(0)?
console.log("game_state:", gs);

// 3. Verify NoteStorage constructor signature
const ns = new NoteStorage(new FeltArray([new Felt(0n)])); // does this work?

// 4. Verify NoteScript.fromPackage with actual .masp bytes
const resp = await fetch("/contracts/process_stake_note.masp");
const bytes = new Uint8Array(await resp.arrayBuffer());
const pkg = Package.deserialize(bytes);
const script = NoteScript.fromPackage(pkg);
```

Record findings in `tasks/lessons.md`.

---

## Step 1: Create `src/utils/arenaNote.ts` — Note Script Loader & Builders

**Create** a utility module that:

1. **Fetches and caches `.masp` files** from `public/contracts/` (loaded once, reused)
2. **Deserializes to `NoteScript`** via `Package.deserialize()` + `NoteScript.fromPackage()`
3. **Provides typed builder functions** for each note type
4. **Encapsulates the two-tx create→consume flow** in a single helper

### Shared utility: `randomFelt()`

Extract to this module (used by both `arenaNote.ts` and `commitment.ts`):

```typescript
/** Random bigint in [0, 2^62) — safely below Miden's field modulus (~2^64). */
export function randomFelt(): bigint {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >> 2n;
}
```

### API

```typescript
// --- Script loading ---
loadNoteScript(path: string): Promise<NoteScript>  // fetch + cache + deserialize

// --- Note builders (all include a dust asset automatically) ---
buildStakeNote(senderAccountId: string, arenaAccountId: string): Promise<Note>
  // Assets: FungibleAsset(faucetId, STAKE_AMOUNT)
  // No noteInputs needed (script uses get_assets + get_sender)

buildTeamNote(senderAccountId: string, arenaAccountId: string): Promise<Note>
  // Assets: FungibleAsset(faucetId, PROTOCOL_NOTE_AMOUNT)  — dust
  // No noteInputs needed (script uses arg Word at consumption time)

buildCommitNote(senderAccountId: string, arenaAccountId: string): Promise<Note>
  // Assets: FungibleAsset(faucetId, PROTOCOL_NOTE_AMOUNT)  — dust
  // noteInputs: [Felt(0n)]  — phase=0

buildRevealNote(senderAccountId: string, arenaAccountId: string): Promise<Note>
  // Assets: FungibleAsset(faucetId, PROTOCOL_NOTE_AMOUNT)  — dust
  // noteInputs: [Felt(1n)]  — phase=1

buildTimeoutNote(senderAccountId: string, arenaAccountId: string): Promise<Note>
  // Assets: FungibleAsset(faucetId, PROTOCOL_NOTE_AMOUNT)  — dust
  // noteInputs: [Felt(2n)]  — phase=2 (requires submit_move_note to handle phase 2,
  //   OR a separate timeout note script — see note below)

// --- Two-tx orchestrator ---
async submitArenaNote(params: {
  client: WebClient,
  prover: Prover,
  sessionWalletId: string,
  arenaAccountId: string,
  note: Note,
  consumeArgs?: Word | null,
}): Promise<{ noteId: string }>
  // 1. Build tx from session wallet with OutputNote
  // 2. Submit session wallet tx via submitNewTransactionWithProver (creates note on-chain)
  // 3. Extract noteId from submitted note
  // 4. Sync state (public note becomes discoverable)
  // 5. Query consumable notes for arena: client.getConsumableNotes(arenaAccountId)
  // 6. Find the matching note (by note ID from step 2)
  // 7. Wrap with args: new NoteAndArgs(fullNote, consumeArgs)
  // 8. Build consume tx: TransactionRequestBuilder().withInputNotes(...)
  // 9. Submit arena tx: client.submitNewTransactionWithProver(arenaAccountId, consumeTx, prover)
  // 10. Sync state again
  // 11. Return { noteId }
  //
  // RETRY LOGIC: If step 9 fails with a nonce conflict (both players
  // submitting arena txs near-simultaneously), wait 2s, re-sync,
  // re-query consumable notes, rebuild consume tx, and retry (max 3 attempts).
  //
  // RECOVERY: If step 2 succeeds but step 9 fails after retries, log the
  // noteId for manual retry. The note exists on-chain but isn't consumed.

// --- Helpers ---
function randomSerialNum(): Word
  // 4 random u64s for unique note serial numbers

function randomFelt(): bigint
  // Exported — shared with commitment.ts
```

**Timeout note:** The existing `submit_move_note` only handles phase 0 (commit) and 1 (reveal). `claim_timeout` is an arena account procedure but has no corresponding note script. **Options:**
1. Add phase 2 handling to `submit_move_note` that calls `claim_timeout(sender.prefix, sender.suffix)`
2. Create a separate `claim-timeout-note` crate
3. Defer timeout to a future phase (mark as TODO in code)

**Decision:** Option 1 is simplest — extend `submit_move_note` to handle phase 2. This requires a small Rust change (add `2 => claim_timeout(...)` to the match). If deferring, add a `// TODO: claim_timeout` and skip `buildTimeoutNote`.

**Key details:**
- `NoteTag.withAccountTarget(arenaId)` — routes note to arena account
- `NoteStorage(new FeltArray(inputs))` — becomes `get_inputs()` in the script (verify constructor in Step 0)
- `NoteRecipient(serialNum, noteScript, storage)` — unique `serialNum` per note
- `NoteMetadata(sender, NoteType.Public, tag)` — public notes are auto-discovered during sync
- All notes carry at least 1 asset (Miden protocol requirement)
- Returns `{ noteId }` so callers can track state or retry

**Files:** `src/utils/arenaNote.ts` (new), imports from `src/constants/contracts.ts` and `src/constants/miden.ts`

---

## Step 2: Create `src/hooks/useArenaState.ts` — Arena Storage Polling

**Create** a hook backed by a **Zustand store slice** in `src/store/gameStore.ts` to avoid duplicate polling when multiple hooks reference arena state.

### Zustand store changes (`gameStore.ts`)

```typescript
// --- New arena slice ---
interface ArenaState {
  gameState: number;            // 0-4
  round: number;
  winner: number;               // 0-3
  teamsSubmitted: number;       // bitfield
  playerA: { prefix: bigint; suffix: bigint } | null;
  playerB: { prefix: bigint; suffix: bigint } | null;
  moveACommit: bigint[];        // 4 Felts (all-zero = empty)
  moveBCommit: bigint[];
  moveAReveal: bigint[];
  moveBReveal: bigint[];
  playerAChamps: bigint[][];    // 3 × [u64; 4] packed champion Words
  playerBChamps: bigint[][];    // 3 × [u64; 4] packed champion Words
  loading: boolean;
  error: string | null;
}

// --- Add to GameStore interface ---
arena: ArenaState;
refreshArena: () => Promise<void>;

// --- Also update Screen type ---
type Screen = "loading" | "title" | "setup" | "lobby" | "draft"
  | "arenaSetup" | "preBattleLoading" | "battle" | "gameOver";
//    ^^^^^^^^^^^  NEW — between draft and battle

// --- Remove obsolete BattleState fields ---
// Remove: opponentCommitNotes, opponentReveal (arena state replaces these)
// Keep: myCommit, myReveal (still needed for local state tracking before tx submit)
```

### Hook

```typescript
function useArenaState(pollIntervalMs?: number): ArenaState & {
  refresh: () => Promise<void>;
  isPlayerA: (myAccountId: string) => boolean;
  isPlayerB: (myAccountId: string) => boolean;
  myCommitSlotEmpty: (myAccountId: string) => boolean;
  myRevealSlotEmpty: (myAccountId: string) => boolean;
  bothCommitted: () => boolean;
  bothRevealed: () => boolean;
}
```

**Implementation:**
1. On mount: `client.importAccountById(arenaAccountId)` (once, idempotent)
2. Poll loop: `client.getAccountStorage(arenaAccountId)` → read slot values
   - **Access pattern:** Use whichever method Step 0 verified (string names or numeric indices)
   - Map to the `ArenaState` interface using `word.toU64s()` → `bigint[]`
   - Check all-zero for "empty" (no commit/reveal yet)
3. Default interval: 5000ms in setup phases, 3000ms during combat (configurable via param)
4. Cleanup: clear interval on unmount

**Files:** `src/hooks/useArenaState.ts` (new), `src/store/gameStore.ts` (edit — add arena slice, add `"arenaSetup"` screen, remove obsolete battle fields)

---

## Step 3: Rewrite `src/engine/commitment.ts` — RPO Hash Commitment

**Replace SHA-256** with the Miden SDK's `Rpo256.hashElements()` to match the arena contract's verification.

**Breaking change:** `createCommitment` changes from `async` to **sync** (RPO256 is synchronous WASM). All call sites that `await` it will still work (awaiting a non-Promise is a no-op), but the function signature and return type change.

```typescript
import { Rpo256, FeltArray, Felt } from "@miden-sdk/miden-sdk";
import { randomFelt } from "../utils/arenaNote";  // shared utility

function createCommitment(move: number): CommitData {
  if (move < 1 || move > 20) throw new Error(`Move must be 1-20, got ${move}`);

  const noncePart1 = randomFelt();
  const noncePart2 = randomFelt();

  // Must match contract: hash_elements(vec![encoded_move, nonce_p1, nonce_p2])
  const felts = new FeltArray([
    new Felt(BigInt(move)),
    new Felt(noncePart1),
    new Felt(noncePart2),
  ]);
  const digest = Rpo256.hashElements(felts);
  const commitWord = [...digest.toU64s()];  // 4 bigints

  return { move, noncePart1, noncePart2, commitWord };
}

function createReveal(commitData: CommitData): RevealData {
  return {
    move: commitData.move,
    noncePart1: commitData.noncePart1,
    noncePart2: commitData.noncePart2,
  };
}
```

**`verifyReveal()` change:** The arena contract handles authoritative verification on-chain. Remove `verifyReveal` as a blocking check. Keep a lightweight `debugVerifyReveal()` for logging purposes (non-blocking, console.warn on mismatch) — useful for debugging but not on the critical path.

**Update `CommitData` / `RevealData` types** (`src/types/protocol.ts`):
```typescript
export interface CommitData {
  move: number;          // 1-20
  noncePart1: bigint;    // Felt-sized random nonce
  noncePart2: bigint;    // Felt-sized random nonce
  commitWord: bigint[];  // 4 Felts — RPO hash
}

export interface RevealData {
  move: number;          // 1-20
  noncePart1: bigint;
  noncePart2: bigint;
}
```

**Remove:**
- `src/utils/bytes.ts` — only imported by `commitment.ts`; no other consumers
- `src/utils/__tests__/bytes.test.ts` — test file for the deleted module
- `verifyReveal()` function (replaced by on-chain verification + optional `debugVerifyReveal`)
- `src/engine/__tests__/commitment.test.ts` — rewrite tests for the new RPO-based implementation

**Files:** `src/engine/commitment.ts` (rewrite), `src/types/protocol.ts` (update), `src/utils/bytes.ts` (delete), `src/utils/__tests__/bytes.test.ts` (delete)

---

## Step 4: Rewrite `src/hooks/useStaking.ts` — Arena Staking

**Replace** P2IDE-to-opponent with `process_stake_note` to arena.

**`sendStake()` new flow:**
1. Build note: `await buildStakeNote(sessionWalletId, ARENA_ACCOUNT_ID)`
2. Submit via orchestrator: `await submitArenaNote({ ..., note, consumeArgs: null })`
   - Args: `null` — process_stake_note ignores `_arg: Word`, uses `get_assets()` + `get_sender()`
3. Refresh arena state to confirm `gameState` advanced (0→1 or 1→2)

**`opponentStaked` detection:** Poll arena state via `useArenaState` — when `gameState >= 2`, both players have joined.

**`withdraw()` stays largely the same** — sends remaining session wallet funds back to MidenFi address via P2ID.

**Remove:** opponent stake detection via `useNoteDecoder`, `useConsume` for consuming opponent's stake note, `RECALL_BLOCK_OFFSET` usage (arena handles timeouts).

**Files:** `src/hooks/useStaking.ts` (rewrite)

---

## Step 5: Update `src/hooks/useDraft.ts` — Add Team Submission

**Keep** P2P draft pick exchange as-is (amount-encoded picks between session wallets).

**Change transition at draft completion** (`useDraft.ts:232-243`):

Currently transitions directly from draft → `preBattleLoading`. Change to:
1. Transition to `"arenaSetup"` screen instead of `"preBattleLoading"`
2. The arena setup phase (a new component or updated `preBattleLoading`) handles:
   a. Stake submission (Step 4)
   b. **Gate on `gameState >= 2`** before team submission (critical — `set_team` asserts `game_state == 2`)
   c. Team submission:
      - Build note: `await buildTeamNote(sessionWalletId, ARENA_ACCOUNT_ID)`
      - Build args Word: `new Word(BigUint64Array.from([c0, c1, c2, 0n]))` (champion IDs, 0-indexed)
      - Submit: `await submitArenaNote({ ..., note, consumeArgs: teamWord })`
   d. Poll arena until `teamsSubmitted === 3` (both bits set) and `gameState === 3`
   e. Then transition to battle

**Draft overlap note:** Both teams are drafted locally via P2P picks with no overlap (snake draft). The arena contract additionally validates overlap on-chain (`set_team` checks opponent's team if already submitted). If the second team submission arrives before the first is confirmed, the contract may not see the first team and can't check overlap — but this is benign since the local draft already prevents it. If it somehow fails, the tx reverts and can be retried after the first team confirms.

**Files:** `src/hooks/useDraft.ts` (edit — change transition target), new arena setup component/logic

---

## Step 6: Rewrite `src/hooks/useCommitReveal.ts` — Arena Combat Moves

**Replace** P2P attachment notes with `submit_move_note` to arena.

### `commit(move)` new flow:
1. Generate commitment: `createCommitment(move)` → `{ commitWord, noncePart1, noncePart2 }`
2. Build note: `await buildCommitNote(sessionWalletId, ARENA_ACCOUNT_ID)`
3. Build args: `new Word(BigUint64Array.from(commitWord))` (4 RPO hash Felts)
4. Submit: `await submitArenaNote({ ..., note, consumeArgs: commitArgs })`
5. Store `CommitData` locally for reveal step

### `reveal()` new flow:
1. Build note: `await buildRevealNote(sessionWalletId, ARENA_ACCOUNT_ID)`
2. Build args: `new Word(BigUint64Array.from([BigInt(move), noncePart1, noncePart2, 0n]))`
3. Submit: `await submitArenaNote({ ..., note, consumeArgs: revealArgs })`
4. Arena auto-verifies via RPO hash, then auto-resolves if both revealed

### Opponent detection (replaces P2P note watching):
- **Opponent committed:** Poll arena → opponent's `moveXCommit` slot is non-zero
- **Opponent revealed:** Poll arena → opponent's `moveXReveal` slot is non-zero
- **Turn resolved:** Poll arena → `round` incremented, commits/reveals cleared to zero
- **Failed reveal:** If opponent's reveal slot stays empty past timeout, `claim_timeout` becomes available (see Step 1 timeout note)

### Combat result reading:
- After resolution, read `champ_a_0..2` and `champ_b_0..2` from arena storage
- Read both revealed moves from `moveAReveal[0]` and `moveBReveal[0]` (encoded_move Felt)
- Use local combat engine to replay the turn for animation (including `playSfx("ko")` on KO)
- Check `winner` slot — if non-zero, game is over

**Remove:** `sendAttachmentNote()`, `readAttachment()`, all `NoteAttachment`/`NoteAttachmentKind`/`NoteAttachmentScheme` imports and usage, P2P note detection effects.

**Files:** `src/hooks/useCommitReveal.ts` (rewrite)

---

## Step 7: Update `src/hooks/useCombatTurn.ts` — Phase Machine Rewrite

The current `useCombatTurn` drives phase transitions based on `useCommitReveal`'s boolean flags (`isCommitted`, `opponentCommitted`, `isRevealed`, `opponentRevealed`, `opponentMove`). The new model replaces P2P detection with arena state polling.

**Phase machine changes:**

| Phase | Current trigger | New trigger |
|-------|----------------|-------------|
| `choosing` → `committing` | `submitMove()` called | Same (unchanged) |
| `committing` → `waitingCommit` | `isCommitted === true` | Commit tx submitted successfully |
| `waitingCommit` → `revealing` | `opponentCommitted === true` | Arena poll: opponent's commit slot non-zero |
| `revealing` → `waitingReveal` | `isRevealed === true` | Reveal tx submitted successfully |
| `waitingReveal` → `resolving` | `opponentRevealed === true` | Arena poll: `round` incremented (both reveals processed, turn auto-resolved) |
| `resolving` → `animating` | Local combat engine runs | Read both moves from arena reveal slots, replay locally |

**Key change in resolving:** The arena contract auto-resolves the turn when the second reveal arrives. So instead of detecting `opponentRevealed` separately, the frontend watches for `round` to increment (meaning resolution already happened on-chain). It then reads the move data and replays locally for animation.

**Preserved behaviors:**
- `playSfx("ko")` when a champion is newly KO'd
- Animation duration timing (`ANIMATION_DURATION_MS = 4000`)
- MVP calculation at game end
- Game-over screen transition

**On-chain state sync:** After resolution, the frontend reads champion states from arena storage and **reconciles** with local combat engine output. If they differ, log a warning but trust the on-chain state (it's authoritative). This handles edge cases where the local engine might diverge.

**Files:** `src/hooks/useCombatTurn.ts` (edit — significant phase machine changes)

---

## Step 8: Update Supporting Files

### `src/hooks/useNoteDecoder.ts`
- Remove `stakeNotes` category (arena handles stakes)
- Remove `rawOpponentNotes` from return type (commit/reveal no longer need raw `InputNoteRecord`)
- Keep: `joinNotes`, `acceptNotes`, `leaveNotes`, `draftPickNotes` (P2P signals)
- Keep: `allOpponentNotes` (still needed for stale note ID tracking in draft)

### `src/constants/protocol.ts`
- Remove: `MSG_TYPE_COMMIT`, `MSG_TYPE_REVEAL` (no longer used)
- Keep: `JOIN_SIGNAL`, `ACCEPT_SIGNAL`, `LEAVE_SIGNAL`, `DRAFT_PICK_*`, `DRAFT_ORDER`, `TEAM_SIZE`, `POOL_SIZE`, `MOVE_MIN`, `MOVE_MAX`

### `src/types/protocol.ts`
- Update `CommitData` and `RevealData` types (per Step 3)
- Update `NoteSignalType` — remove `"commit"`, `"reveal"`, `"stake"` variants
  - New type: `"join" | "accept" | "draft_pick"`
- Update `NoteSignal` and `GameNote` if needed

### `src/store/gameStore.ts`
- Add `arena: ArenaState` and `refreshArena` (per Step 2)
- Add `"arenaSetup"` to `Screen` type
- Remove from `BattleState`: `opponentCommitNotes`, `opponentReveal` (replaced by arena polling)
- Remove actions: `setOpponentCommitNotes`, `setOpponentReveal`
- Keep: `myCommit`, `myReveal` (local state before tx submit), `setMyCommit`, `setMyReveal`

### `src/engine/__tests__/commitment.test.ts`
- Rewrite tests for RPO-based `createCommitment` / `createReveal`
- Remove `verifyReveal` tests
- Add test: RPO hash output matches expected format (4 bigints, non-zero)

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `scripts/deploy.sh` | **Edit** | Add faucet_id + p2id_script_hash initialization after deployment |
| `src/utils/arenaNote.ts` | **Create** | Note script loading, caching, note builders, two-tx orchestrator, `randomFelt()` |
| `src/hooks/useArenaState.ts` | **Create** | Arena storage polling hook (backed by Zustand store) |
| `src/store/gameStore.ts` | **Edit** | Add arena slice, `"arenaSetup"` screen, remove obsolete battle fields/actions |
| `src/engine/commitment.ts` | **Rewrite** | SHA-256 → RPO256 (sync), remove verifyReveal, add debugVerifyReveal |
| `src/types/protocol.ts` | **Edit** | Update CommitData/RevealData, trim NoteSignalType |
| `src/hooks/useStaking.ts` | **Rewrite** | P2IDE → process_stake_note to arena |
| `src/hooks/useDraft.ts` | **Edit** | Change transition to `"arenaSetup"`, team submission in setup phase |
| `src/hooks/useCommitReveal.ts` | **Rewrite** | P2ID attachment → submit_move_note to arena |
| `src/hooks/useCombatTurn.ts` | **Edit** | Rewrite phase machine for arena-based detection, preserve audio |
| `src/hooks/useNoteDecoder.ts` | **Edit** | Remove stake/rawOpponentNotes categories |
| `src/constants/protocol.ts` | **Edit** | Remove MSG_TYPE_COMMIT/REVEAL |
| `src/utils/bytes.ts` | **Delete** | No longer needed (was only used by old commitment.ts) |
| `src/utils/__tests__/bytes.test.ts` | **Delete** | Tests for deleted module |
| `src/engine/__tests__/commitment.test.ts` | **Rewrite** | RPO-based commitment tests |
| `contracts/submit-move-note/src/lib.rs` | **Edit** | Add phase 2 → `claim_timeout()` (if not deferring) |

---

## Verification

1. **Step 0 — slot names + API signatures:** Deploy arena, call `getSlotNames()`, verify `NoteStorage` constructor, verify `NoteScript.fromPackage()` with `.masp` bytes, verify `faucet_id`/`p2id_script_hash` initialization
2. **TypeScript compilation:** `npx tsc --noEmit` — all new/modified files compile without errors
3. **RPO hash compatibility test:** Create commitment in browser, verify the 4-Felt Word matches what `hash_elements(vec![move, np1, np2])` produces in Rust (can test via `cargo test` in combat-engine with matching inputs)
4. **Note script loading:** Verify `.masp` files load via `fetch()` → `Package.deserialize()` → `NoteScript.fromPackage()` without errors
5. **Stake flow smoke test:** With deployed arena, run the full `submitArenaNote` flow for a stake note — confirm arena state transitions from 0→1
6. **Nonce conflict test:** Have both players submit arena txs simultaneously, verify retry logic recovers
7. **End-to-end (with deployed arena):** Full game flow — matchmaking → draft → arena setup (stake + team) → commit → reveal → resolution → payout

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Storage slot names don't match Rust field names | **Step 0 verification** before writing code |
| `NoteStorage` constructor signature differs | **Step 0 verification** |
| `faucet_id`/`p2id_script_hash` not initialized | **Step 0a** — enhance deploy script or contract |
| Two-tx latency per action (create + consume) | Accept ~1 block delay; `submitArenaNote` handles both txs sequentially |
| Concurrent arena txs from both players (nonce conflict) | Retry with exponential backoff in `submitArenaNote` (max 3 attempts) |
| Package.deserialize may not accept .masp format | Test with actual .masp bytes in Step 0; fall back to `NoteScript.deserialize()` if needed |
| Note not discoverable after first tx | Public notes auto-discovered during sync; no tag registration needed |
| `submitArenaNote` step 1 succeeds but step 2 fails | Return `{ noteId }`; log for manual retry |
| `randomFelt()` produces value above field modulus | Use `>> 2n` shift to cap at 2^62, safely below modulus (~2^64) |
| `importAccountById` doesn't pull full component code | Verify in Step 0 that cross-context calls work after import |
| `set_team` fails because opponent hasn't joined yet | Gate team submission on `gameState >= 2` (Step 5) |
| Draft teams overlap on-chain despite local check | Local draft prevents overlap; on-chain check is defense-in-depth; retry on failure |

---

## Implementation Order

Implement in this order to allow incremental testing:

1. [x] **Step 0** (prerequisites) — deploy, verify APIs, initialize storage slots
2. [x] **Step 1** (arenaNote.ts) — utility layer; test script loading with actual .masp files
3. [x] **Step 2** (useArenaState.ts + gameStore) — arena polling; verify slot access pattern
4. [x] **Step 3** (commitment.ts + protocol.ts) — RPO hash; verify hash compatibility with contract
5. [x] **Step 4** (useStaking.ts) — first arena interaction; validates full `submitArenaNote` flow
6. [x] **Step 5** (useDraft.ts + ArenaSetupScreen) — team submission; arena setup flow
7. [x] **Step 6** (useCommitReveal.ts) — combat; arena-based commit/reveal
8. [x] **Step 7** (useCombatTurn.ts) — phase machine rewrite for arena polling
9. [x] **Step 8** (supporting files) — cleanup, remove dead code, update tests

## Key Findings

### Toolchain
- **Compiler:** `cargo-miden v0.7.1` from `0xMiden/compiler` repo
- **Nightly:** `nightly-2025-12-10`
- **Target:** `wasm32-wasip2`
- **SDK crate:** `miden = { version = "0.10" }`

### Real API (vs RustEngine.md pseudocode)
- `#[component]` on struct + impl (not `#[account_component]`)
- `Value` type for single storage slots (with `ValueAccess` trait)
- `Word` is a struct (not `[Felt; 4]`), constructed via `Word::new([...])`
- `Felt::from_u32()` / `Felt::from_u64_unchecked()` for construction
- `felt.as_u64()` for extraction
- `Value.read()` / `Value.write()` are generic — return type annotation determines conversion
- `Value.write()` returns the previous value

### Build Sizes
- Template counter: 9KB .masp
- Combat engine program: 145KB .masp
- Arena account component (Phase 2, 21 slots): 381KB .masp
- Arena account component (Phase 3, 23 slots, payouts): 475KB .masp
- Arena account component (Phase 3b, +receive_asset): 510KB .masp
- submit-move-note (cross-ctx): 106KB .masp
- process-stake-note (cross-ctx): 95KB .masp
- process-team-note (cross-ctx): 24KB .masp

### Known Issues
- `cargo miden test` fails with macro expansion error
- Large struct returns miscompiled (compiler v0.7.1 bug) — reported to Dennis with repro zip
- `#[inline(always)]` not sufficient across crate boundaries
