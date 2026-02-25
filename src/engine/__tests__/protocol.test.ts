/**
 * Protocol simulation tests.
 *
 * These tests simulate P2P note exchange between two players without
 * React hooks or the Miden SDK. They exercise the detection logic used
 * in useMatchmaking and useDraft — verifying that stale notes are
 * filtered and signals are correctly classified.
 *
 * Commit-reveal and staking are now handled via arena contract notes
 * (not P2P), so those tests live in the integration test suite.
 */

import { describe, it, expect } from "vitest";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  LEAVE_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
} from "../../constants/protocol";
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

  /** Send a note from one wallet to another (amount-based signal). */
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
  it("draft pick amounts are in expected range [1, 8]", () => {
    for (let id = 0; id <= 7; id++) {
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
