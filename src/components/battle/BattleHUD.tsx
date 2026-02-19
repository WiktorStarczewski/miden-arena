import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { getChampion } from "../../constants/champions";
import GlassPanel from "../layout/GlassPanel";
import HealthBar from "../ui/HealthBar";
import ElementBadge from "../ui/ElementBadge";
import StatusEffectIcon from "../ui/StatusEffectIcon";
import AbilityCard from "../ui/AbilityCard";
import TurnPhaseIndicator from "../ui/TurnPhaseIndicator";
import type { Champion, ChampionState } from "../../types/game";

interface BattleHUDProps {
  children?: React.ReactNode;
}

interface FighterPanelProps {
  championState: ChampionState;
  champion: Champion;
  isOpponent?: boolean;
}

function FighterPanel({
  championState,
  champion,
  isOpponent = false,
}: FighterPanelProps) {
  return (
    <GlassPanel
      compact
      className={`
        w-full
        ${isOpponent ? "border-red-500/20" : "border-emerald-500/20"}
      `}
    >
      {/* Name + element row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOpponent && (
            <span className="text-[9px] uppercase tracking-wider text-red-400/60 font-medium">
              Enemy
            </span>
          )}
          <span className="font-bold text-sm text-white/90 truncate">
            {champion.name}
          </span>
          <ElementBadge element={champion.element} size="sm" />
        </div>
        {championState.isKO && (
          <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30">
            KO
          </span>
        )}
      </div>

      {/* Health bar */}
      <HealthBar
        current={championState.currentHp}
        max={championState.maxHp}
        showLabel
      />

      {/* Status effects */}
      {(championState.buffs.length > 0 || championState.burnTurns > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {championState.buffs.map((buff, i) => (
            <StatusEffectIcon key={`buff-${i}`} buff={buff} />
          ))}
          {championState.burnTurns > 0 && (
            <StatusEffectIcon isBurn burnTurns={championState.burnTurns} />
          )}
        </div>
      )}
    </GlassPanel>
  );
}

export default function BattleHUD({ children }: BattleHUDProps) {
  const battle = useGameStore((state) => state.battle);

  if (!battle) return null;

  const {
    phase,
    selectedChampion,
    selectedAbility,
    myTeam,
    opponentTeam,
    myActiveChampion,
    opponentActiveChampion,
  } = battle;

  // Resolve champion data
  const myChampionState = myTeam?.find(
    (c: ChampionState) => c.id === myActiveChampion
  );
  const opponentChampionState = opponentTeam?.find(
    (c: ChampionState) => c.id === opponentActiveChampion
  );

  const myChampion = myActiveChampion
    ? getChampion(myActiveChampion)
    : undefined;
  const opponentChampion = opponentActiveChampion
    ? getChampion(opponentActiveChampion)
    : undefined;

  const isChoosing = phase === "choosing";

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Opponent info - top */}
      <div className="flex-shrink-0 px-1 mb-2">
        {opponentChampionState && opponentChampion && (
          <FighterPanel
            championState={opponentChampionState}
            champion={opponentChampion}
            isOpponent
          />
        )}
      </div>

      {/* Arena area - middle, expandable */}
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        {/* Phase indicator - floating center */}
        <div className="absolute top-2 left-0 right-0 z-20 px-4">
          <TurnPhaseIndicator phase={phase} />
        </div>

        {/* Arena content slot */}
        <div className="w-full h-full">{children}</div>
      </div>

      {/* My info + abilities - bottom */}
      <div className="flex-shrink-0 px-1 mt-2">
        {/* My champion info */}
        {myChampionState && myChampion && (
          <FighterPanel
            championState={myChampionState}
            champion={myChampion}
          />
        )}

        {/* Ability cards - bottom sheet style on mobile */}
        {myChampion && (
          <AnimatePresence>
            {isChoosing && (
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-2"
              >
                <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
                  {myChampion.abilities.map((ability, i) => (
                    <AbilityCard
                      key={i}
                      ability={ability}
                      index={i}
                      selected={selectedAbility === i}
                      disabled={myChampionState?.isKO || false}
                      onClick={() => {
                        const store = useGameStore.getState();
                        if (store.selectAbility) {
                          store.selectAbility(i);
                        }
                      }}
                    />
                  ))}
                </div>

                {/* Confirm button */}
                {selectedAbility !== null && selectedAbility !== undefined && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="
                      w-full mt-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wider
                      bg-amber-500/20 border border-amber-400/40 text-amber-300
                      hover:bg-amber-500/30 active:scale-[0.98]
                      transition-all duration-200
                    "
                    onClick={() => {
                      const store = useGameStore.getState();
                      if (store.confirmAction) {
                        store.confirmAction();
                      }
                    }}
                  >
                    Confirm Move
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
