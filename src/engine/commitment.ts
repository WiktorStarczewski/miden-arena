/**
 * commitment.ts — RPO256-based commit-reveal for combat moves.
 *
 * Replaces the previous SHA-256 scheme. The hash must match the arena
 * contract's verification: hash_elements(vec![encoded_move, nonce_p1, nonce_p2]).
 */

import { Rpo256, FeltArray, Felt } from "@miden-sdk/miden-sdk";
import { randomFelt } from "../utils/arenaNote";
import type { CommitData, RevealData } from "../types";

/**
 * Generate a cryptographic commitment for a move using RPO256.
 *
 * Returns the commitment data including the 4-Felt RPO hash word
 * that matches what the arena contract will verify.
 */
export function createCommitment(move: number): CommitData {
  if (move < 1 || move > 20) {
    throw new Error(`Move must be 1-20, got ${move}`);
  }

  const noncePart1 = randomFelt();
  const noncePart2 = randomFelt();

  // Must match contract: hash_elements(vec![encoded_move, nonce_p1, nonce_p2])
  const felts = new FeltArray([
    new Felt(BigInt(move)),
    new Felt(noncePart1),
    new Felt(noncePart2),
  ]);
  const digest = Rpo256.hashElements(felts);
  const u64s = digest.toU64s();
  const commitWord = [u64s[0], u64s[1], u64s[2], u64s[3]];

  return { move, noncePart1, noncePart2, commitWord };
}

/**
 * Create reveal data from a commitment.
 */
export function createReveal(commitData: CommitData): RevealData {
  return {
    move: commitData.move,
    noncePart1: commitData.noncePart1,
    noncePart2: commitData.noncePart2,
  };
}

/**
 * Debug-only: verify a reveal matches a commitment locally.
 * Not on the critical path — the arena contract handles authoritative verification.
 * Logs a warning on mismatch.
 */
export function debugVerifyReveal(
  move: number,
  noncePart1: bigint,
  noncePart2: bigint,
  commitWord: bigint[],
): boolean {
  try {
    const felts = new FeltArray([
      new Felt(BigInt(move)),
      new Felt(noncePart1),
      new Felt(noncePart2),
    ]);
    const digest = Rpo256.hashElements(felts);
    const u64s = digest.toU64s();
    const match =
      u64s[0] === commitWord[0] &&
      u64s[1] === commitWord[1] &&
      u64s[2] === commitWord[2] &&
      u64s[3] === commitWord[3];

    if (!match) {
      console.warn("[debugVerifyReveal] RPO hash mismatch", {
        move,
        noncePart1: noncePart1.toString(),
        noncePart2: noncePart2.toString(),
        expected: commitWord.map(String),
        computed: [u64s[0], u64s[1], u64s[2], u64s[3]].map(String),
      });
    }
    return match;
  } catch (err) {
    console.warn("[debugVerifyReveal] verification error", err);
    return false;
  }
}
