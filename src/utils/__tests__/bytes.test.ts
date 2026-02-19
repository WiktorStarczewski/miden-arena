import { describe, it, expect } from "vitest";
import { bytesToBigInt, bigIntToBytes, concatBytes } from "../bytes";

describe("bytesToBigInt", () => {
  it("converts single byte", () => {
    expect(bytesToBigInt(new Uint8Array([255]))).toBe(255n);
    expect(bytesToBigInt(new Uint8Array([0]))).toBe(0n);
    expect(bytesToBigInt(new Uint8Array([1]))).toBe(1n);
  });

  it("converts multi-byte (big-endian)", () => {
    expect(bytesToBigInt(new Uint8Array([1, 0]))).toBe(256n);
    expect(bytesToBigInt(new Uint8Array([0xff, 0xff]))).toBe(65535n);
    expect(bytesToBigInt(new Uint8Array([1, 0, 0, 0]))).toBe(16777216n);
  });

  it("handles 6-byte (48-bit) values", () => {
    const max48 = (1n << 48n) - 1n;
    expect(bytesToBigInt(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))).toBe(max48);
  });

  it("handles empty array", () => {
    expect(bytesToBigInt(new Uint8Array([]))).toBe(0n);
  });
});

describe("bigIntToBytes", () => {
  it("converts to specified length", () => {
    const result = bigIntToBytes(256n, 4);
    expect(result).toEqual(new Uint8Array([0, 0, 1, 0]));
  });

  it("pads with zeros", () => {
    const result = bigIntToBytes(1n, 4);
    expect(result).toEqual(new Uint8Array([0, 0, 0, 1]));
  });

  it("handles zero", () => {
    expect(bigIntToBytes(0n, 4)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });
});

describe("bytesToBigInt / bigIntToBytes roundtrip", () => {
  it("roundtrips correctly", () => {
    const values = [0n, 1n, 255n, 256n, 65535n, (1n << 48n) - 1n];
    for (const val of values) {
      const bytes = bigIntToBytes(val, 6);
      const result = bytesToBigInt(bytes);
      expect(result).toBe(val);
    }
  });
});

describe("concatBytes", () => {
  it("concatenates two arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("handles empty arrays", () => {
    const a = new Uint8Array([]);
    const b = new Uint8Array([1, 2]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2]));
    expect(concatBytes(b, a)).toEqual(new Uint8Array([1, 2]));
  });
});
