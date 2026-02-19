import { describe, it, expect } from "vitest";
import { getInitialPool, getCurrentPicker, isDraftComplete, removeFromPool, isValidPick } from "../draft";

describe("getInitialPool", () => {
  it("returns all 10 champion IDs", () => {
    const pool = getInitialPool();
    expect(pool).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pool).toHaveLength(10);
  });
});

describe("getCurrentPicker", () => {
  it("follows snake draft order A-B-B-A-A-B for host", () => {
    const expected = ["me", "opponent", "opponent", "me", "me", "opponent"];
    for (let i = 0; i < 6; i++) {
      expect(getCurrentPicker(i, "host")).toBe(expected[i]);
    }
  });

  it("follows snake draft order for joiner (inverse)", () => {
    const expected = ["opponent", "me", "me", "opponent", "opponent", "me"];
    for (let i = 0; i < 6; i++) {
      expect(getCurrentPicker(i, "joiner")).toBe(expected[i]);
    }
  });

  it("throws for invalid pick number", () => {
    expect(() => getCurrentPicker(6, "host")).toThrow();
    expect(() => getCurrentPicker(-1, "host")).toThrow();
  });
});

describe("isDraftComplete", () => {
  it("returns true when both teams have 3", () => {
    expect(isDraftComplete([0, 1, 2], [3, 4, 5])).toBe(true);
  });

  it("returns false when incomplete", () => {
    expect(isDraftComplete([0, 1], [3, 4, 5])).toBe(false);
    expect(isDraftComplete([0, 1, 2], [3, 4])).toBe(false);
    expect(isDraftComplete([], [])).toBe(false);
  });
});

describe("removeFromPool", () => {
  it("removes a champion", () => {
    const pool = [0, 1, 2, 3, 4];
    expect(removeFromPool(pool, 2)).toEqual([0, 1, 3, 4]);
  });

  it("returns unchanged if ID not in pool", () => {
    const pool = [0, 1, 2];
    expect(removeFromPool(pool, 5)).toEqual([0, 1, 2]);
  });
});

describe("isValidPick", () => {
  it("returns true for available champion", () => {
    expect(isValidPick([0, 1, 2, 3], 2)).toBe(true);
  });

  it("returns false for unavailable champion", () => {
    expect(isValidPick([0, 1, 3], 2)).toBe(false);
  });
});
