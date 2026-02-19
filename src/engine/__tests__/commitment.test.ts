import { describe, it, expect } from "vitest";
import {
  createCommitment,
  createReveal,
  verifyReveal,
  COMMIT_AMOUNT_OFFSET,
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

  it("commit amounts with offset fit within wallet balance", async () => {
    // Wallet has ~15M tokens. Commit amounts must be well below that.
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);
      const sent1 = commit.part1 + COMMIT_AMOUNT_OFFSET;
      const sent2 = commit.part2 + COMMIT_AMOUNT_OFFSET;

      // Max: 65536 + 100000 = 165536
      expect(sent1).toBeLessThanOrEqual(165536n);
      expect(sent2).toBeLessThanOrEqual(165536n);
      expect(sent1).toBeGreaterThan(COMMIT_AMOUNT_OFFSET);
      expect(sent2).toBeGreaterThan(COMMIT_AMOUNT_OFFSET);
    }
  });
});

describe("reveal", () => {
  it("creates valid reveal from commitment", async () => {
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    expect(reveal.move).toBe(5);
    // Nonce parts: 16-bit value + 21 offset → [21, 65556]
    expect(reveal.noncePart1).toBeGreaterThanOrEqual(21n);
    expect(reveal.noncePart1).toBeLessThanOrEqual(65556n);
    expect(reveal.noncePart2).toBeGreaterThanOrEqual(21n);
    expect(reveal.noncePart2).toBeLessThanOrEqual(65556n);
  });

  it("move and nonce ranges do not overlap", async () => {
    const commit = await createCommitment(10);
    const reveal = createReveal(commit.move, commit.nonce);

    // Move: [1, 20], Nonce: [21, 65556] — no overlap
    expect(BigInt(reveal.move)).toBeLessThanOrEqual(20n);
    expect(reveal.noncePart1).toBeGreaterThanOrEqual(21n);
    expect(reveal.noncePart2).toBeGreaterThanOrEqual(21n);
  });

  it("reveal amounts do not overlap with commit amounts", async () => {
    const commit = await createCommitment(10);
    const reveal = createReveal(commit.move, commit.nonce);

    // Commit with offset: [100001, 165536]
    // Reveal move: [1, 20], Reveal nonce: [21, 65556]
    // Max reveal amount (65556) < COMMIT_AMOUNT_OFFSET (100000)
    expect(reveal.noncePart1).toBeLessThan(COMMIT_AMOUNT_OFFSET);
    expect(reveal.noncePart2).toBeLessThan(COMMIT_AMOUNT_OFFSET);
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
});
