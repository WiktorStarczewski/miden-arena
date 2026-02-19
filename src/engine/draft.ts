import { DRAFT_ORDER, POOL_SIZE, TEAM_SIZE } from "../constants/protocol";

/**
 * Get the full initial pool of champion IDs (0..9).
 */
export function getInitialPool(): number[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => i);
}

/**
 * Determine whose turn it is to pick based on pick number (0-indexed).
 * Host = "A", Joiner = "B".
 * Returns "me" or "opponent" based on player's role.
 */
export function getCurrentPicker(
  pickNumber: number,
  role: "host" | "joiner",
): "me" | "opponent" {
  const letter = DRAFT_ORDER[pickNumber];
  if (!letter) throw new Error(`Invalid pick number: ${pickNumber}`);

  if (role === "host") {
    return letter === "A" ? "me" : "opponent";
  } else {
    return letter === "B" ? "me" : "opponent";
  }
}

/**
 * Check if the draft is complete (all 6 picks made).
 */
export function isDraftComplete(myTeam: number[], opponentTeam: number[]): boolean {
  return myTeam.length === TEAM_SIZE && opponentTeam.length === TEAM_SIZE;
}

/**
 * Remove a champion from the pool.
 */
export function removeFromPool(pool: number[], championId: number): number[] {
  return pool.filter((id) => id !== championId);
}

/**
 * Validate that a champion can be picked (exists in pool).
 */
export function isValidPick(pool: number[], championId: number): boolean {
  return pool.includes(championId);
}
