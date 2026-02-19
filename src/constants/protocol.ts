/** Amount sent to host to request joining a match */
export const JOIN_SIGNAL = 100n;

/** Amount sent to joiner to accept the match */
export const ACCEPT_SIGNAL = 101n;

/** Draft pick amounts: championId + 1 (1-10) */
export const DRAFT_PICK_MIN = 1n;
export const DRAFT_PICK_MAX = 10n;

/** Combat move amounts: championId * 2 + abilityIndex + 1 (1-20) */
export const MOVE_MIN = 1n;
export const MOVE_MAX = 20n;

/** Max value for 48-bit hash chunk (used in commit) */
export const COMMIT_CHUNK_MAX = (1n << 48n) - 1n;

/** Max value for 32-bit nonce chunk (used in reveal) */
export const NONCE_CHUNK_MAX = (1n << 32n) - 1n;

/** Snake draft order: index = pick number (0-5), value = "A" or "B" */
export const DRAFT_ORDER: ("A" | "B")[] = ["A", "B", "B", "A", "A", "B"];

/** Total champions each player drafts */
export const TEAM_SIZE = 3;

/** Total champion pool size */
export const POOL_SIZE = 10;
