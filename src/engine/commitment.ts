import { bytesToBigInt, bigIntToBytes, concatBytes } from "../utils/bytes";

/**
 * Generate a cryptographic commitment for a move.
 *
 * Uses 16-bit hash chunks. The raw hash parts (part1/part2) are carried
 * in a NoteAttachment — no amount-based encoding or offsets needed.
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

  // Split first 32 bits into 2 × 16-bit values, add 1 to avoid 0 values
  const part1 = bytesToBigInt(hash.slice(0, 2)) + 1n; // max 65536
  const part2 = bytesToBigInt(hash.slice(2, 4)) + 1n; // max 65536

  return { move, nonce, part1, part2 };
}

/**
 * Create reveal data from a commitment.
 * Splits the 4-byte nonce into 2 × 2-byte (16-bit) raw values.
 * No offset is applied — data is carried in a NoteAttachment.
 */
export function createReveal(
  move: number,
  nonce: Uint8Array,
): { move: number; noncePart1: bigint; noncePart2: bigint } {
  const noncePart1 = bytesToBigInt(nonce.slice(0, 2));
  const noncePart2 = bytesToBigInt(nonce.slice(2, 4));
  return { move, noncePart1, noncePart2 };
}

/**
 * Verify that a reveal matches a commitment.
 * All values are raw (no offsets).
 */
export async function verifyReveal(
  move: number,
  noncePart1: bigint,
  noncePart2: bigint,
  committedPart1: bigint,
  committedPart2: bigint,
): Promise<boolean> {
  // Note arrival order is non-deterministic, so try both nonce orderings.
  // For each nonce ordering, also try both commit part orderings.
  const nonceOrderings: [bigint, bigint][] = [
    [noncePart1, noncePart2],
    [noncePart2, noncePart1],
  ];

  for (const [np1, np2] of nonceOrderings) {
    const nonceBytes1 = bigIntToBytes(np1, 2);
    const nonceBytes2 = bigIntToBytes(np2, 2);
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
