import { bytesToBigInt, bigIntToBytes, concatBytes } from "../utils/bytes";

/**
 * Offset added to commit note amounts so they occupy a distinct range
 * from reveal notes, making them distinguishable regardless of arrival order.
 *
 *   Commit notes:  [100_001, 165_536]  (hash chunk + 1 + offset)
 *   Reveal move:   [1, 20]
 *   Reveal nonce:  [21, 65_556]        (nonce chunk + 21)
 */
export const COMMIT_AMOUNT_OFFSET = 100_000n;

/**
 * Generate a cryptographic commitment for a move.
 *
 * Uses 16-bit hash chunks to keep note amounts within wallet balance.
 * The raw hash parts (part1/part2) are stored WITHOUT the offset;
 * the offset is added only when sending notes.
 */
export async function createCommitment(move: number): Promise<{
  move: number;
  nonce: Uint8Array;
  part1: bigint;
  part2: bigint;
}> {
  if (move < 1 || move > 20) {
    throw new Error(`Move must be 1-20, got ${move}`);
  }

  // Generate 32-bit random nonce (4 bytes)
  const nonce = crypto.getRandomValues(new Uint8Array(4));

  // Hash: SHA-256(move || nonce)
  const data = new Uint8Array([move, ...nonce]);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = new Uint8Array(hashBuffer);

  // Split first 32 bits into 2 × 16-bit values, add 1 to avoid 0 amounts
  // These are the RAW values — the caller adds COMMIT_AMOUNT_OFFSET when sending.
  const part1 = bytesToBigInt(hash.slice(0, 2)) + 1n; // max 65536
  const part2 = bytesToBigInt(hash.slice(2, 4)) + 1n; // max 65536

  return { move, nonce, part1, part2 };
}

/**
 * Create reveal data from a commitment.
 * Splits the 4-byte nonce into 2 × 2-byte (16-bit) values.
 * Nonce parts are offset by 21 to avoid overlapping with the move range [1, 20].
 */
export function createReveal(
  move: number,
  nonce: Uint8Array,
): { move: number; noncePart1: bigint; noncePart2: bigint } {
  const NONCE_OFFSET = 21n;
  const noncePart1 = bytesToBigInt(nonce.slice(0, 2)) + NONCE_OFFSET; // min 21, max 65556
  const noncePart2 = bytesToBigInt(nonce.slice(2, 4)) + NONCE_OFFSET; // min 21, max 65556
  return { move, noncePart1, noncePart2 };
}

/**
 * Verify that a reveal matches a commitment.
 * committedPart1/committedPart2 are the RAW hash values (offset already stripped).
 */
export async function verifyReveal(
  move: number,
  noncePart1: bigint,
  noncePart2: bigint,
  committedPart1: bigint,
  committedPart2: bigint,
): Promise<boolean> {
  const NONCE_OFFSET = 21n;

  // Note arrival order is non-deterministic, so try both nonce orderings.
  // For each nonce ordering, also try both commit part orderings.
  const nonceOrderings: [bigint, bigint][] = [
    [noncePart1, noncePart2],
    [noncePart2, noncePart1],
  ];

  for (const [np1, np2] of nonceOrderings) {
    const nonceBytes1 = bigIntToBytes(np1 - NONCE_OFFSET, 2);
    const nonceBytes2 = bigIntToBytes(np2 - NONCE_OFFSET, 2);
    const nonce = concatBytes(nonceBytes1, nonceBytes2);

    const data = new Uint8Array([move, ...nonce]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hash = new Uint8Array(hashBuffer);

    const ep1 = bytesToBigInt(hash.slice(0, 2)) + 1n;
    const ep2 = bytesToBigInt(hash.slice(2, 4)) + 1n;

    if (
      (ep1 === committedPart1 && ep2 === committedPart2) ||
      (ep1 === committedPart2 && ep2 === committedPart1)
    ) {
      return true;
    }
  }

  return false;
}
