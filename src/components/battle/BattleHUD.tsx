import { type ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { getChampion } from "../../constants/champions";
import { playSfx } from "../../audio/audioManager";
import GlassPanel from "../layout/GlassPanel";
import HealthBar from "../ui/HealthBar";
import ElementBadge from "../ui/ElementBadge";
import StatusEffectIcon from "../ui/StatusEffectIcon";
import AbilityCard from "../ui/AbilityCard";
import TurnPhaseIndicator from "../ui/TurnPhaseIndicator";
import ChampionSelector from "./ChampionSelector";
import type { Champion, ChampionState, TurnAction } from "../../types/game";

interface BattleHUDProps {
  onSubmitMove?: (action: TurnAction) => void | Promise<void>;
  children?: ReactNode;
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

export default function BattleHUD({ onSubmitMove, children }: BattleHUDProps) {
  const battle = useGameStore((state) => state.battle);
  const selectChampion = useGameStore((state) => state.selectChampion);

  const {
    phase,
    selectedChampion,
    selectedAbility,
    myChampions,
    opponentChampions,
  } = battle;

  // Auto-select the first surviving champion when entering the choosing phase
  useEffect(() => {
    if (phase !== "choosing") return;
    // If no champion selected, or current selection is KO'd, pick the first alive
    const currentValid = selectedChampion != null &&
      myChampions.some((c) => c.id === selectedChampion && !c.isKO);
    if (!currentValid) {
      const survivor = myChampions.find((c) => !c.isKO);
      if (survivor) selectChampion(survivor.id);
    }
  }, [phase, selectedChampion, myChampions, selectChampion]);

  // Find the active (selected or first surviving) champion for each side
  const myChampionState = selectedChampion != null
    ? myChampions.find((c: ChampionState) => c.id === selectedChampion)
    : myChampions.find((c: ChampionState) => !c.isKO);
  const opponentChampionState = opponentChampions.find(
    (c: ChampionState) => !c.isKO,
  );

  const myChampion = myChampionState
    ? getChampion(myChampionState.id)
    : undefined;
  const opponentChampion = opponentChampionState
    ? getChampion(opponentChampionState.id)
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

      {/* Phase indicator */}
      <div className="flex-shrink-0 px-1 sm:px-4 my-1 sm:my-2">
        <TurnPhaseIndicator phase={phase} />
      </div>

      {/* Arena content slot */}
      {children && <div className="flex-1 min-h-0">{children}</div>}

      {/* My info + abilities - bottom */}
      <div className="flex-shrink-0 px-1 mt-2">
        {/* My champion info */}
        {myChampionState && myChampion && (
          <FighterPanel
            championState={myChampionState}
            champion={myChampion}
          />
        )}

        {/* Champion selector + Ability cards - bottom sheet style on mobile */}
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
                {/* Champion selector — only show when multiple champions alive */}
                {myChampions.filter((c) => !c.isKO).length > 1 && (
                  <div className="mb-2">
                    <ChampionSelector
                      champions={myChampions}
                      selectedId={selectedChampion}
                      onSelect={(id) => {
                        selectChampion(id);
                        // Reset ability selection when switching champion
                        useGameStore.getState().selectAbility(null);
                      }}
                    />
                  </div>
                )}
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
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Confirm button — always visible so it contributes to layout */}
        <button
          disabled={!isChoosing || selectedAbility == null}
          className={`
            w-full mt-3 mb-2 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider
            border transition-all duration-200
            ${isChoosing && selectedAbility != null
              ? "bg-amber-500/20 border-amber-400/40 text-amber-300 hover:bg-amber-500/30 active:scale-[0.98] cursor-pointer"
              : "bg-white/5 border-white/10 text-white/25 cursor-not-allowed"
            }
          `}
          onClick={() => {
            if (onSubmitMove && selectedChampion != null && selectedAbility != null) {
              playSfx("confirm");
              onSubmitMove({ championId: selectedChampion, abilityIndex: selectedAbility });
            }
          }}
        >
          {isChoosing ? "Confirm Move" : "Choose your move"}
        </button>
      </div>
    </div>
  );
}
