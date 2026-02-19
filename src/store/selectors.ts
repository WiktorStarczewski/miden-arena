import { useGameStore } from "./gameStore";
import type { ChampionState } from "../types";
import { getChampion } from "../constants/champions";

/** Get surviving (non-KO) champions on my team. */
export function useMySurvivors(): ChampionState[] {
  return useGameStore((s) => s.battle.myChampions.filter((c) => !c.isKO));
}

/** Get surviving (non-KO) champions on opponent's team. */
export function useOpponentSurvivors(): ChampionState[] {
  return useGameStore((s) => s.battle.opponentChampions.filter((c) => !c.isKO));
}

/** Check if I can submit a move (champion and ability selected). */
export function useCanSubmitMove(): boolean {
  return useGameStore(
    (s) =>
      s.battle.phase === "choosing" &&
      s.battle.selectedChampion !== null &&
      s.battle.selectedAbility !== null,
  );
}

/** Get the currently selected champion's full info. */
export function useSelectedChampionInfo() {
  return useGameStore((s) => {
    if (s.battle.selectedChampion === null) return null;
    const state = s.battle.myChampions.find((c) => c.id === s.battle.selectedChampion);
    if (!state) return null;
    const champion = getChampion(s.battle.selectedChampion);
    return { champion, state };
  });
}

/** Get the MVP (champion with most total damage dealt across both teams). */
export function useMvp(): number | null {
  return useGameStore((s) => {
    const all = [...s.battle.myChampions, ...s.battle.opponentChampions];
    if (all.length === 0) return null;
    return all.reduce((best, c) => (c.totalDamageDealt > best.totalDamageDealt ? c : best)).id;
  });
}

/** Check if the game is over (one team eliminated). */
export function useIsGameOver(): boolean {
  return useGameStore((s) => {
    const myAlive = s.battle.myChampions.some((c) => !c.isKO);
    const oppAlive = s.battle.opponentChampions.some((c) => !c.isKO);
    return !myAlive || !oppAlive;
  });
}

/** Get draft progress as fraction. */
export function useDraftProgress(): number {
  return useGameStore((s) => s.draft.pickNumber / 6);
}
