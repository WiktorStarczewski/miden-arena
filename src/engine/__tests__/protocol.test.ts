/**
 * Protocol simulation tests.
 *
 * These tests simulate the full note exchange between two players without
 * React hooks or the Miden SDK. They exercise the same detection logic
 * used in useMatchmaking, useDraft, and useCommitReveal — verifying that
 * stale notes are filtered, amounts are correctly classified, and the
 * commit-reveal cryptography survives non-deterministic note ordering.
 */

import { describe, it, expect } from "vitest";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  LEAVE_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
  MOVE_MIN,
  MOVE_MAX,
} from "../../constants/protocol";
import {
  createCommitment,
  createReveal,
  verifyReveal,
  COMMIT_AMOUNT_OFFSET,
} from "../commitment";
import { encodeDraftPick, decodeDraftPick } from "../codec";

// ---------------------------------------------------------------------------
// Virtual note network — simulates Miden note exchange
// ---------------------------------------------------------------------------

interface VirtualNote {
  id: string;
  sender: string;
  amount: bigint;
  assets: { amount: bigint }[];
}

class NoteNetwork {
  private inboxes = new Map<string, VirtualNote[]>();
  private nextId = 0;

  /** Send a note from one wallet to another. Returns the note ID. */
  send(from: string, to: string, amount: bigint): string {
    const id = `note-${this.nextId++}`;
    const note: VirtualNote = { id, sender: from, amount, assets: [{ amount }] };
    const inbox = this.inboxes.get(to) ?? [];
    inbox.push(note);
    this.inboxes.set(to, inbox);
    return id;
  }

  /** Get all committed notes for a wallet (simulates useNotes). */
  getCommitted(walletId: string): VirtualNote[] {
    return this.inboxes.get(walletId) ?? [];
  }
}

// ---------------------------------------------------------------------------
// Helper: note detection functions (mirrors hook logic)
// ---------------------------------------------------------------------------

function findNewJoinNote(
  notes: VirtualNote[],
  handledIds: Set<string>,
): VirtualNote | undefined {
  return notes.find(
    (n) =>
      n.assets.length > 0 &&
      n.assets[0].amount === JOIN_SIGNAL &&
      !handledIds.has(n.id),
  );
}

function findNewAcceptNote(
  notes: VirtualNote[],
  opponentId: string,
  handledIds: Set<string>,
): VirtualNote | undefined {
  return notes.find(
    (n) =>
      n.sender === opponentId &&
      n.assets.length > 0 &&
      n.assets[0].amount === ACCEPT_SIGNAL &&
      !handledIds.has(n.id),
  );
}

function findNewDraftPick(
  notes: VirtualNote[],
  handledIds: Set<string>,
): VirtualNote | undefined {
  return notes.find(
    (n) =>
      !handledIds.has(n.id) &&
      n.amount >= DRAFT_PICK_MIN &&
      n.amount <= DRAFT_PICK_MAX,
  );
}

function findCommitNotes(
  notes: VirtualNote[],
  handledIds: Set<string>,
): VirtualNote[] {
  return notes.filter(
    (n) => !handledIds.has(n.id) && n.amount > COMMIT_AMOUNT_OFFSET,
  );
}

function findRevealNotes(
  notes: VirtualNote[],
  handledIds: Set<string>,
): { moveNote: VirtualNote; nonceNotes: VirtualNote[] } | null {
  const candidates = notes.filter(
    (n) =>
      !handledIds.has(n.id) &&
      n.amount > 0n &&
      n.amount <= COMMIT_AMOUNT_OFFSET,
  );

  if (candidates.length < 3) return null;

  const moveNote = candidates.find(
    (n) => n.amount >= MOVE_MIN && n.amount <= MOVE_MAX,
  );
  const nonceNotes = candidates.filter(
    (n) => n !== moveNote && n.amount > MOVE_MAX,
  );

  if (!moveNote || nonceNotes.length < 2) return null;
  return { moveNote, nonceNotes: nonceNotes.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Matchmaking protocol tests
// ---------------------------------------------------------------------------

describe("matchmaking protocol", () => {
  it("full host-join flow: host detects JOIN, sends ACCEPT, joiner detects ACCEPT", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const joiner = "joiner-wallet";

    // Host starts hosting — snapshot current notes (none)
    const handledJoinIds = new Set<string>();

    // Joiner sends JOIN
    net.send(joiner, host, JOIN_SIGNAL);

    // Host polls — should detect new JOIN
    const joinNote = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(joinNote).toBeDefined();
    expect(joinNote!.sender).toBe(joiner);

    // Host marks JOIN as handled and sends ACCEPT
    handledJoinIds.add(joinNote!.id);
    net.send(host, joiner, ACCEPT_SIGNAL);

    // Joiner polls — should detect ACCEPT
    const handledAcceptIds = new Set<string>();
    const acceptNote = findNewAcceptNote(
      net.getCommitted(joiner),
      host,
      handledAcceptIds,
    );
    expect(acceptNote).toBeDefined();
    expect(acceptNote!.sender).toBe(host);
  });

  it("stale JOIN note from previous game is filtered on rehost", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const oldJoiner = "old-joiner";
    const newJoiner = "new-joiner";

    // Previous game: old joiner sent JOIN
    net.send(oldJoiner, host, JOIN_SIGNAL);

    // Host starts hosting — SDK is loaded, snapshot captures stale note
    const initialNotes = net.getCommitted(host);
    const handledJoinIds = new Set(
      initialNotes
        .filter((n) => n.assets[0].amount === JOIN_SIGNAL)
        .map((n) => n.id),
    );

    // Verify stale note is captured
    expect(handledJoinIds.size).toBe(1);

    // Host polls — should NOT detect stale JOIN
    const staleMatch = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(staleMatch).toBeUndefined();

    // New joiner sends JOIN
    net.send(newJoiner, host, JOIN_SIGNAL);

    // Host polls — should detect ONLY the new JOIN
    const newMatch = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(newMatch).toBeDefined();
    expect(newMatch!.sender).toBe(newJoiner);
  });

  it("deferred baseline: captures stale notes when SDK loads late", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const oldJoiner = "old-joiner";
    const newJoiner = "new-joiner";

    // Previous game note exists on-chain
    net.send(oldJoiner, host, JOIN_SIGNAL);

    // Host clicks "Host" — SDK hasn't loaded yet, snapshot is empty
    const handledJoinIds = new Set<string>();
    let needsBaseline = true; // flag: SDK was empty at host() time

    // First SDK poll: loads historical notes (stale JOIN from old game)
    const firstPoll = net.getCommitted(host);
    expect(firstPoll.length).toBe(1);

    // Apply deferred baseline: capture all JOIN notes as stale, skip cycle
    if (needsBaseline && firstPoll.length > 0) {
      for (const n of firstPoll) {
        if (n.assets[0].amount === JOIN_SIGNAL) {
          handledJoinIds.add(n.id);
        }
      }
      needsBaseline = false;
      // return; — skip this cycle in the real effect
    }

    // Second poll (same notes): stale note correctly filtered
    const joinNote1 = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(joinNote1).toBeUndefined();

    // New joiner sends JOIN
    net.send(newJoiner, host, JOIN_SIGNAL);

    // Third poll: detects new note
    const joinNote2 = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(joinNote2).toBeDefined();
    expect(joinNote2!.sender).toBe(newJoiner);
  });

  it("baseline is skipped when SDK was loaded at host() time", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const joiner = "joiner-wallet";

    // SDK is loaded but no stale notes exist (first game)
    const handledJoinIds = new Set<string>();
    const needsBaseline = false; // SDK was loaded (empty but loaded)

    // Joiner sends JOIN
    net.send(joiner, host, JOIN_SIGNAL);

    // Host polls — baseline flag is false, detects immediately
    expect(needsBaseline).toBe(false);
    const joinNote = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(joinNote).toBeDefined();
    expect(joinNote!.sender).toBe(joiner);
  });

  it("multiple stale JOIN notes are all filtered", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";

    // Three previous joiners all sent JOIN signals
    net.send("joiner-1", host, JOIN_SIGNAL);
    net.send("joiner-2", host, JOIN_SIGNAL);
    net.send("joiner-3", host, JOIN_SIGNAL);

    // Host starts hosting — captures all stale notes
    const handledJoinIds = new Set(
      net
        .getCommitted(host)
        .filter((n) => n.assets[0].amount === JOIN_SIGNAL)
        .map((n) => n.id),
    );
    expect(handledJoinIds.size).toBe(3);

    // No new JOIN notes — should not match
    const match = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(match).toBeUndefined();

    // New joiner joins
    net.send("joiner-4", host, JOIN_SIGNAL);
    const newMatch = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(newMatch).toBeDefined();
    expect(newMatch!.sender).toBe("joiner-4");
  });

  it("LEAVE signal from previous opponent does not interfere", () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const joiner = "joiner-wallet";

    // Some stale LEAVE notes exist
    net.send("old-opponent", host, LEAVE_SIGNAL);
    net.send("other-player", host, LEAVE_SIGNAL);

    const handledJoinIds = new Set(
      net
        .getCommitted(host)
        .filter((n) => n.assets[0].amount === JOIN_SIGNAL)
        .map((n) => n.id),
    );

    // LEAVE notes don't match JOIN filter
    const match1 = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(match1).toBeUndefined();

    // Actual JOIN arrives
    net.send(joiner, host, JOIN_SIGNAL);
    const match2 = findNewJoinNote(net.getCommitted(host), handledJoinIds);
    expect(match2).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Draft protocol tests
// ---------------------------------------------------------------------------

describe("draft protocol", () => {
  it("draft pick amounts are in expected range [1, 10]", () => {
    for (let id = 0; id <= 9; id++) {
      const amount = encodeDraftPick(id);
      expect(amount).toBeGreaterThanOrEqual(DRAFT_PICK_MIN);
      expect(amount).toBeLessThanOrEqual(DRAFT_PICK_MAX);
    }
  });

  it("draft pick roundtrip through note exchange", () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";
    const handledIds = new Set<string>();

    // Player A picks champion 5
    const amount = encodeDraftPick(5);
    net.send(playerA, playerB, amount);

    // Player B detects the pick
    const pickNote = findNewDraftPick(net.getCommitted(playerB), handledIds);
    expect(pickNote).toBeDefined();

    const decoded = decodeDraftPick(pickNote!.amount);
    expect(decoded).toBe(5);

    // Mark handled
    handledIds.add(pickNote!.id);

    // No more picks detected
    expect(findNewDraftPick(net.getCommitted(playerB), handledIds)).toBeUndefined();
  });

  it("stale draft picks from previous game are filtered", () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Old game picks
    net.send(playerA, playerB, encodeDraftPick(0));
    net.send(playerA, playerB, encodeDraftPick(3));
    net.send(playerA, playerB, encodeDraftPick(7));

    // New game: snapshot stale note IDs
    const handledIds = new Set(
      net.getCommitted(playerB).map((n) => n.id),
    );

    // No new picks
    expect(findNewDraftPick(net.getCommitted(playerB), handledIds)).toBeUndefined();

    // New pick arrives
    net.send(playerA, playerB, encodeDraftPick(2));
    const pick = findNewDraftPick(net.getCommitted(playerB), handledIds);
    expect(pick).toBeDefined();
    expect(decodeDraftPick(pick!.amount)).toBe(2);
  });

  it("draft pick amounts don't overlap with matchmaking signals", () => {
    // Draft: [1, 10], JOIN: 100, ACCEPT: 101, LEAVE: 102
    expect(DRAFT_PICK_MAX).toBeLessThan(JOIN_SIGNAL);
  });
});

// ---------------------------------------------------------------------------
// Commit-reveal protocol tests
// ---------------------------------------------------------------------------

describe("commit-reveal protocol", () => {
  it("full commit-reveal flow via note exchange", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";
    const handledIds = new Set<string>();

    // Player A commits move 5
    const commitA = await createCommitment(5);
    net.send(playerA, playerB, commitA.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(playerA, playerB, commitA.part2 + COMMIT_AMOUNT_OFFSET);

    // Player B detects commit notes
    const commitNotes = findCommitNotes(net.getCommitted(playerB), handledIds);
    expect(commitNotes.length).toBe(2);

    // Strip offset for verification
    const rawPart1 = commitNotes[0].amount - COMMIT_AMOUNT_OFFSET;
    const rawPart2 = commitNotes[1].amount - COMMIT_AMOUNT_OFFSET;

    // Mark handled
    commitNotes.forEach((n) => handledIds.add(n.id));

    // Player A reveals
    const revealA = createReveal(commitA.move, commitA.nonce);
    net.send(playerA, playerB, BigInt(revealA.move));
    net.send(playerA, playerB, revealA.noncePart1);
    net.send(playerA, playerB, revealA.noncePart2);

    // Player B detects reveal notes
    const reveal = findRevealNotes(net.getCommitted(playerB), handledIds);
    expect(reveal).not.toBeNull();
    expect(Number(reveal!.moveNote.amount)).toBe(5);

    // Verify
    const valid = await verifyReveal(
      Number(reveal!.moveNote.amount),
      reveal!.nonceNotes[0].amount,
      reveal!.nonceNotes[1].amount,
      rawPart1,
      rawPart2,
    );
    expect(valid).toBe(true);
  });

  it("simultaneous commit-reveal: both players exchange in parallel", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Both players commit
    const commitA = await createCommitment(7);
    const commitB = await createCommitment(14);

    // A sends commit to B
    net.send(playerA, playerB, commitA.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(playerA, playerB, commitA.part2 + COMMIT_AMOUNT_OFFSET);

    // B sends commit to A
    net.send(playerB, playerA, commitB.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(playerB, playerA, commitB.part2 + COMMIT_AMOUNT_OFFSET);

    // Both detect opponent's commit
    const handledA = new Set<string>();
    const handledB = new Set<string>();

    const commitNotesForA = findCommitNotes(net.getCommitted(playerA), handledA);
    const commitNotesForB = findCommitNotes(net.getCommitted(playerB), handledB);
    expect(commitNotesForA.length).toBe(2);
    expect(commitNotesForB.length).toBe(2);

    commitNotesForA.forEach((n) => handledA.add(n.id));
    commitNotesForB.forEach((n) => handledB.add(n.id));

    // Both reveal
    const revealA = createReveal(commitA.move, commitA.nonce);
    net.send(playerA, playerB, BigInt(revealA.move));
    net.send(playerA, playerB, revealA.noncePart1);
    net.send(playerA, playerB, revealA.noncePart2);

    const revealB = createReveal(commitB.move, commitB.nonce);
    net.send(playerB, playerA, BigInt(revealB.move));
    net.send(playerB, playerA, revealB.noncePart1);
    net.send(playerB, playerA, revealB.noncePart2);

    // Both detect and verify opponent's reveal
    const revealForA = findRevealNotes(net.getCommitted(playerA), handledA);
    const revealForB = findRevealNotes(net.getCommitted(playerB), handledB);

    expect(revealForA).not.toBeNull();
    expect(revealForB).not.toBeNull();

    const rawA1 = commitNotesForA[0].amount - COMMIT_AMOUNT_OFFSET;
    const rawA2 = commitNotesForA[1].amount - COMMIT_AMOUNT_OFFSET;
    const rawB1 = commitNotesForB[0].amount - COMMIT_AMOUNT_OFFSET;
    const rawB2 = commitNotesForB[1].amount - COMMIT_AMOUNT_OFFSET;

    // A verifies B's reveal
    const validB = await verifyReveal(
      Number(revealForA!.moveNote.amount),
      revealForA!.nonceNotes[0].amount,
      revealForA!.nonceNotes[1].amount,
      rawA1,
      rawA2,
    );
    expect(validB).toBe(true);

    // B verifies A's reveal
    const validA = await verifyReveal(
      Number(revealForB!.moveNote.amount),
      revealForB!.nonceNotes[0].amount,
      revealForB!.nonceNotes[1].amount,
      rawB1,
      rawB2,
    );
    expect(validA).toBe(true);
  });

  it("stale commit notes from previous round are filtered", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Round 1: A commits
    const commit1 = await createCommitment(3);
    net.send(playerA, playerB, commit1.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(playerA, playerB, commit1.part2 + COMMIT_AMOUNT_OFFSET);

    // B detects round 1 commit
    const handledB = new Set<string>();
    const r1Commits = findCommitNotes(net.getCommitted(playerB), handledB);
    expect(r1Commits.length).toBe(2);
    r1Commits.forEach((n) => handledB.add(n.id));

    // Round 1 reveal (mark notes as handled)
    const reveal1 = createReveal(commit1.move, commit1.nonce);
    net.send(playerA, playerB, BigInt(reveal1.move));
    net.send(playerA, playerB, reveal1.noncePart1);
    net.send(playerA, playerB, reveal1.noncePart2);
    const r1Reveal = findRevealNotes(net.getCommitted(playerB), handledB);
    expect(r1Reveal).not.toBeNull();
    handledB.add(r1Reveal!.moveNote.id);
    r1Reveal!.nonceNotes.forEach((n) => handledB.add(n.id));

    // Round 2: A commits again
    const commit2 = await createCommitment(15);
    net.send(playerA, playerB, commit2.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(playerA, playerB, commit2.part2 + COMMIT_AMOUNT_OFFSET);

    // B detects ONLY round 2 commit (round 1 notes are handled)
    const r2Commits = findCommitNotes(net.getCommitted(playerB), handledB);
    expect(r2Commits.length).toBe(2);

    // Verify the amounts match round 2's commit, not round 1's
    const r2Amounts = new Set(r2Commits.map((n) => n.amount));
    expect(r2Amounts.has(commit2.part1 + COMMIT_AMOUNT_OFFSET)).toBe(true);
    expect(r2Amounts.has(commit2.part2 + COMMIT_AMOUNT_OFFSET)).toBe(true);
  });

  it("commit and reveal note amounts never overlap", async () => {
    // Run 100 random moves to verify amount ranges never overlap
    for (let i = 0; i < 100; i++) {
      const move = (i % 20) + 1;
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      const commitAmounts = [
        commit.part1 + COMMIT_AMOUNT_OFFSET,
        commit.part2 + COMMIT_AMOUNT_OFFSET,
      ];
      const revealAmounts = [
        BigInt(reveal.move),
        reveal.noncePart1,
        reveal.noncePart2,
      ];

      // All commit amounts > COMMIT_AMOUNT_OFFSET
      for (const a of commitAmounts) {
        expect(a).toBeGreaterThan(COMMIT_AMOUNT_OFFSET);
      }
      // All reveal amounts <= COMMIT_AMOUNT_OFFSET
      for (const a of revealAmounts) {
        expect(a).toBeLessThanOrEqual(COMMIT_AMOUNT_OFFSET);
      }
      // Move is in [1, 20]
      expect(BigInt(reveal.move)).toBeGreaterThanOrEqual(MOVE_MIN);
      expect(BigInt(reveal.move)).toBeLessThanOrEqual(MOVE_MAX);
      // Nonce parts are in (20, 65556]
      expect(reveal.noncePart1).toBeGreaterThan(MOVE_MAX);
      expect(reveal.noncePart2).toBeGreaterThan(MOVE_MAX);
    }
  });

  it("verification survives all 4 note orderings", async () => {
    // Run 50 random commitments and verify all orderings work
    for (let i = 0; i < 50; i++) {
      const move = (i % 20) + 1;
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      const orderings: [bigint, bigint, bigint, bigint][] = [
        [reveal.noncePart1, reveal.noncePart2, commit.part1, commit.part2],
        [reveal.noncePart2, reveal.noncePart1, commit.part1, commit.part2],
        [reveal.noncePart1, reveal.noncePart2, commit.part2, commit.part1],
        [reveal.noncePart2, reveal.noncePart1, commit.part2, commit.part1],
      ];

      for (const [np1, np2, cp1, cp2] of orderings) {
        const valid = await verifyReveal(reveal.move, np1, np2, cp1, cp2);
        expect(valid).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Amount range classification tests
// ---------------------------------------------------------------------------

describe("amount range classification", () => {
  it("all signal types occupy non-overlapping ranges", () => {
    // Matchmaking: JOIN=100, ACCEPT=101, LEAVE=102
    // Draft picks: [1, 10]
    // Commit: [100001, 165536]
    // Reveal move: [1, 20]
    // Reveal nonce: [21, 65556]

    // Within battle context, commit vs reveal ranges must not overlap
    const commitMin = COMMIT_AMOUNT_OFFSET + 1n; // 100001
    const revealMoveMax = MOVE_MAX; // 20
    const revealNonceMin = MOVE_MAX + 1n; // 21
    const revealNonceMax = 65556n;

    // Commit range [100001, 165536] starts above reveal range [1, 65556]
    expect(commitMin).toBeGreaterThan(revealNonceMax);

    // Move [1,20] and nonce [21,65556] ranges are adjacent but not overlapping
    expect(revealNonceMin).toBeGreaterThan(revealMoveMax);

    // Draft pick range overlaps with reveal move range (OK — different phases)
    expect(DRAFT_PICK_MAX).toBeLessThanOrEqual(MOVE_MAX);
  });

  it("classifies amounts correctly for commit notes", () => {
    // Any amount > COMMIT_AMOUNT_OFFSET is a commit note
    const testAmounts = [
      COMMIT_AMOUNT_OFFSET + 1n,
      COMMIT_AMOUNT_OFFSET + 32768n,
      COMMIT_AMOUNT_OFFSET + 65536n,
    ];

    for (const amount of testAmounts) {
      expect(amount).toBeGreaterThan(COMMIT_AMOUNT_OFFSET);
      expect(amount).toBeLessThanOrEqual(COMMIT_AMOUNT_OFFSET + 65536n);
    }
  });

  it("classifies amounts correctly for reveal move notes", () => {
    for (let move = 1; move <= 20; move++) {
      const amount = BigInt(move);
      expect(amount).toBeGreaterThanOrEqual(MOVE_MIN);
      expect(amount).toBeLessThanOrEqual(MOVE_MAX);
      // Not a commit note
      expect(amount).toBeLessThanOrEqual(COMMIT_AMOUNT_OFFSET);
    }
  });

  it("classifies amounts correctly for reveal nonce notes", () => {
    // Nonce parts are in [21, 65556]
    const testAmounts = [21n, 100n, 32789n, 65556n];
    for (const amount of testAmounts) {
      expect(amount).toBeGreaterThan(MOVE_MAX);
      expect(amount).toBeLessThanOrEqual(COMMIT_AMOUNT_OFFSET);
    }
  });
});

// ---------------------------------------------------------------------------
// Wallet transaction sequencing (state commitment model)
// ---------------------------------------------------------------------------

/**
 * Simulates a Miden wallet that rejects concurrent transactions.
 * Each send updates the wallet's state commitment; a second send while
 * one is in-flight will see a stale commitment and fail — exactly the
 * error: "transaction's initial state commitment does not match".
 */
class SequentialWallet {
  private net: NoteNetwork;
  readonly id: string;
  private txInFlight = false;

  constructor(net: NoteNetwork, id: string) {
    this.net = net;
    this.id = id;
  }

  /** Simulate an async send that takes time (like a real Miden tx). */
  async send(to: string, amount: bigint): Promise<string> {
    if (this.txInFlight) {
      throw new Error(
        "transaction's initial state commitment does not match the account's current value",
      );
    }
    this.txInFlight = true;
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 10));
    this.txInFlight = false;
    return this.net.send(this.id, to, amount);
  }
}

describe("wallet transaction sequencing", () => {
  it("concurrent sends cause state commitment mismatch (the bug)", async () => {
    const net = new NoteNetwork();
    const wallet = new SequentialWallet(net, "host-wallet");

    // Fire-and-forget LEAVE (don't await)
    const leavePromise = wallet.send("old-opponent", LEAVE_SIGNAL);

    // Immediately try to send ACCEPT — wallet state is dirty
    await expect(
      wallet.send("new-joiner", ACCEPT_SIGNAL),
    ).rejects.toThrow("initial state commitment");

    // Clean up
    await leavePromise;
  });

  it("sequential sends succeed (the fix)", async () => {
    const net = new NoteNetwork();
    const wallet = new SequentialWallet(net, "host-wallet");

    // Await LEAVE first
    await wallet.send("old-opponent", LEAVE_SIGNAL);

    // Then ACCEPT — wallet state is settled
    await expect(
      wallet.send("new-joiner", ACCEPT_SIGNAL),
    ).resolves.toBeDefined();

    // Both notes delivered
    const oldOpponentNotes = net.getCommitted("old-opponent");
    const joinerNotes = net.getCommitted("new-joiner");
    expect(oldOpponentNotes).toHaveLength(1);
    expect(oldOpponentNotes[0].amount).toBe(LEAVE_SIGNAL);
    expect(joinerNotes).toHaveLength(1);
    expect(joinerNotes[0].amount).toBe(ACCEPT_SIGNAL);
  });

  it("rehost flow: LEAVE → wait → detect JOIN → ACCEPT (full sequence)", async () => {
    const net = new NoteNetwork();
    const hostWallet = new SequentialWallet(net, "host-wallet");
    const joinerWallet = new SequentialWallet(net, "joiner-wallet");

    // --- Previous game produced a stale JOIN note ---
    net.send("old-joiner", hostWallet.id, JOIN_SIGNAL);

    // --- Host rehosts ---

    // 1. Await LEAVE to old opponent (wallet state settles)
    await hostWallet.send("old-joiner", LEAVE_SIGNAL);

    // 2. Snapshot stale JOIN notes
    const handledJoinIds = new Set(
      net
        .getCommitted(hostWallet.id)
        .filter((n) => n.assets[0].amount === JOIN_SIGNAL)
        .map((n) => n.id),
    );
    expect(handledJoinIds.size).toBe(1); // old JOIN captured

    // 3. Stale JOIN is filtered
    expect(
      findNewJoinNote(net.getCommitted(hostWallet.id), handledJoinIds),
    ).toBeUndefined();

    // --- New joiner joins ---

    // 4. Joiner sends JOIN
    await joinerWallet.send(hostWallet.id, JOIN_SIGNAL);

    // 5. Host detects new JOIN
    const joinNote = findNewJoinNote(
      net.getCommitted(hostWallet.id),
      handledJoinIds,
    );
    expect(joinNote).toBeDefined();
    expect(joinNote!.sender).toBe(joinerWallet.id);
    handledJoinIds.add(joinNote!.id);

    // 6. Host sends ACCEPT (no concurrent tx, should succeed)
    await expect(
      hostWallet.send(joinerWallet.id, ACCEPT_SIGNAL),
    ).resolves.toBeDefined();

    // 7. Joiner detects ACCEPT
    const acceptHandled = new Set<string>();
    const acceptNote = findNewAcceptNote(
      net.getCommitted(joinerWallet.id),
      hostWallet.id,
      acceptHandled,
    );
    expect(acceptNote).toBeDefined();
  });

  it("first game (no LEAVE needed): JOIN → ACCEPT works immediately", async () => {
    const net = new NoteNetwork();
    const hostWallet = new SequentialWallet(net, "host-wallet");
    const joinerWallet = new SequentialWallet(net, "joiner-wallet");

    // No previous game — no LEAVE needed, no stale notes
    const handledJoinIds = new Set<string>();

    // Joiner sends JOIN
    await joinerWallet.send(hostWallet.id, JOIN_SIGNAL);

    // Host detects JOIN
    const joinNote = findNewJoinNote(
      net.getCommitted(hostWallet.id),
      handledJoinIds,
    );
    expect(joinNote).toBeDefined();
    handledJoinIds.add(joinNote!.id);

    // Host sends ACCEPT (no prior tx in flight)
    await expect(
      hostWallet.send(joinerWallet.id, ACCEPT_SIGNAL),
    ).resolves.toBeDefined();

    // Joiner detects ACCEPT
    const acceptNote = findNewAcceptNote(
      net.getCommitted(joinerWallet.id),
      hostWallet.id,
      new Set(),
    );
    expect(acceptNote).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: full game flow simulation
// ---------------------------------------------------------------------------

describe("full game flow", () => {
  it("matchmaking → draft → battle round (end-to-end)", async () => {
    const net = new NoteNetwork();
    const host = "host-wallet";
    const joiner = "joiner-wallet";

    // --- MATCHMAKING ---

    // Joiner sends JOIN
    net.send(joiner, host, JOIN_SIGNAL);

    // Host detects JOIN
    const joinHandled = new Set<string>();
    const joinNote = findNewJoinNote(net.getCommitted(host), joinHandled);
    expect(joinNote).toBeDefined();
    joinHandled.add(joinNote!.id);

    // Host sends ACCEPT
    net.send(host, joiner, ACCEPT_SIGNAL);

    // Joiner detects ACCEPT
    const acceptHandled = new Set<string>();
    const acceptNote = findNewAcceptNote(
      net.getCommitted(joiner),
      host,
      acceptHandled,
    );
    expect(acceptNote).toBeDefined();

    // --- DRAFT ---

    // Snapshot stale notes for draft
    const hostDraftHandled = new Set(
      net.getCommitted(host).map((n) => n.id),
    );
    const joinerDraftHandled = new Set(
      net.getCommitted(joiner).map((n) => n.id),
    );

    // Snake draft: A-B-B-A-A-B (6 picks, 3 each)
    const draftOrder = ["host", "joiner", "joiner", "host", "host", "joiner"];
    const picks = [0, 3, 7, 2, 5, 9];
    const hostTeam: number[] = [];
    const joinerTeam: number[] = [];

    for (let i = 0; i < 6; i++) {
      const picker = draftOrder[i];
      const champId = picks[i];
      const amount = encodeDraftPick(champId);

      if (picker === "host") {
        net.send(host, joiner, amount);
        hostTeam.push(champId);

        // Joiner detects pick
        const pick = findNewDraftPick(
          net.getCommitted(joiner),
          joinerDraftHandled,
        );
        expect(pick).toBeDefined();
        joinerDraftHandled.add(pick!.id);
        expect(decodeDraftPick(pick!.amount)).toBe(champId);
      } else {
        net.send(joiner, host, amount);
        joinerTeam.push(champId);

        // Host detects pick
        const pick = findNewDraftPick(
          net.getCommitted(host),
          hostDraftHandled,
        );
        expect(pick).toBeDefined();
        hostDraftHandled.add(pick!.id);
        expect(decodeDraftPick(pick!.amount)).toBe(champId);
      }
    }

    expect(hostTeam).toEqual([0, 2, 5]);
    expect(joinerTeam).toEqual([3, 7, 9]);

    // --- BATTLE (1 round) ---

    // Snapshot stale notes for battle
    const hostBattleHandled = new Set(
      net.getCommitted(host).map((n) => n.id),
    );
    const joinerBattleHandled = new Set(
      net.getCommitted(joiner).map((n) => n.id),
    );

    // Host commits move 3 (champion 1, ability 0)
    const hostCommit = await createCommitment(3);
    net.send(host, joiner, hostCommit.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(host, joiner, hostCommit.part2 + COMMIT_AMOUNT_OFFSET);

    // Joiner commits move 14 (champion 6, ability 1)
    const joinerCommit = await createCommitment(14);
    net.send(joiner, host, joinerCommit.part1 + COMMIT_AMOUNT_OFFSET);
    net.send(joiner, host, joinerCommit.part2 + COMMIT_AMOUNT_OFFSET);

    // Both detect opponent's commit
    const hostSeesCommit = findCommitNotes(
      net.getCommitted(host),
      hostBattleHandled,
    );
    const joinerSeesCommit = findCommitNotes(
      net.getCommitted(joiner),
      joinerBattleHandled,
    );
    expect(hostSeesCommit.length).toBe(2);
    expect(joinerSeesCommit.length).toBe(2);

    hostSeesCommit.forEach((n) => hostBattleHandled.add(n.id));
    joinerSeesCommit.forEach((n) => joinerBattleHandled.add(n.id));

    // Both reveal
    const hostReveal = createReveal(hostCommit.move, hostCommit.nonce);
    net.send(host, joiner, BigInt(hostReveal.move));
    net.send(host, joiner, hostReveal.noncePart1);
    net.send(host, joiner, hostReveal.noncePart2);

    const joinerReveal = createReveal(joinerCommit.move, joinerCommit.nonce);
    net.send(joiner, host, BigInt(joinerReveal.move));
    net.send(joiner, host, joinerReveal.noncePart1);
    net.send(joiner, host, joinerReveal.noncePart2);

    // Both detect and verify opponent's reveal
    const hostSeesReveal = findRevealNotes(
      net.getCommitted(host),
      hostBattleHandled,
    );
    const joinerSeesReveal = findRevealNotes(
      net.getCommitted(joiner),
      joinerBattleHandled,
    );
    expect(hostSeesReveal).not.toBeNull();
    expect(joinerSeesReveal).not.toBeNull();

    // Host verifies joiner's reveal
    const joinerCommitRaw1 =
      hostSeesCommit[0].amount - COMMIT_AMOUNT_OFFSET;
    const joinerCommitRaw2 =
      hostSeesCommit[1].amount - COMMIT_AMOUNT_OFFSET;
    const validJoiner = await verifyReveal(
      Number(hostSeesReveal!.moveNote.amount),
      hostSeesReveal!.nonceNotes[0].amount,
      hostSeesReveal!.nonceNotes[1].amount,
      joinerCommitRaw1,
      joinerCommitRaw2,
    );
    expect(validJoiner).toBe(true);
    expect(Number(hostSeesReveal!.moveNote.amount)).toBe(14);

    // Joiner verifies host's reveal
    const hostCommitRaw1 =
      joinerSeesCommit[0].amount - COMMIT_AMOUNT_OFFSET;
    const hostCommitRaw2 =
      joinerSeesCommit[1].amount - COMMIT_AMOUNT_OFFSET;
    const validHost = await verifyReveal(
      Number(joinerSeesReveal!.moveNote.amount),
      joinerSeesReveal!.nonceNotes[0].amount,
      joinerSeesReveal!.nonceNotes[1].amount,
      hostCommitRaw1,
      hostCommitRaw2,
    );
    expect(validHost).toBe(true);
    expect(Number(joinerSeesReveal!.moveNote.amount)).toBe(3);
  });
});
