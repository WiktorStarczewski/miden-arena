# Verification Service — Trustless Staking for Miden Arena

## Problem

Miden Arena is a fully peer-to-peer game with no backend. Players stake 10 MIDEN each before a match, and the winner should receive the 20 MIDEN pot. However, combat resolution runs client-side (TypeScript), so there is no on-chain proof of who won. A malicious client could claim victory and withdraw the opponent's stake.

## Solution Overview

Introduce a lightweight **verification service** that reads publicly available game moves from the Miden blockchain, replays the deterministic combat engine, and attests the winner to an on-chain escrow account.

```
Player A ──── 10 MIDEN ────► Escrow Account ◄──── 10 MIDEN ──── Player B
                                   │
                                   │  "Player A won"
                                   │  (signed by verification service)
                                   │
                              Verification Service
                              (reads public notes,
                               replays combat engine)
                                   │
                                   ▼
Escrow Account ──── 20 MIDEN ────► Player A (winner)
```

## How It Works

### 1. Staking

Before the match, both players send 10 MIDEN to a shared **escrow account** (a Miden account with custom logic). The escrow holds the pot until the verification service attests the winner.

### 2. Gameplay (unchanged)

Players play normally using the existing commit-reveal protocol:

1. **Commit**: each player sends `SHA-256(move + nonce)` as a public note
2. **Reveal**: after both commits are received, each player reveals `move + nonce`

All commit and reveal notes use `noteType: "public"`, so the full move history is recorded on the Miden blockchain. The commit-reveal protocol ensures neither player can peek at the other's move before committing — the hash hides the move, and the random nonce prevents brute-forcing (only ~20 possible moves, but the 256-bit nonce makes hash preimage infeasible).

### 3. Verification

After the match ends:

1. The winning player calls the verification service (via HTTP) with the game ID / escrow note IDs
2. The service reads all public commit/reveal notes for that game from the Miden RPC
3. The service replays the game using the **same deterministic combat engine** (`src/engine/combat.ts`)
4. The service verifies the reported winner matches the replayed result
5. The service sends a signed **payout note** to the escrow account, specifying the winner's account ID

### 4. Payout

The escrow account's custom MASM logic:

1. Checks `note.sender == trusted_verification_service_id` (hardcoded at deployment)
2. Reads the winner's account ID from the note inputs
3. Sends 20 MIDEN to the winner's session wallet

Since every Miden transaction is STARK-proven, the `note.sender` field cannot be forged — the network rejects transactions not properly authenticated by the sending account's Falcon-512 key.

## Trust Model

### What is trustless

- **Move secrecy**: commit-reveal protocol with SHA-256 + random nonce prevents peeking
- **Move integrity**: both players verify opponent's reveal matches their committed hash
- **Service identity**: escrow verifies the payout note sender via Miden's cryptographic proofs (unforgeable `note.sender`)
- **Service correctness**: since all game inputs are public on-chain, anyone can independently replay the game and verify the service reported the correct winner

### What requires trust

- **Service availability**: if the service goes down, payouts stall (mitigated by timeout refund — see below)
- **Service key security**: if the service's Falcon-512 key is compromised, an attacker could send fraudulent payout notes
- **Service honesty**: the service could theoretically lie about the winner, but this is **detectable** — anyone can replay the public moves and prove the service lied

### Comparison with alternatives

| Approach | Trust assumption | Complexity |
|----------|-----------------|------------|
| **Current (no staking)** | N/A — no stakes at risk | None |
| **Client-side honor system** | Loser's client honestly sends funds | Low |
| **Mutual attestation** | A cheater can force a refund (draw) but never steal | Low-medium |
| **Verification service (this)** | Service is honest and available (publicly auditable) | Medium |
| **On-chain MASM combat engine** | Fully trustless (network verifies) | Very high |

## Failure Modes and Mitigations

### Service is down

The escrow implements a **timeout refund**: if no valid payout note is received within N blocks (e.g., 500 blocks) after both stakes are deposited, either player can reclaim their 10 MIDEN. A stalled service results in a refund, never a loss.

### Player abandons mid-game

If a player disconnects during commit-reveal, the opponent's client stops sending moves. After the timeout, both players reclaim stakes from the escrow. The commit-reveal notes are P2IDE (Pay-to-ID with Expiry) with a recall height, so protocol notes are also reclaimable.

### Disputed outcome

Since all moves are public, a dispute is trivially resolvable: replay the game from the on-chain move log. The verification service's output is deterministic and reproducible. A governance mechanism could be added later, but for testnet this is unnecessary.

## Verification Service Architecture

### What it does

1. Exposes an HTTP endpoint: `POST /verify` with game metadata (player IDs, escrow note IDs)
2. Reads public notes from the Miden testnet RPC
3. Replays combat using the existing TypeScript engine (same `resolveTurn()` function)
4. Sends a payout note to the escrow via the Miden client SDK (WASM)

### Implementation

- **Runtime**: Node.js with the Miden WASM client SDK (`@miden-sdk/miden-sdk`)
- **Combat engine**: import directly from `src/engine/combat.ts` (shared code between client and service)
- **Miden interaction**: the service holds its own Falcon-512 keypair and has a Miden account on testnet
- **State**: stateless — all inputs come from on-chain notes, no database needed

### Hosting

Lightweight enough for free/cheap hosting:

- **Fly.io / Railway**: always-on container, free tier, deploy from Git
- **VPS**: any small instance ($5/month), run as a Node.js process
- **Self-hosted**: fine for testnet/development

### Endpoints

```
POST /verify
  Body: { escrowAccountId, playerA, playerB, gameNoteIds[] }
  Response: { winner, txHash } or { error }

GET /health
  Response: { status: "ok", lastSync: <block_height> }
```

## Escrow Account (MASM)

The escrow is a custom Miden account with minimal logic:

1. **Accept stakes**: receive and hold fungible assets from two specified player accounts
2. **Accept payout instruction**: consume a note from the trusted verification service, read the winner's account ID from note inputs
3. **Disburse**: send the full pot to the winner
4. **Timeout refund**: if no payout received within N blocks, allow either player to reclaim their stake

The escrow only needs to verify `note.sender == TRUSTED_SERVICE_ID` — it does not need to understand game logic.

## Implementation Phases

### Phase 1: Escrow account
- Write the MASM account code (accept stakes, verify service sender, disburse, timeout refund)
- Deploy to Miden testnet
- Test with manual note sends

### Phase 2: Verification service
- Node.js service importing the shared combat engine
- Miden SDK integration for reading notes and sending payout
- HTTP endpoint for game verification requests
- Deploy to Fly.io or similar

### Phase 3: Client integration
- Modify `useStaking.ts` to send stakes to the escrow account (not to each other)
- After game over, call the verification service endpoint instead of local `withdraw()`
- Display payout status in the Game Over screen
- Add timeout refund UI for edge cases

### Phase 4: Transparency (optional)
- Public dashboard showing all verified games and their on-chain move logs
- Open-source the verification service so anyone can run an independent verifier
- Add a "verify this game" button that replays the match from on-chain data in the browser
