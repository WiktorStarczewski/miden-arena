import { describe, it, expect } from "vitest";
import { createCommitment, createReveal, verifyReveal } from "../commitment";

describe("commitment", () => {
  it("creates valid commitment for all moves (1-20)", async () => {
    for (let move = 1; move <= 20; move++) {
      const commit = await createCommitment(move);

      expect(commit.move).toBe(move);
      expect(commit.nonce).toHaveLength(8);
      expect(commit.part1).toBeGreaterThan(0n);
      expect(commit.part2).toBeGreaterThan(0n);
      // 48-bit values + 1, so max is 2^48
      expect(commit.part1).toBeLessThanOrEqual((1n << 48n));
      expect(commit.part2).toBeLessThanOrEqual((1n << 48n));
    }
  });

  it("creates different commitments for same move (random nonce)", async () => {
    const commit1 = await createCommitment(1);
    const commit2 = await createCommitment(1);

    // Extremely unlikely to be equal with 64-bit random nonces
    expect(
      commit1.part1 !== commit2.part1 || commit1.part2 !== commit2.part2,
    ).toBe(true);
  });

  it("rejects invalid moves", async () => {
    await expect(createCommitment(0)).rejects.toThrow();
    await expect(createCommitment(21)).rejects.toThrow();
    await expect(createCommitment(-1)).rejects.toThrow();
  });
});

describe("reveal", () => {
  it("creates valid reveal from commitment", async () => {
    const commit = await createCommitment(5);
    const reveal = createReveal(commit.move, commit.nonce);

    expect(reveal.move).toBe(5);
    expect(reveal.noncePart1).toBeGreaterThan(0n);
    expect(reveal.noncePart2).toBeGreaterThan(0n);
    // 32-bit values + 1
    expect(reveal.noncePart1).toBeLessThanOrEqual((1n << 32n));
    expect(reveal.noncePart2).toBeLessThanOrEqual((1n << 32n));
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

    // Create reveal with different nonce
    const fakeNonce = new Uint8Array(8);
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
