const KEYS = {
  SESSION_WALLET_ID: "miden-arena:sessionWalletId",
  MIDENFI_ADDRESS: "miden-arena:midenFiAddress",
  SETUP_COMPLETE: "miden-arena:setupComplete",
  OPPONENT_ID: "miden-arena:opponentId",
  ROLE: "miden-arena:role",
  DRAFT_STATE: "miden-arena:draftState",
} as const;

export function saveSessionWalletId(id: string): void {
  localStorage.setItem(KEYS.SESSION_WALLET_ID, id);
}

export function getSessionWalletId(): string | null {
  return localStorage.getItem(KEYS.SESSION_WALLET_ID);
}

export function saveMidenFiAddress(address: string): void {
  localStorage.setItem(KEYS.MIDENFI_ADDRESS, address);
}

export function getMidenFiAddress(): string | null {
  return localStorage.getItem(KEYS.MIDENFI_ADDRESS);
}

export function saveOpponentId(id: string): void {
  localStorage.setItem(KEYS.OPPONENT_ID, id);
}

export function getOpponentId(): string | null {
  return localStorage.getItem(KEYS.OPPONENT_ID);
}

export function saveRole(role: "host" | "joiner"): void {
  localStorage.setItem(KEYS.ROLE, role);
}

export function getRole(): "host" | "joiner" | null {
  const role = localStorage.getItem(KEYS.ROLE);
  if (role === "host" || role === "joiner") return role;
  return null;
}

export interface PersistedDraft {
  pool: number[];
  myTeam: number[];
  opponentTeam: number[];
  pickNumber: number;
  /** How many opponent draft-pick notes were already processed. */
  processedOpponentNotes: number;
}

export function saveDraftState(state: PersistedDraft): void {
  localStorage.setItem(KEYS.DRAFT_STATE, JSON.stringify(state));
}

export function getDraftState(): PersistedDraft | null {
  const raw = localStorage.getItem(KEYS.DRAFT_STATE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed.pool) ||
      !Array.isArray(parsed.myTeam) ||
      !Array.isArray(parsed.opponentTeam) ||
      typeof parsed.pickNumber !== "number" ||
      typeof parsed.processedOpponentNotes !== "number" ||
      parsed.pickNumber < 0 ||
      parsed.pickNumber > 6
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraftState(): void {
  localStorage.removeItem(KEYS.DRAFT_STATE);
}

export function clearGameState(): void {
  localStorage.removeItem(KEYS.OPPONENT_ID);
  localStorage.removeItem(KEYS.ROLE);
  localStorage.removeItem(KEYS.DRAFT_STATE);
}

export function markSetupComplete(): void {
  localStorage.setItem(KEYS.SETUP_COMPLETE, "true");
}

export function isSetupComplete(): boolean {
  return localStorage.getItem(KEYS.SETUP_COMPLETE) === "true";
}

export function clearSessionData(): void {
  localStorage.removeItem(KEYS.SESSION_WALLET_ID);
  localStorage.removeItem(KEYS.MIDENFI_ADDRESS);
  localStorage.removeItem(KEYS.SETUP_COMPLETE);
}

export function clearAll(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}
