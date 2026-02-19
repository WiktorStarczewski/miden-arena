import { useMemo } from "react";
import { useGameStore } from "../store/gameStore";
import { useCombatTurn } from "../hooks/useCombatTurn";
import { getChampion } from "../constants/champions";
import ArenaScene from "../scenes/ArenaScene";
import BattleHUD from "../components/battle/BattleHUD";
import GameLayout from "../components/layout/GameLayout";

export default function BattleScreen() {
  const battle = useGameStore((s) => s.battle);
  const { submitMove, phase } = useCombatTurn();

  // Determine which champions are currently fighting for the 3D scene
  const myActiveChampion = useMemo(() => {
    if (battle.selectedChampion !== null) {
      const state = battle.myChampions.find((c) => c.id === battle.selectedChampion);
      if (state && !state.isKO) {
        return {
          id: battle.selectedChampion,
          animation: getAnimationForPhase(phase, "attacker"),
        };
      }
    }
    // Default to first surviving champion
    const survivor = battle.myChampions.find((c) => !c.isKO);
    return survivor ? { id: survivor.id, animation: "idle" } : undefined;
  }, [battle.selectedChampion, battle.myChampions, phase]);

  const opponentActiveChampion = useMemo(() => {
    // During resolution, show the opponent's champion from the last turn
    const lastTurn = battle.turnLog[battle.turnLog.length - 1];
    if (lastTurn && (phase === "resolving" || phase === "animating")) {
      return {
        id: lastTurn.opponentAction.championId,
        animation: getAnimationForPhase(phase, "defender"),
      };
    }
    // Default to first surviving opponent champion
    const survivor = battle.opponentChampions.find((c) => !c.isKO);
    return survivor ? { id: survivor.id, animation: "idle" } : undefined;
  }, [battle.opponentChampions, battle.turnLog, phase]);

  const attackEffect = useMemo(() => {
    if (phase === "animating" && battle.turnLog.length > 0) {
      const lastTurn = battle.turnLog[battle.turnLog.length - 1];
      const attackEvent = lastTurn.events.find((e) => e.type === "attack");
      if (attackEvent && attackEvent.type === "attack") {
        const attackerChamp = getChampion(attackEvent.attackerId);
        const isMyAttacker = battle.myChampions.some((c) => c.id === attackEvent.attackerId);
        return {
          from: isMyAttacker ? "left" as const : "right" as const,
          element: attackerChamp.element,
        };
      }
    }
    return undefined;
  }, [phase, battle.turnLog, battle.myChampions]);

  return (
    <GameLayout title={`Round ${battle.round}`}>
      <div className="relative flex h-full flex-col">
        {/* 3D Arena Scene - top portion */}
        <div className="relative h-[40vh] w-full sm:h-[50vh] lg:h-[55vh]">
          <ArenaScene
            myChampion={myActiveChampion}
            opponentChampion={opponentActiveChampion}
            attackEffect={attackEffect}
          />
        </div>

        {/* Battle HUD overlay */}
        <div className="flex-1 overflow-hidden">
          <BattleHUD onSubmitMove={submitMove} />
        </div>
      </div>
    </GameLayout>
  );
}

function getAnimationForPhase(
  phase: string,
  role: "attacker" | "defender",
): string {
  switch (phase) {
    case "animating":
      return role === "attacker" ? "attack1" : "hit_reaction";
    case "resolving":
      return "idle";
    default:
      return "idle";
  }
}
