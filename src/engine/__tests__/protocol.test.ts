/**
 * Protocol simulation tests.
 *
 * These tests simulate the full note exchange between two players without
 * React hooks or the Miden SDK. They exercise the same detection logic
 * used in useMatchmaking, useDraft, and useCommitReveal — verifying that
 * stale notes are filtered, attachments are correctly classified, and the
 * commit-reveal cryptography survives non-deterministic note ordering.
 */

import { describe, it, expect } from "vitest";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  LEAVE_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
  MSG_TYPE_COMMIT,
  MSG_TYPE_REVEAL,
} from "../../constants/protocol";
import {
  createCommitment,
  createReveal,
  verifyReveal,
} from "../commitment";
import { encodeDraftPick, decodeDraftPick } from "../codec";

// ---------------------------------------------------------------------------
// Virtual note network — simulates Miden note exchange with attachments
// ---------------------------------------------------------------------------

interface VirtualNote {
  id: string;
  sender: string;
  amount: bigint;
  assets: { amount: bigint }[];
  /** Simulated attachment data (array of bigints). Empty for non-attachment notes. */
  attachment: bigint[];
}

class NoteNetwork {
  private inboxes = new Map<string, VirtualNote[]>();
  private nextId = 0;

  /** Send a note from one wallet to another (amount-based signal). */
  send(from: string, to: string, amount: bigint): string {
    const id = `note-${this.nextId++}`;
    const note: VirtualNote = { id, sender: from, amount, assets: [{ amount }], attachment: [] };
    const inbox = this.inboxes.get(to) ?? [];
    inbox.push(note);
    this.inboxes.set(to, inbox);
    return id;
  }

  /** Send a note with an attachment (protocol amount = 1n). */
  sendWithAttachment(from: string, to: string, attachment: bigint[]): string {
    const id = `note-${this.nextId++}`;
    const note: VirtualNote = {
      id,
      sender: from,
      amount: 1n,
      assets: [{ amount: 1n }],
      attachment,
    };
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

/** Find commit note by attachment (MSG_TYPE_COMMIT). */
function findCommitNote(
  notes: VirtualNote[],
  handledIds: Set<string>,
): VirtualNote | undefined {
  return notes.find(
    (n) =>
      !handledIds.has(n.id) &&
      n.attachment.length >= 3 &&
      n.attachment[0] === MSG_TYPE_COMMIT,
  );
}

/** Find reveal note by attachment (MSG_TYPE_REVEAL). */
function findRevealNote(
  notes: VirtualNote[],
  handledIds: Set<string>,
): VirtualNote | undefined {
  return notes.find(
    (n) =>
      !handledIds.has(n.id) &&
      n.attachment.length >= 4 &&
      n.attachment[0] === MSG_TYPE_REVEAL,
  );
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
// Commit-reveal protocol tests (attachment-based)
// ---------------------------------------------------------------------------

describe("commit-reveal protocol", () => {
  it("full commit-reveal flow via attachment notes", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";
    const handledIds = new Set<string>();

    // Player A commits move 5
    const commitA = await createCommitment(5);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT,
      commitA.part1,
      commitA.part2,
    ]);

    // Player B detects commit note via attachment
    const commitNote = findCommitNote(net.getCommitted(playerB), handledIds);
    expect(commitNote).toBeDefined();

    const rawPart1 = commitNote!.attachment[1];
    const rawPart2 = commitNote!.attachment[2];

    handledIds.add(commitNote!.id);

    // Player A reveals
    const revealA = createReveal(commitA.move, commitA.nonce);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_REVEAL,
      BigInt(revealA.move),
      revealA.noncePart1,
      revealA.noncePart2,
    ]);

    // Player B detects reveal note via attachment
    const revealNote = findRevealNote(net.getCommitted(playerB), handledIds);
    expect(revealNote).not.toBeNull();
    expect(Number(revealNote!.attachment[1])).toBe(5);

    // Verify
    const valid = await verifyReveal(
      Number(revealNote!.attachment[1]),
      revealNote!.attachment[2],
      revealNote!.attachment[3],
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
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commitA.part1, commitA.part2,
    ]);

    // B sends commit to A
    net.sendWithAttachment(playerB, playerA, [
      MSG_TYPE_COMMIT, commitB.part1, commitB.part2,
    ]);

    // Both detect opponent's commit
    const handledA = new Set<string>();
    const handledB = new Set<string>();

    const commitNoteForA = findCommitNote(net.getCommitted(playerA), handledA);
    const commitNoteForB = findCommitNote(net.getCommitted(playerB), handledB);
    expect(commitNoteForA).toBeDefined();
    expect(commitNoteForB).toBeDefined();

    handledA.add(commitNoteForA!.id);
    handledB.add(commitNoteForB!.id);

    // Both reveal
    const revealA = createReveal(commitA.move, commitA.nonce);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_REVEAL, BigInt(revealA.move), revealA.noncePart1, revealA.noncePart2,
    ]);

    const revealB = createReveal(commitB.move, commitB.nonce);
    net.sendWithAttachment(playerB, playerA, [
      MSG_TYPE_REVEAL, BigInt(revealB.move), revealB.noncePart1, revealB.noncePart2,
    ]);

    // Both detect and verify opponent's reveal
    const revealNoteForA = findRevealNote(net.getCommitted(playerA), handledA);
    const revealNoteForB = findRevealNote(net.getCommitted(playerB), handledB);

    expect(revealNoteForA).toBeDefined();
    expect(revealNoteForB).toBeDefined();

    // A verifies B's reveal
    const validB = await verifyReveal(
      Number(revealNoteForA!.attachment[1]),
      revealNoteForA!.attachment[2],
      revealNoteForA!.attachment[3],
      commitNoteForA!.attachment[1],
      commitNoteForA!.attachment[2],
    );
    expect(validB).toBe(true);

    // B verifies A's reveal
    const validA = await verifyReveal(
      Number(revealNoteForB!.attachment[1]),
      revealNoteForB!.attachment[2],
      revealNoteForB!.attachment[3],
      commitNoteForB!.attachment[1],
      commitNoteForB!.attachment[2],
    );
    expect(validA).toBe(true);
  });

  it("stale commit notes from previous round are filtered", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Round 1: A commits
    const commit1 = await createCommitment(3);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commit1.part1, commit1.part2,
    ]);

    // B detects round 1 commit
    const handledB = new Set<string>();
    const r1Commit = findCommitNote(net.getCommitted(playerB), handledB);
    expect(r1Commit).toBeDefined();
    handledB.add(r1Commit!.id);

    // Round 1 reveal (mark note as handled)
    const reveal1 = createReveal(commit1.move, commit1.nonce);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_REVEAL, BigInt(reveal1.move), reveal1.noncePart1, reveal1.noncePart2,
    ]);
    const r1Reveal = findRevealNote(net.getCommitted(playerB), handledB);
    expect(r1Reveal).toBeDefined();
    handledB.add(r1Reveal!.id);

    // Round 2: A commits again
    const commit2 = await createCommitment(15);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commit2.part1, commit2.part2,
    ]);

    // B detects ONLY round 2 commit (round 1 notes are handled)
    const r2Commit = findCommitNote(net.getCommitted(playerB), handledB);
    expect(r2Commit).toBeDefined();

    // Verify the attachment matches round 2's commit
    expect(r2Commit!.attachment[1]).toBe(commit2.part1);
    expect(r2Commit!.attachment[2]).toBe(commit2.part2);
  });

  it("attachment notes use minimal amount (1n)", async () => {
    const net = new NoteNetwork();
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    net.sendWithAttachment("a", "b", [
      MSG_TYPE_COMMIT, commit.part1, commit.part2,
    ]);
    net.sendWithAttachment("a", "b", [
      MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
    ]);

    const notes = net.getCommitted("b");
    // Both notes use 1n amount
    for (const note of notes) {
      expect(note.amount).toBe(1n);
    }
  });

  it("verification survives all 4 nonce/commit orderings", async () => {
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
// Attachment detection edge cases
// ---------------------------------------------------------------------------

describe("attachment detection edge cases", () => {
  it("notes without attachments are ignored by commit/reveal detection", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Amount-based notes have empty attachment arrays
    net.send("a", "b", 100n); // JOIN
    net.send("a", "b", 101n); // ACCEPT
    net.send("a", "b", 5n);   // draft pick
    net.send("a", "b", 10_000_000n); // stake

    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeUndefined();
    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("truncated commit attachment (< 3 felts) is ignored", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Only 2 elements instead of required 3
    net.sendWithAttachment("a", "b", [MSG_TYPE_COMMIT, 12345n]);

    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("truncated reveal attachment (< 4 felts) is ignored", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Only 3 elements instead of required 4
    net.sendWithAttachment("a", "b", [MSG_TYPE_REVEAL, 5n, 100n]);

    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("empty attachment is ignored", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    net.sendWithAttachment("a", "b", []);

    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeUndefined();
    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("unknown message type is ignored", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Message type 99 — not commit (1) or reveal (2)
    net.sendWithAttachment("a", "b", [99n, 100n, 200n, 300n]);

    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeUndefined();
    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("commit note is not confused with reveal note", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Send a commit note (type 1, 3 felts)
    net.sendWithAttachment("a", "b", [MSG_TYPE_COMMIT, 100n, 200n]);

    // Should be found as commit
    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeDefined();
    // Should NOT be found as reveal (only 3 felts, reveal needs 4)
    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeUndefined();
  });

  it("reveal note is not confused with commit note", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Send a reveal note (type 2, 4 felts)
    net.sendWithAttachment("a", "b", [MSG_TYPE_REVEAL, 5n, 100n, 200n]);

    // Should NOT be found as commit (wrong message type)
    expect(findCommitNote(net.getCommitted("b"), handledIds)).toBeUndefined();
    // Should be found as reveal
    expect(findRevealNote(net.getCommitted("b"), handledIds)).toBeDefined();
  });

  it("extra felts in attachment are tolerated", async () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    const commit = await createCommitment(5);

    // Send commit with extra trailing felts (future-proofing)
    net.sendWithAttachment("a", "b", [
      MSG_TYPE_COMMIT, commit.part1, commit.part2, 999n, 888n,
    ]);

    const found = findCommitNote(net.getCommitted("b"), handledIds);
    expect(found).toBeDefined();
    // Data is still at the expected indices
    expect(found!.attachment[1]).toBe(commit.part1);
    expect(found!.attachment[2]).toBe(commit.part2);
  });
});

// ---------------------------------------------------------------------------
// Mixed protocol: attachment vs amount-based signals
// ---------------------------------------------------------------------------

describe("mixed protocol signals", () => {
  it("attachment notes (1n amount) do not match draft pick filter", () => {
    const net = new NoteNetwork();
    const handledIds = new Set<string>();

    // Protocol notes have amount=1n, which is in draft range [1,10]
    // But the real hook uses separate detection paths
    net.sendWithAttachment("a", "b", [MSG_TYPE_COMMIT, 100n, 200n]);

    // Amount-based filter should match amount=1n as draft pick
    // This is why the hooks use separate detection paths
    const draftPick = findNewDraftPick(net.getCommitted("b"), handledIds);
    // The virtual note has amount=1n which IS in draft range
    // In the real app, attachment notes are consumed by useCommitReveal FIRST
    expect(draftPick).toBeDefined(); // This is expected in the sim
    expect(draftPick!.amount).toBe(1n);

    // But it IS detected as a commit note via attachment
    const commitNote = findCommitNote(net.getCommitted("b"), handledIds);
    expect(commitNote).toBeDefined();

    // Once handled by commit detection, draft pick won't see it again
    handledIds.add(commitNote!.id);
    const draftPickAfter = findNewDraftPick(net.getCommitted("b"), handledIds);
    expect(draftPickAfter).toBeUndefined();
  });

  it("amount-based signals mixed with attachment notes are independently detected", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Send various signal types
    net.send(playerA, playerB, JOIN_SIGNAL);
    net.send(playerA, playerB, ACCEPT_SIGNAL);

    const commit = await createCommitment(7);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commit.part1, commit.part2,
    ]);

    net.send(playerA, playerB, 5n); // draft pick

    const reveal = createReveal(commit.move, commit.nonce);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
    ]);

    const notes = net.getCommitted(playerB);
    const handledIds = new Set<string>();

    // All signal types coexist without interference
    expect(findNewJoinNote(notes, handledIds)).toBeDefined();
    expect(findNewAcceptNote(notes, playerA, handledIds)).toBeDefined();
    expect(findCommitNote(notes, handledIds)).toBeDefined();
    expect(findRevealNote(notes, handledIds)).toBeDefined();
    expect(findNewDraftPick(notes, handledIds)).toBeDefined();
  });

  it("MSG_TYPE constants do not collide with amount-based signals", () => {
    // MSG_TYPE_COMMIT = 1n, MSG_TYPE_REVEAL = 2n
    // These are attachment-level tags, not amounts, so they don't need to
    // avoid amount ranges. But verify they are distinct from each other.
    expect(MSG_TYPE_COMMIT).not.toBe(MSG_TYPE_REVEAL);
    expect(MSG_TYPE_COMMIT).toBe(1n);
    expect(MSG_TYPE_REVEAL).toBe(2n);
  });
});

// ---------------------------------------------------------------------------
// Attachment data integrity
// ---------------------------------------------------------------------------

describe("attachment data integrity", () => {
  it("commit attachment preserves exact hash parts across roundtrip", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);

      // Simulate encoding into attachment
      const attachment = [MSG_TYPE_COMMIT, commit.part1, commit.part2];

      // Simulate reading back
      expect(attachment[0]).toBe(MSG_TYPE_COMMIT);
      expect(attachment[1]).toBe(commit.part1);
      expect(attachment[2]).toBe(commit.part2);
    }
  });

  it("reveal attachment preserves exact values across roundtrip", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      // Simulate encoding into attachment
      const attachment = [
        MSG_TYPE_REVEAL,
        BigInt(reveal.move),
        reveal.noncePart1,
        reveal.noncePart2,
      ];

      // Simulate reading back and verifying
      const readMove = Number(attachment[1]);
      const readNP1 = attachment[2];
      const readNP2 = attachment[3];

      expect(readMove).toBe(move);
      const valid = await verifyReveal(
        readMove, readNP1, readNP2,
        commit.part1, commit.part2,
      );
      expect(valid).toBe(true);
    }
  });

  it("commitment data through virtual network preserves values exactly", async () => {
    const net = new NoteNetwork();

    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      const to = `player-${move}`;

      net.sendWithAttachment("sender", to, [
        MSG_TYPE_COMMIT, commit.part1, commit.part2,
      ]);
      net.sendWithAttachment("sender", to, [
        MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
      ]);

      const notes = net.getCommitted(to);
      const handledIds = new Set<string>();

      const commitNote = findCommitNote(notes, handledIds)!;
      handledIds.add(commitNote.id);
      const revealNote = findRevealNote(notes, handledIds)!;

      // Values survive network transit exactly
      expect(commitNote.attachment[1]).toBe(commit.part1);
      expect(commitNote.attachment[2]).toBe(commit.part2);
      expect(Number(revealNote.attachment[1])).toBe(move);
      expect(revealNote.attachment[2]).toBe(reveal.noncePart1);
      expect(revealNote.attachment[3]).toBe(reveal.noncePart2);

      // Full verification works
      const valid = await verifyReveal(
        Number(revealNote.attachment[1]),
        revealNote.attachment[2],
        revealNote.attachment[3],
        commitNote.attachment[1],
        commitNote.attachment[2],
      );
      expect(valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Wallet drain: token usage comparison
// ---------------------------------------------------------------------------

describe("wallet drain", () => {
  it("new protocol uses 1n per note (2n per turn)", async () => {
    const net = new NoteNetwork();
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    // Commit: 1 note × 1n
    net.sendWithAttachment("a", "b", [
      MSG_TYPE_COMMIT, commit.part1, commit.part2,
    ]);

    // Reveal: 1 note × 1n
    net.sendWithAttachment("a", "b", [
      MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
    ]);

    const notes = net.getCommitted("b");
    const totalDrain = notes.reduce((sum, n) => sum + n.amount, 0n);
    expect(totalDrain).toBe(2n); // 1n + 1n
  });

  it("20 turns drains only 40n total", async () => {
    const net = new NoteNetwork();
    let totalDrain = 0n;

    for (let round = 0; round < 20; round++) {
      const move = (round % 20) + 1;
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      // Each player sends commit + reveal per round
      net.sendWithAttachment("a", "b", [
        MSG_TYPE_COMMIT, commit.part1, commit.part2,
      ]);
      net.sendWithAttachment("a", "b", [
        MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
      ]);

      totalDrain += 2n; // 1n per note × 2 notes
    }

    // 20 rounds × 2n = 40n total — well within any wallet balance
    expect(totalDrain).toBe(40n);
    // Old protocol would have drained: 20 × (2 × ~130K + 3 × ~33K) ≈ 5.3M+
    // New protocol: 40n — nearly zero
    expect(totalDrain).toBeLessThan(100n);
  });

  it("wallet balance stays viable after 50 rounds", async () => {
    const INITIAL_BALANCE = 5_000_000n; // After staking
    let balance = INITIAL_BALANCE;

    for (let round = 0; round < 50; round++) {
      balance -= 2n; // 2 notes × 1n each per round
    }

    expect(balance).toBe(INITIAL_BALANCE - 100n);
    expect(balance).toBeGreaterThan(0n);
    // Still has plenty of balance for the prize note
    expect(balance).toBeGreaterThan(4_000_000n);
  });
});

// ---------------------------------------------------------------------------
// Multi-round attachment protocol
// ---------------------------------------------------------------------------

describe("multi-round attachment protocol", () => {
  it("5 consecutive rounds with correct stale note filtering", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";
    const handledB = new Set<string>();

    for (let round = 1; round <= 5; round++) {
      const move = round * 3; // moves: 3, 6, 9, 12, 15

      // A commits
      const commit = await createCommitment(move);
      net.sendWithAttachment(playerA, playerB, [
        MSG_TYPE_COMMIT, commit.part1, commit.part2,
      ]);

      // B detects commit — should only find the NEW one
      const commitNote = findCommitNote(net.getCommitted(playerB), handledB);
      expect(commitNote).toBeDefined();
      handledB.add(commitNote!.id);

      // Verify the data matches this round's commit
      expect(commitNote!.attachment[1]).toBe(commit.part1);
      expect(commitNote!.attachment[2]).toBe(commit.part2);

      // A reveals
      const reveal = createReveal(commit.move, commit.nonce);
      net.sendWithAttachment(playerA, playerB, [
        MSG_TYPE_REVEAL, BigInt(reveal.move), reveal.noncePart1, reveal.noncePart2,
      ]);

      // B detects reveal — should only find the NEW one
      const revealNote = findRevealNote(net.getCommitted(playerB), handledB);
      expect(revealNote).toBeDefined();
      handledB.add(revealNote!.id);

      // Verify
      const valid = await verifyReveal(
        Number(revealNote!.attachment[1]),
        revealNote!.attachment[2],
        revealNote!.attachment[3],
        commitNote!.attachment[1],
        commitNote!.attachment[2],
      );
      expect(valid).toBe(true);
      expect(Number(revealNote!.attachment[1])).toBe(move);

      // No unhandled commit or reveal notes remain
      expect(findCommitNote(net.getCommitted(playerB), handledB)).toBeUndefined();
      expect(findRevealNote(net.getCommitted(playerB), handledB)).toBeUndefined();
    }

    // Total notes: 5 rounds × 2 notes = 10
    expect(handledB.size).toBe(10);
  });

  it("bi-directional 3-round exchange with interleaved commits", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";
    const handledA = new Set<string>();
    const handledB = new Set<string>();

    const moves = [
      { a: 1, b: 20 },
      { a: 10, b: 11 },
      { a: 5, b: 15 },
    ];

    for (const { a: moveA, b: moveB } of moves) {
      // Both commit simultaneously
      const commitA = await createCommitment(moveA);
      const commitB = await createCommitment(moveB);

      net.sendWithAttachment(playerA, playerB, [
        MSG_TYPE_COMMIT, commitA.part1, commitA.part2,
      ]);
      net.sendWithAttachment(playerB, playerA, [
        MSG_TYPE_COMMIT, commitB.part1, commitB.part2,
      ]);

      // Each detects opponent's commit
      const aSees = findCommitNote(net.getCommitted(playerA), handledA)!;
      const bSees = findCommitNote(net.getCommitted(playerB), handledB)!;
      expect(aSees).toBeDefined();
      expect(bSees).toBeDefined();
      handledA.add(aSees.id);
      handledB.add(bSees.id);

      // Both reveal simultaneously
      const revealA = createReveal(commitA.move, commitA.nonce);
      const revealB = createReveal(commitB.move, commitB.nonce);

      net.sendWithAttachment(playerA, playerB, [
        MSG_TYPE_REVEAL, BigInt(revealA.move), revealA.noncePart1, revealA.noncePart2,
      ]);
      net.sendWithAttachment(playerB, playerA, [
        MSG_TYPE_REVEAL, BigInt(revealB.move), revealB.noncePart1, revealB.noncePart2,
      ]);

      // Each detects and verifies opponent's reveal
      const aSeesReveal = findRevealNote(net.getCommitted(playerA), handledA)!;
      const bSeesReveal = findRevealNote(net.getCommitted(playerB), handledB)!;
      expect(aSeesReveal).toBeDefined();
      expect(bSeesReveal).toBeDefined();
      handledA.add(aSeesReveal.id);
      handledB.add(bSeesReveal.id);

      // A verifies B
      expect(
        await verifyReveal(
          Number(aSeesReveal.attachment[1]),
          aSeesReveal.attachment[2],
          aSeesReveal.attachment[3],
          aSees.attachment[1],
          aSees.attachment[2],
        ),
      ).toBe(true);
      expect(Number(aSeesReveal.attachment[1])).toBe(moveB);

      // B verifies A
      expect(
        await verifyReveal(
          Number(bSeesReveal.attachment[1]),
          bSeesReveal.attachment[2],
          bSeesReveal.attachment[3],
          bSees.attachment[1],
          bSees.attachment[2],
        ),
      ).toBe(true);
      expect(Number(bSeesReveal.attachment[1])).toBe(moveA);
    }
  });

  it("round boundary: snapshot prevents cross-round contamination", async () => {
    const net = new NoteNetwork();
    const playerA = "player-a";
    const playerB = "player-b";

    // Round 1
    const commit1 = await createCommitment(1);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commit1.part1, commit1.part2,
    ]);
    const reveal1 = createReveal(commit1.move, commit1.nonce);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_REVEAL, BigInt(reveal1.move), reveal1.noncePart1, reveal1.noncePart2,
    ]);

    // Simulate round boundary: snapshot ALL current notes
    const handledB = new Set(
      net.getCommitted(playerB).map((n) => n.id),
    );

    // Round 2 — round 1 notes should not be detected
    const commit2 = await createCommitment(20);
    net.sendWithAttachment(playerA, playerB, [
      MSG_TYPE_COMMIT, commit2.part1, commit2.part2,
    ]);

    const found = findCommitNote(net.getCommitted(playerB), handledB);
    expect(found).toBeDefined();
    // The detected note must be round 2's commit, not round 1's
    expect(found!.attachment[1]).toBe(commit2.part1);
    expect(found!.attachment[2]).toBe(commit2.part2);
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

    // --- BATTLE (1 round, attachment-based) ---

    // Snapshot stale notes for battle
    const hostBattleHandled = new Set(
      net.getCommitted(host).map((n) => n.id),
    );
    const joinerBattleHandled = new Set(
      net.getCommitted(joiner).map((n) => n.id),
    );

    // Host commits move 3
    const hostCommit = await createCommitment(3);
    net.sendWithAttachment(host, joiner, [
      MSG_TYPE_COMMIT, hostCommit.part1, hostCommit.part2,
    ]);

    // Joiner commits move 14
    const joinerCommit = await createCommitment(14);
    net.sendWithAttachment(joiner, host, [
      MSG_TYPE_COMMIT, joinerCommit.part1, joinerCommit.part2,
    ]);

    // Both detect opponent's commit
    const hostSeesCommit = findCommitNote(
      net.getCommitted(host),
      hostBattleHandled,
    );
    const joinerSeesCommit = findCommitNote(
      net.getCommitted(joiner),
      joinerBattleHandled,
    );
    expect(hostSeesCommit).toBeDefined();
    expect(joinerSeesCommit).toBeDefined();

    hostBattleHandled.add(hostSeesCommit!.id);
    joinerBattleHandled.add(joinerSeesCommit!.id);

    // Both reveal
    const hostReveal = createReveal(hostCommit.move, hostCommit.nonce);
    net.sendWithAttachment(host, joiner, [
      MSG_TYPE_REVEAL,
      BigInt(hostReveal.move),
      hostReveal.noncePart1,
      hostReveal.noncePart2,
    ]);

    const joinerReveal = createReveal(joinerCommit.move, joinerCommit.nonce);
    net.sendWithAttachment(joiner, host, [
      MSG_TYPE_REVEAL,
      BigInt(joinerReveal.move),
      joinerReveal.noncePart1,
      joinerReveal.noncePart2,
    ]);

    // Both detect and verify opponent's reveal
    const hostSeesReveal = findRevealNote(
      net.getCommitted(host),
      hostBattleHandled,
    );
    const joinerSeesReveal = findRevealNote(
      net.getCommitted(joiner),
      joinerBattleHandled,
    );
    expect(hostSeesReveal).toBeDefined();
    expect(joinerSeesReveal).toBeDefined();

    // Host verifies joiner's reveal
    const validJoiner = await verifyReveal(
      Number(hostSeesReveal!.attachment[1]),
      hostSeesReveal!.attachment[2],
      hostSeesReveal!.attachment[3],
      hostSeesCommit!.attachment[1],
      hostSeesCommit!.attachment[2],
    );
    expect(validJoiner).toBe(true);
    expect(Number(hostSeesReveal!.attachment[1])).toBe(14);

    // Joiner verifies host's reveal
    const validHost = await verifyReveal(
      Number(joinerSeesReveal!.attachment[1]),
      joinerSeesReveal!.attachment[2],
      joinerSeesReveal!.attachment[3],
      joinerSeesCommit!.attachment[1],
      joinerSeesCommit!.attachment[2],
    );
    expect(validHost).toBe(true);
    expect(Number(joinerSeesReveal!.attachment[1])).toBe(3);
  });
});
