import { describe, it, expect } from "vitest";
import { encodeMove, decodeMove, encodeDraftPick, decodeDraftPick } from "../codec";

describe("encodeMove / decodeMove", () => {
  it("roundtrips all valid moves", () => {
    for (let champId = 0; champId <= 7; champId++) {
      for (let abilityIdx = 0; abilityIdx <= 1; abilityIdx++) {
        const action = { championId: champId, abilityIndex: abilityIdx };
        const encoded = encodeMove(action);
        const decoded = decodeMove(encoded);

        expect(encoded).toBeGreaterThanOrEqual(1);
        expect(encoded).toBeLessThanOrEqual(16);
        expect(decoded.championId).toBe(champId);
        expect(decoded.abilityIndex).toBe(abilityIdx);
      }
    }
  });

  it("encode produces expected values", () => {
    // Champion 0, ability 0 → 0*2 + 0 + 1 = 1
    expect(encodeMove({ championId: 0, abilityIndex: 0 })).toBe(1);
    // Champion 0, ability 1 → 0*2 + 1 + 1 = 2
    expect(encodeMove({ championId: 0, abilityIndex: 1 })).toBe(2);
    // Champion 7, ability 1 → 7*2 + 1 + 1 = 16
    expect(encodeMove({ championId: 7, abilityIndex: 1 })).toBe(16);
  });

  it("decode rejects invalid amounts", () => {
    expect(() => decodeMove(0)).toThrow();
    expect(() => decodeMove(17)).toThrow();
    expect(() => decodeMove(-1)).toThrow();
  });
});

describe("encodeDraftPick / decodeDraftPick", () => {
  it("roundtrips all champion IDs", () => {
    for (let id = 0; id <= 7; id++) {
      const encoded = encodeDraftPick(id);
      const decoded = decodeDraftPick(encoded);
      expect(encoded).toBe(BigInt(id + 1));
      expect(decoded).toBe(id);
    }
  });

  it("rejects invalid IDs", () => {
    expect(() => encodeDraftPick(-1)).toThrow();
    expect(() => encodeDraftPick(8)).toThrow();
  });

  it("rejects invalid amounts", () => {
    expect(() => decodeDraftPick(0n)).toThrow();
    expect(() => decodeDraftPick(9n)).toThrow();
  });
});
