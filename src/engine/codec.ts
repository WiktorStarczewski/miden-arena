import type { TurnAction } from "../types";

/**
 * Encode a turn action (championId + abilityIndex) into an amount value.
 * Formula: championId × 2 + abilityIndex + 1 → range [1, 20]
 */
export function encodeMove(action: TurnAction): number {
  const encoded = action.championId * 2 + action.abilityIndex + 1;
  if (encoded < 1 || encoded > 20) {
    throw new Error(`Invalid move encoding: champion=${action.championId}, ability=${action.abilityIndex}`);
  }
  return encoded;
}

/**
 * Decode an amount value back into a turn action.
 * Input range: [1, 20]
 */
export function decodeMove(amount: number): TurnAction {
  if (amount < 1 || amount > 20) {
    throw new Error(`Invalid move amount: ${amount}`);
  }
  const value = amount - 1; // 0-19
  const championId = Math.floor(value / 2);
  const abilityIndex = value % 2;
  return { championId, abilityIndex };
}

/**
 * Encode a draft pick: championId → amount.
 * Formula: championId + 1 → range [1, 10]
 */
export function encodeDraftPick(championId: number): bigint {
  if (championId < 0 || championId > 9) {
    throw new Error(`Invalid champion ID for draft: ${championId}`);
  }
  return BigInt(championId + 1);
}

/**
 * Decode a draft pick amount back to championId.
 * Input range: [1, 10]
 */
export function decodeDraftPick(amount: bigint): number {
  const id = Number(amount) - 1;
  if (id < 0 || id > 9) {
    throw new Error(`Invalid draft pick amount: ${amount}`);
  }
  return id;
}
