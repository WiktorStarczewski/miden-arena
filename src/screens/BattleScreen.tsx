import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useGameStore } from "../store/gameStore";
import { useCombatTurn } from "../hooks/useCombatTurn";
import { getChampion } from "../constants/champions";
import { playMusic } from "../audio/audioManager";
import ArenaScene from "../scenes/ArenaScene";
import BattleHUD from "../components/battle/BattleHUD";
import GameLayout from "../components/layout/GameLayout";
import type { TurnEvent, TurnRecord } from "../types";

// ---------------------------------------------------------------------------
// Animation sequencing — plays the faster champion's action first
// ---------------------------------------------------------------------------

/** How long to display an attack action (projectile + impact) before the next. */
const ATTACK_PHASE_MS = 1000;
/** How long to display a buff/heal self-effect before the next action. */
const SELF_PHASE_MS = 800;
/** Brief pause between first and second actions. */
const GAP_MS = 300;

type AnimSubPhase = "first" | "gap" | "second" | "settle";

interface ActionIndicator {
  side: "left" | "right";
  text: string;
  color: string;
}

interface IndicatorData extends ActionIndicator {
  id: number;
}

interface AnimAction {
  /** "attack" = projectile toward enemy; "self" = buff/heal glow on caster */
  type: "attack" | "self";
  /** Side of the actor performing this action */
  actorSide: "left" | "right";
  /** Element for particle colouring */
  element: string;
  /** Only set when type === "self" */
  selfType?: "buff" | "heal";
  /** Floating indicator to show after this action's visual effect completes */
  indicator?: ActionIndicator;
}

interface AnimScript {
  myChampionId: number;
  oppChampionId: number;
  first: AnimAction;
  second: AnimAction;
  secondActed: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine who acted first by scanning the event log.
 * Events are emitted in execution order (faster champion first).
 */
function getFirstActorId(
  events: TurnEvent[],
  myId: number,
  oppId: number,
): number {
  for (const event of events) {
    if (event.type === "attack") return event.attackerId;
    if (event.type === "buff" || event.type === "heal") return event.championId;
    if (event.type === "debuff") {
      // Caster is the opposite of the target
      return event.targetId === myId ? oppId : myId;
    }
  }
  return myId; // fallback
}

/**
 * Check whether the second (slower) champion produced any action events,
 * i.e. was NOT KO'd before their turn.
 */
function didSecondAct(
  events: TurnEvent[],
  secondId: number,
  firstId: number,
): boolean {
  return events.some((e) => {
    if (e.type === "attack" && e.attackerId === secondId) return true;
    if ((e.type === "buff" || e.type === "heal") && e.championId === secondId)
      return true;
    // If a debuff targets the first champion, the second must have cast it
    if (e.type === "debuff" && e.targetId === firstId) return true;
    return false;
  });
}

function toAnimAction(
  abilityType: string,
  side: "left" | "right",
  element: string,
): AnimAction {
  const isDirected =
    abilityType === "damage" ||
    abilityType === "damage_dot" ||
    abilityType === "debuff";
  return {
    type: isDirected ? "attack" : "self",
    actorSide: side,
    element,
    selfType: isDirected ? undefined : abilityType === "heal" ? "heal" : "buff",
  };
}

function abbreviateStat(stat: string): string {
  switch (stat) {
    case "defense": return "DEF";
    case "attack": return "ATK";
    case "speed": return "SPD";
    default: return stat.toUpperCase();
  }
}

function extractIndicator(
  events: TurnEvent[],
  actorId: number,
  opponentId: number,
  actorSide: "left" | "right",
): ActionIndicator | undefined {
  const targetSide: "left" | "right" = actorSide === "left" ? "right" : "left";
  for (const e of events) {
    if (e.type === "attack" && e.attackerId === actorId) {
      return { side: targetSide, text: `-${e.damage}`, color: "#ff4444" };
    }
    if (e.type === "heal" && e.championId === actorId) {
      return { side: actorSide, text: `+${e.amount} HP`, color: "#4ade80" };
    }
    if (e.type === "buff" && e.championId === actorId) {
      return { side: actorSide, text: `+${e.value} ${abbreviateStat(e.stat)}`, color: "#fbbf24" };
    }
    if (e.type === "debuff" && e.targetId === opponentId) {
      return { side: targetSide, text: `-${e.value} ${abbreviateStat(e.stat)}`, color: "#a855f7" };
    }
  }
  return undefined;
}

/** Build the two-step animation script from a resolved turn. */
function buildAnimScript(
  record: TurnRecord,
  myChampionIds: number[],
): AnimScript {
  const isMe = (id: number) => myChampionIds.includes(id);

  const myChamp = getChampion(record.myAction.championId);
  const oppChamp = getChampion(record.opponentAction.championId);
  const myAbility = myChamp.abilities[record.myAction.abilityIndex];
  const oppAbility = oppChamp.abilities[record.opponentAction.abilityIndex];

  const firstActorId = getFirstActorId(
    record.events,
    record.myAction.championId,
    record.opponentAction.championId,
  );
  const firstIsMe = isMe(firstActorId);

  const firstAbility = firstIsMe ? myAbility : oppAbility;
  const secondAbility = firstIsMe ? oppAbility : myAbility;
  const firstChamp = firstIsMe ? myChamp : oppChamp;
  const secondChamp = firstIsMe ? oppChamp : myChamp;
  const firstSide: "left" | "right" = firstIsMe ? "left" : "right";
  const secondSide: "left" | "right" = firstIsMe ? "right" : "left";

  // Always animate both actions — only the indicator depends on whether the
  // second champion's action actually had an effect (they may have been KO'd
  // by the first hit, or a heal at full HP produces no event).
  const secondActed = didSecondAct(
    record.events,
    secondChamp.id,
    firstChamp.id,
  );

  return {
    myChampionId: record.myAction.championId,
    oppChampionId: record.opponentAction.championId,
    first: {
      ...toAnimAction(firstAbility.type, firstSide, firstChamp.element),
      indicator: extractIndicator(record.events, firstChamp.id, secondChamp.id, firstSide),
    },
    second: {
      ...toAnimAction(secondAbility.type, secondSide, secondChamp.element),
      indicator: secondActed
        ? extractIndicator(record.events, secondChamp.id, firstChamp.id, secondSide)
        : undefined,
    },
    secondActed,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BattleScreen() {
  const battle = useGameStore((s) => s.battle);
  const { submitMove, phase } = useCombatTurn();

  // Crossfade to battle music on mount
  useEffect(() => {
    playMusic("battle");
  }, []);

  const [animSubPhase, setAnimSubPhase] = useState<AnimSubPhase | null>(null);
  const [indicators, setIndicators] = useState<IndicatorData[]>([]);
  const indicatorIdRef = useRef(0);

  const addIndicator = useCallback((ind: ActionIndicator) => {
    const id = ++indicatorIdRef.current;
    setIndicators((prev) => [...prev, { ...ind, id }]);
    setTimeout(() => {
      setIndicators((prev) => prev.filter((i) => i.id !== id));
    }, 2800);
  }, []);

  // Stable champion ID list (won't change during animation phase)
  const myChampionIds = useMemo(
    () => battle.myChampions.map((c) => c.id),
    [battle.myChampions],
  );

  // Build animation script when entering "animating" phase
  const animScript = useMemo(() => {
    if (phase !== "animating" || battle.turnLog.length === 0) return null;
    const lastTurn = battle.turnLog[battle.turnLog.length - 1];
    return buildAnimScript(lastTurn, myChampionIds);
  }, [phase, battle.turnLog, myChampionIds]);

  // Schedule animation sub-phases + floating indicators
  useEffect(() => {
    if (phase !== "animating" || !animScript) {
      setAnimSubPhase(null);
      setIndicators([]);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;

    // Start immediately with first action
    setAnimSubPhase("first");

    // Schedule first-action indicator (attack: on projectile hit, self: near end)
    if (animScript.first.indicator) {
      const delay = animScript.first.type === "attack" ? 200 : 700;
      const ind = animScript.first.indicator;
      timers.push(setTimeout(() => addIndicator(ind), delay));
    }

    t += animScript.first.type === "attack" ? ATTACK_PHASE_MS : SELF_PHASE_MS;

    // Always schedule the second action (both champions always animate)
    timers.push(setTimeout(() => setAnimSubPhase("gap"), t));
    t += GAP_MS;
    timers.push(setTimeout(() => setAnimSubPhase("second"), t));

    // Schedule second-action indicator (only if the action had effect)
    if (animScript.second.indicator) {
      const delay = animScript.second.type === "attack" ? 200 : 700;
      const ind = animScript.second.indicator;
      timers.push(setTimeout(() => addIndicator(ind), t + delay));
    }

    t += animScript.second.type === "attack" ? ATTACK_PHASE_MS : SELF_PHASE_MS;

    timers.push(setTimeout(() => setAnimSubPhase("settle"), t));

    return () => timers.forEach(clearTimeout);
  }, [phase, animScript, addIndicator]);

  // --- Derive the current action (the one being visually played) ---

  const currentAction =
    animSubPhase === "first"
      ? animScript?.first ?? null
      : animSubPhase === "second"
        ? animScript?.second ?? null  // second is always set when animScript exists
        : null;

  // --- Champion states for the 3D scene ---

  const myActiveChampion = useMemo(() => {
    // During animation: show the correct champion with the right anim clip
    if (animSubPhase && animScript) {
      // Check if champion was KO'd this turn → show death pose
      // During settle: always show death if KO'd
      // During second: show death if this champion was the second actor but didn't act (KO'd by first hit)
      const myChampKO = battle.myChampions.find(
        (c) => c.id === animScript.myChampionId,
      )?.isKO;
      if (myChampKO && animSubPhase === "settle") {
        return { id: animScript.myChampionId, animation: "death" };
      }
      if (
        myChampKO &&
        animSubPhase === "second" &&
        animScript.second.actorSide === "left" &&
        !animScript.secondActed
      ) {
        return { id: animScript.myChampionId, animation: "death" };
      }

      let anim = "idle";
      if (currentAction) {
        if (currentAction.actorSide === "left") {
          // I'm the actor
          anim = "attack1";
        } else if (currentAction.type === "attack") {
          // Opponent is attacking me
          anim = "hit_reaction";
        }
      }
      return { id: animScript.myChampionId, animation: anim };
    }

    // Choosing / other phases: selected champion or first survivor
    if (battle.selectedChampion !== null) {
      const state = battle.myChampions.find(
        (c) => c.id === battle.selectedChampion,
      );
      if (state && !state.isKO) {
        return { id: battle.selectedChampion, animation: "idle" };
      }
    }
    // Show first survivor at idle, or first KO'd champion in death pose
    const survivor = battle.myChampions.find((c) => !c.isKO);
    if (survivor) return { id: survivor.id, animation: "idle" };
    const dead = battle.myChampions.find((c) => c.isKO);
    return dead ? { id: dead.id, animation: "death" } : undefined;
  }, [animSubPhase, animScript, currentAction, battle.selectedChampion, battle.myChampions]);

  const opponentActiveChampion = useMemo(() => {
    // During animation: show the correct champion with the right anim clip
    if (animSubPhase && animScript) {
      // Check if champion was KO'd this turn → show death pose
      const oppChampKO = battle.opponentChampions.find(
        (c) => c.id === animScript.oppChampionId,
      )?.isKO;
      if (oppChampKO && animSubPhase === "settle") {
        return { id: animScript.oppChampionId, animation: "death" };
      }
      if (
        oppChampKO &&
        animSubPhase === "second" &&
        animScript.second.actorSide === "right" &&
        !animScript.secondActed
      ) {
        return { id: animScript.oppChampionId, animation: "death" };
      }

      let anim = "idle";
      if (currentAction) {
        if (currentAction.actorSide === "right") {
          // Opponent is the actor
          anim = "attack1";
        } else if (currentAction.type === "attack") {
          // I'm attacking the opponent
          anim = "hit_reaction";
        }
      }
      return { id: animScript.oppChampionId, animation: anim };
    }

    // Default: first surviving opponent champion, or first KO'd in death pose
    const survivor = battle.opponentChampions.find((c) => !c.isKO);
    if (survivor) return { id: survivor.id, animation: "idle" };
    const dead = battle.opponentChampions.find((c) => c.isKO);
    return dead ? { id: dead.id, animation: "death" } : undefined;
  }, [animSubPhase, animScript, currentAction, battle.opponentChampions]);

  // --- Attack effect (projectile from attacker → defender) ---

  const attackEffect = useMemo(() => {
    if (!currentAction || currentAction.type !== "attack") return undefined;
    return {
      from: currentAction.actorSide,
      element: currentAction.element,
      key: animSubPhase === "first" ? 0 : 1,
    };
  }, [currentAction, animSubPhase]);

  // --- Self effect (buff / heal glow on caster) ---

  const selfEffect = useMemo(() => {
    if (!currentAction || currentAction.type !== "self") return undefined;
    return {
      side: currentAction.actorSide,
      type: (currentAction.selfType ?? "buff") as "buff" | "heal",
      element: currentAction.element,
      key: animSubPhase === "first" ? 0 : 1,
    };
  }, [currentAction, animSubPhase]);

  return (
    <GameLayout title={`Round ${battle.round}`}>
      <div className="relative flex h-full flex-col overflow-hidden">
        {/* 3D Arena Scene — fixed height on mobile, fills remaining space on desktop */}
        <div
          className="relative h-[30vh] flex-shrink-0 sm:h-auto sm:flex-1 sm:min-h-[30vh]"
          style={{ width: "calc(100% + 1.5rem)", margin: "-0.75rem -0.75rem 0" }}
        >
          <ArenaScene
            myChampion={myActiveChampion}
            opponentChampion={opponentActiveChampion}
            attackEffect={attackEffect}
            selfEffect={selfEffect}
            indicators={indicators}
          />
        </div>

        {/* Battle HUD — scrollable on mobile, shrink-wrapped on desktop */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:flex-none sm:overflow-visible px-1 pt-3 pb-1">
          <BattleHUD onSubmitMove={submitMove} />
        </div>
      </div>
    </GameLayout>
  );
}
