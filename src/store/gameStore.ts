import { create } from "zustand";
import type { ChampionState, CommitData, RevealData, TurnRecord } from "../types";

export type Screen = "loading" | "title" | "setup" | "lobby" | "draft" | "preBattleLoading" | "battle" | "gameOver";
export type SetupStep = "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done";
export type BattlePhase = "choosing" | "committing" | "waitingCommit" | "revealing" | "waitingReveal" | "resolving" | "animating";

export interface NoteRef {
  noteId: string;
  amount: bigint;
}

interface SetupState {
  midenFiAddress: string | null;
  sessionWalletId: string | null;
  step: SetupStep;
}

interface MatchState {
  opponentId: string | null;
  role: "host" | "joiner" | null;
}

export interface DraftState {
  pool: number[];
  myTeam: number[];
  opponentTeam: number[];
  currentPicker: "me" | "opponent";
  pickNumber: number;
  /** Note IDs from the opponent that existed before this game started. */
  staleNoteIds: string[];
}

interface BattleState {
  round: number;
  phase: BattlePhase;
  myChampions: ChampionState[];
  opponentChampions: ChampionState[];
  selectedChampion: number | null;
  selectedAbility: number | null;
  myCommit: CommitData | null;
  opponentCommitNotes: NoteRef[];
  myReveal: RevealData | null;
  opponentReveal: RevealData | null;
  turnLog: TurnRecord[];
  /** Note IDs from the opponent that existed before battle started. */
  staleNoteIds: string[];
}

interface ResultState {
  winner: "me" | "opponent" | "draw" | null;
  totalRounds: number;
  mvp: number | null;
}

export interface GameStore {
  screen: Screen;
  setup: SetupState;
  match: MatchState;
  draft: DraftState;
  battle: BattleState;
  result: ResultState;

  // Navigation
  setScreen: (screen: Screen) => void;

  // Setup actions
  setSetupStep: (step: SetupStep) => void;
  setMidenFiAddress: (address: string) => void;
  setSessionWalletId: (id: string) => void;

  // Match actions
  setOpponent: (id: string, role: "host" | "joiner") => void;

  // Draft actions
  initDraft: (staleNoteIds: string[]) => void;
  restoreDraft: (draft: DraftState) => void;
  pickChampion: (championId: number, picker: "me" | "opponent") => void;
  setCurrentPicker: (picker: "me" | "opponent") => void;

  // Battle actions
  initBattle: (staleNoteIds: string[]) => void;
  selectChampion: (id: number | null) => void;
  selectAbility: (index: number | null) => void;
  setBattlePhase: (phase: BattlePhase) => void;
  setMyCommit: (commit: CommitData | null) => void;
  setOpponentCommitNotes: (notes: NoteRef[]) => void;
  setMyReveal: (reveal: RevealData | null) => void;
  setOpponentReveal: (reveal: RevealData | null) => void;
  updateChampions: (my: ChampionState[], opponent: ChampionState[]) => void;
  addTurnRecord: (record: TurnRecord) => void;
  nextRound: () => void;

  // Result actions
  setResult: (winner: "me" | "opponent" | "draw", mvp: number | null) => void;

  // Reset
  resetGame: () => void;
}

const initialSetup: SetupState = {
  midenFiAddress: null,
  sessionWalletId: null,
  step: "idle",
};

const initialMatch: MatchState = {
  opponentId: null,
  role: null,
};

const initialDraft: DraftState = {
  pool: [],
  myTeam: [],
  opponentTeam: [],
  currentPicker: "me",
  pickNumber: 0,
  staleNoteIds: [],
};

const initialBattle: BattleState = {
  round: 1,
  phase: "choosing",
  myChampions: [],
  opponentChampions: [],
  selectedChampion: null,
  selectedAbility: null,
  myCommit: null,
  opponentCommitNotes: [],
  myReveal: null,
  opponentReveal: null,
  turnLog: [],
  staleNoteIds: [],
};

const initialResult: ResultState = {
  winner: null,
  totalRounds: 0,
  mvp: null,
};

export const useGameStore = create<GameStore>((set) => ({
  screen: "loading",
  setup: { ...initialSetup },
  match: { ...initialMatch },
  draft: { ...initialDraft },
  battle: { ...initialBattle },
  result: { ...initialResult },

  setScreen: (screen) => set({ screen }),

  setSetupStep: (step) =>
    set((state) => ({ setup: { ...state.setup, step } })),

  setMidenFiAddress: (address) =>
    set((state) => ({ setup: { ...state.setup, midenFiAddress: address } })),

  setSessionWalletId: (id) =>
    set((state) => ({ setup: { ...state.setup, sessionWalletId: id } })),

  setOpponent: (id, role) =>
    set({ match: { opponentId: id, role } }),

  initDraft: (staleNoteIds) =>
    set({
      draft: {
        pool: Array.from({ length: 10 }, (_, i) => i),
        myTeam: [],
        opponentTeam: [],
        currentPicker: "me",
        pickNumber: 0,
        staleNoteIds,
      },
    }),

  restoreDraft: (draft) => set({ draft }),

  pickChampion: (championId, picker) =>
    set((state) => {
      const newPool = state.draft.pool.filter((id) => id !== championId);
      const myTeam = picker === "me"
        ? [...state.draft.myTeam, championId]
        : state.draft.myTeam;
      const opponentTeam = picker === "opponent"
        ? [...state.draft.opponentTeam, championId]
        : state.draft.opponentTeam;
      return {
        draft: {
          ...state.draft,
          pool: newPool,
          myTeam,
          opponentTeam,
          pickNumber: state.draft.pickNumber + 1,
        },
      };
    }),

  setCurrentPicker: (picker) =>
    set((state) => ({ draft: { ...state.draft, currentPicker: picker } })),

  initBattle: (staleNoteIds) =>
    set((state) => ({
      battle: {
        ...initialBattle,
        staleNoteIds,
        myChampions: state.draft.myTeam.map((id) => ({
          id,
          currentHp: getChampionHp(id),
          maxHp: getChampionHp(id),
          buffs: [],
          burnTurns: 0,
          isKO: false,
          totalDamageDealt: 0,
        })),
        opponentChampions: state.draft.opponentTeam.map((id) => ({
          id,
          currentHp: getChampionHp(id),
          maxHp: getChampionHp(id),
          buffs: [],
          burnTurns: 0,
          isKO: false,
          totalDamageDealt: 0,
        })),
      },
    })),

  selectChampion: (id) =>
    set((state) => ({ battle: { ...state.battle, selectedChampion: id } })),

  selectAbility: (index) =>
    set((state) => ({ battle: { ...state.battle, selectedAbility: index } })),

  setBattlePhase: (phase) =>
    set((state) => ({ battle: { ...state.battle, phase } })),

  setMyCommit: (commit) =>
    set((state) => ({ battle: { ...state.battle, myCommit: commit } })),

  setOpponentCommitNotes: (notes) =>
    set((state) => ({ battle: { ...state.battle, opponentCommitNotes: notes } })),

  setMyReveal: (reveal) =>
    set((state) => ({ battle: { ...state.battle, myReveal: reveal } })),

  setOpponentReveal: (reveal) =>
    set((state) => ({ battle: { ...state.battle, opponentReveal: reveal } })),

  updateChampions: (my, opponent) =>
    set((state) => ({
      battle: { ...state.battle, myChampions: my, opponentChampions: opponent },
    })),

  addTurnRecord: (record) =>
    set((state) => ({
      battle: { ...state.battle, turnLog: [...state.battle.turnLog, record] },
    })),

  nextRound: () =>
    set((state) => ({
      battle: {
        ...state.battle,
        round: state.battle.round + 1,
        phase: "choosing",
        selectedChampion: null,
        selectedAbility: null,
        myCommit: null,
        opponentCommitNotes: [],
        myReveal: null,
        opponentReveal: null,
      },
    })),

  setResult: (winner, mvp) =>
    set((state) => ({
      screen: "gameOver",
      result: {
        winner,
        totalRounds: state.battle.round,
        mvp,
      },
    })),

  resetGame: () =>
    set({
      screen: "title",
      match: { ...initialMatch },
      draft: { ...initialDraft },
      battle: { ...initialBattle },
      result: { ...initialResult },
    }),
}));

// Helper: get champion HP from the roster
function getChampionHp(id: number): number {
  const hpTable = [90, 110, 140, 75, 80, 100, 130, 85, 65, 120];
  return hpTable[id] ?? 100;
}
