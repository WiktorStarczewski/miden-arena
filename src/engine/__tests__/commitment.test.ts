import { describe, it, expect } from "vitest";
import {
  createCommitment,
  createReveal,
  verifyReveal,
} from "../commitment";

describe("commitment", () => {
  it("creates valid commitment for all moves (1-20)", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);

      expect(commit.move).toBe(move);
      expect(commit.nonce).toHaveLength(4); // 32-bit nonce
      expect(commit.part1).toBeGreaterThan(0n);
      expect(commit.part2).toBeGreaterThan(0n);
      // 16-bit values + 1, so max is 65536
      expect(commit.part1).toBeLessThanOrEqual(65536n);
      expect(commit.part2).toBeLessThanOrEqual(65536n);
    }
  });

  it("creates different commitments for same move (random nonce)", async () => {
    const commit1 = await createCommitment(1);
    const commit2 = await createCommitment(1);

    expect(
      commit1.part1 !== commit2.part1 || commit1.part2 !== commit2.part2,
    ).toBe(true);
  });

  it("rejects invalid moves", async () => {
    await expect(createCommitment(0)).rejects.toThrow();
    await expect(createCommitment(21)).rejects.toThrow();
    await expect(createCommitment(-1)).rejects.toThrow();
  });

  it("commit hash parts are raw 16-bit values (no offset)", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);
      // Raw values: [1, 65536]
      expect(commit.part1).toBeGreaterThanOrEqual(1n);
      expect(commit.part1).toBeLessThanOrEqual(65536n);
      expect(commit.part2).toBeGreaterThanOrEqual(1n);
      expect(commit.part2).toBeLessThanOrEqual(65536n);
    }
  });
});

describe("reveal", () => {
  it("creates valid reveal from commitment", async () => {
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    expect(reveal.move).toBe(5);
    // Raw nonce parts: 16-bit values [0, 65535]
    expect(reveal.noncePart1).toBeGreaterThanOrEqual(0n);
    expect(reveal.noncePart1).toBeLessThanOrEqual(65535n);
    expect(reveal.noncePart2).toBeGreaterThanOrEqual(0n);
    expect(reveal.noncePart2).toBeLessThanOrEqual(65535n);
  });

  it("nonce parts are raw 16-bit values (no offset)", async () => {
    const commit = await createCommitment(10);
    const reveal = createReveal(commit.move, commit.nonce);

    // Raw values, no +21 offset
    expect(reveal.noncePart1).toBeLessThanOrEqual(65535n);
    expect(reveal.noncePart2).toBeLessThanOrEqual(65535n);
  });

  it("handles zero nonce bytes correctly", () => {
    // Nonce with zero bytes — raw output should be 0n for the zero parts
    const zeroNonce = new Uint8Array([0, 0, 0, 0]);
    const reveal = createReveal(1, zeroNonce);

    expect(reveal.move).toBe(1);
    expect(reveal.noncePart1).toBe(0n);
    expect(reveal.noncePart2).toBe(0n);
  });

  it("produces deterministic output for known nonce", () => {
    // Nonce [0x01, 0x02, 0x03, 0x04]
    // part1 = bytesToBigInt([0x01, 0x02]) = 0x0102 = 258
    // part2 = bytesToBigInt([0x03, 0x04]) = 0x0304 = 772
    const nonce = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const reveal = createReveal(7, nonce);

    expect(reveal.move).toBe(7);
    expect(reveal.noncePart1).toBe(258n);
    expect(reveal.noncePart2).toBe(772n);
  });

  it("handles max 16-bit nonce bytes", () => {
    // Nonce [0xFF, 0xFF, 0xFF, 0xFF]
    // part1 = 65535, part2 = 65535
    const maxNonce = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const reveal = createReveal(1, maxNonce);

    expect(reveal.noncePart1).toBe(65535n);
    expect(reveal.noncePart2).toBe(65535n);
  });
});

describe("verifyReveal", () => {
  it("verifies correct reveal for all moves", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      const valid = await verifyReveal(
        reveal.move,
        reveal.noncePart1,
        reveal.noncePart2,
        commit.part1,
        commit.part2,
      );

      expect(valid).toBe(true);
    }
  });

  it("verifies with swapped commit parts (non-deterministic note order)", async () => {
    const commit = await createCommitment(7);
    const reveal = createReveal(commit.move, commit.nonce);

    const valid = await verifyReveal(
      reveal.move,
      reveal.noncePart1,
      reveal.noncePart2,
      commit.part2, // swapped
      commit.part1, // swapped
    );

    expect(valid).toBe(true);
  });

  it("verifies with swapped nonce parts (non-deterministic note order)", async () => {
    const commit = await createCommitment(3);
    const reveal = createReveal(commit.move, commit.nonce);

    const valid = await verifyReveal(
      reveal.move,
      reveal.noncePart2, // swapped
      reveal.noncePart1, // swapped
      commit.part1,
      commit.part2,
    );

    expect(valid).toBe(true);
  });

  it("verifies with both commit and nonce parts swapped", async () => {
    const commit = await createCommitment(12);
    const reveal = createReveal(commit.move, commit.nonce);

    const valid = await verifyReveal(
      reveal.move,
      reveal.noncePart2, // swapped
      reveal.noncePart1, // swapped
      commit.part2, // swapped
      commit.part1, // swapped
    );

    expect(valid).toBe(true);
  });

  it("rejects wrong move", async () => {
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    const valid = await verifyReveal(
      6, // wrong move
      reveal.noncePart1,
      reveal.noncePart2,
      commit.part1,
      commit.part2,
    );

    expect(valid).toBe(false);
  });

  it("rejects wrong nonce", async () => {
    const commit = await createCommitment(5);

    const fakeNonce = new Uint8Array(4);
    fakeNonce.fill(99);
    const fakeReveal = createReveal(5, fakeNonce);

    const valid = await verifyReveal(
      fakeReveal.move,
      fakeReveal.noncePart1,
      fakeReveal.noncePart2,
      commit.part1,
      commit.part2,
    );

    expect(valid).toBe(false);
  });

  it("rejects mismatched commit parts", async () => {
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    const valid = await verifyReveal(
      reveal.move,
      reveal.noncePart1,
      reveal.noncePart2,
      commit.part1 + 1n, // tampered
      commit.part2,
    );

    expect(valid).toBe(false);
  });

  it("roundtrip with 1000 random commitments", async () => {
    const commitments = await Promise.all(
      Array.from({ length: 1000 }, (_, i) => createCommitment((i % 20) + 1)),
    );

    for (const commit of commitments) {
      const reveal = createReveal(commit.move, commit.nonce);
      const valid = await verifyReveal(
        reveal.move,
        reveal.noncePart1,
        reveal.noncePart2,
        commit.part1,
        commit.part2,
      );
      expect(valid).toBe(true);
    }
  });

  it("no collisions in commitment parts across samples", async () => {
    const commitments = await Promise.all(
      Array.from({ length: 500 }, () => createCommitment(1)),
    );

    const seen = new Set<string>();
    for (const c of commitments) {
      const key = `${c.part1}-${c.part2}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("handles zero nonce parts in verification", async () => {
    // Construct a known nonce that produces 0 for part1
    const zeroNonce = new Uint8Array([0, 0, 0xAB, 0xCD]);
    const move = 5;

    // Create commitment manually to control the nonce
    const data = new Uint8Array([move, ...zeroNonce]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hash = new Uint8Array(hashBuffer);

    const { bytesToBigInt } = await import("../../utils/bytes");
    const commitPart1 = bytesToBigInt(hash.slice(0, 2)) + 1n;
    const commitPart2 = bytesToBigInt(hash.slice(2, 4)) + 1n;

    // Reveal with zero nonce — part1 will be 0n (raw)
    const reveal = createReveal(move, zeroNonce);
    expect(reveal.noncePart1).toBe(0n); // first 2 bytes are zero

    const valid = await verifyReveal(
      reveal.move,
      reveal.noncePart1,
      reveal.noncePart2,
      commitPart1,
      commitPart2,
    );

    expect(valid).toBe(true);
  });

  it("attachment-format roundtrip: data survives felt array encoding", async () => {
    // Simulate the exact FeltArray layout used in useCommitReveal
    const MSG_TYPE_COMMIT = 1n;
    const MSG_TYPE_REVEAL = 2n;

    const commit = await createCommitment(13);
    const reveal = createReveal(commit.move, commit.nonce);

    // Commit attachment: [MSG_TYPE_COMMIT, part1, part2]
    const commitAttachment = [MSG_TYPE_COMMIT, commit.part1, commit.part2];
    expect(commitAttachment).toHaveLength(3);
    expect(commitAttachment[0]).toBe(MSG_TYPE_COMMIT);
    expect(commitAttachment[1]).toBe(commit.part1);
    expect(commitAttachment[2]).toBe(commit.part2);

    // Reveal attachment: [MSG_TYPE_REVEAL, move, noncePart1, noncePart2]
    const revealAttachment = [
      MSG_TYPE_REVEAL,
      BigInt(reveal.move),
      reveal.noncePart1,
      reveal.noncePart2,
    ];
    expect(revealAttachment).toHaveLength(4);
    expect(revealAttachment[0]).toBe(MSG_TYPE_REVEAL);
    expect(Number(revealAttachment[1])).toBe(13);

    // Verify using values extracted from attachment format
    const valid = await verifyReveal(
      Number(revealAttachment[1]),
      revealAttachment[2],
      revealAttachment[3],
      commitAttachment[1],
      commitAttachment[2],
    );
    expect(valid).toBe(true);
  });

  it("all values fit within Miden Felt range (< 2^63)", async () => {
    // Miden Felt is a 64-bit prime field element, values must be < 2^63
    const FELT_MAX = (1n << 63n) - 1n;

    for (let i = 0; i < 100; i++) {
      const move = (i % 20) + 1;
      const commit = await createCommitment(move);
      const reveal = createReveal(commit.move, commit.nonce);

      // All values in commit attachment must fit in a Felt
      expect(commit.part1).toBeLessThan(FELT_MAX);
      expect(commit.part2).toBeLessThan(FELT_MAX);

      // All values in reveal attachment must fit in a Felt
      expect(BigInt(reveal.move)).toBeLessThan(FELT_MAX);
      expect(reveal.noncePart1).toBeLessThan(FELT_MAX);
      expect(reveal.noncePart2).toBeLessThan(FELT_MAX);
    }
  });
});
