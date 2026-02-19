/** Amount sent to host to request joining a match */
export const JOIN_SIGNAL = 100n;

/** Amount sent to joiner to accept the match */
export const ACCEPT_SIGNAL = 101n;

/** Amount sent to opponent when leaving / rehosting */
export const LEAVE_SIGNAL = 102n;

/** Draft pick amounts: championId + 1 (1-10) */
export const DRAFT_PICK_MIN = 1n;
export const DRAFT_PICK_MAX = 10n;

/** Combat move amounts: championId * 2 + abilityIndex + 1 (1-20) */
export const MOVE_MIN = 1n;
export const MOVE_MAX = 20n;

/** Max amount for commit notes: 16-bit hash + 1 + 100_000 offset = 165536. */
export const COMMIT_CHUNK_MAX = (1n << 16n) + 100_000n;

/** Max amount for nonce reveal notes: 16-bit value + 21 offset = 65556. */
export const NONCE_CHUNK_MAX = (1n << 16n) + 20n;

/** Snake draft order: index = pick number (0-5), value = "A" or "B" */
export const DRAFT_ORDER: ("A" | "B")[] = ["A", "B", "B", "A", "A", "B"];

/** Total champions each player drafts */
export const TEAM_SIZE = 3;

/** Total champion pool size */
export const POOL_SIZE = 10;
