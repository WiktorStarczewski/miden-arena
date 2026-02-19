import { bytesToBigInt, bigIntToBytes, concatBytes } from "../utils/bytes";

/**
 * Generate a cryptographic commitment for a move.
 * Returns the commit data including nonce and hash parts.
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

  // Generate 64-bit random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(8));

  // Hash: SHA-256(move || nonce)
  const data = new Uint8Array([move, ...nonce]);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = new Uint8Array(hashBuffer);

  // Split first 96 bits into 2 × 48-bit values, add 1 to avoid 0 amounts
  const part1 = bytesToBigInt(hash.slice(0, 6)) + 1n;
  const part2 = bytesToBigInt(hash.slice(6, 12)) + 1n;

  return { move, nonce, part1, part2 };
}

/**
 * Create reveal data from a commitment.
 * Splits the 8-byte nonce into 2 × 4-byte (32-bit) values.
 */
export function createReveal(
  move: number,
  nonce: Uint8Array,
): { move: number; noncePart1: bigint; noncePart2: bigint } {
  const noncePart1 = bytesToBigInt(nonce.slice(0, 4)) + 1n;
  const noncePart2 = bytesToBigInt(nonce.slice(4, 8)) + 1n;
  return { move, noncePart1, noncePart2 };
}

/**
 * Verify that a reveal matches a commitment.
 * Returns true if the hash of (move || nonce) matches the committed hash parts.
 */
export async function verifyReveal(
  move: number,
  noncePart1: bigint,
  noncePart2: bigint,
  committedPart1: bigint,
  committedPart2: bigint,
): Promise<boolean> {
  // Reconstruct nonce from reveal parts
  const nonceBytes1 = bigIntToBytes(noncePart1 - 1n, 4);
  const nonceBytes2 = bigIntToBytes(noncePart2 - 1n, 4);
  const nonce = concatBytes(nonceBytes1, nonceBytes2);

  // Recompute hash
  const data = new Uint8Array([move, ...nonce]);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = new Uint8Array(hashBuffer);

  // Check against committed values
  const expectedPart1 = bytesToBigInt(hash.slice(0, 6)) + 1n;
  const expectedPart2 = bytesToBigInt(hash.slice(6, 12)) + 1n;

  return expectedPart1 === committedPart1 && expectedPart2 === committedPart2;
}
