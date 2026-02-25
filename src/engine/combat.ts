import type { Champion, ChampionState, TurnAction, TurnEvent, Buff } from "../types";
import { getChampion } from "../constants/champions";
import { calculateDamage } from "./damage";

interface CombatSide {
  champion: Champion;
  state: ChampionState;
  action: TurnAction;
}

/**
 * Resolve a full combat turn between two sides.
 * Returns updated champion states and a list of events.
 */
export function resolveTurn(
  myChampions: ChampionState[],
  opponentChampions: ChampionState[],
  myAction: TurnAction,
  opponentAction: TurnAction,
): { myChampions: ChampionState[]; opponentChampions: ChampionState[]; events: TurnEvent[] } {
  const events: TurnEvent[] = [];

  // Deep clone states
  const myStates = myChampions.map((c) => ({ ...c, buffs: c.buffs.map((b) => ({ ...b })) }));
  const oppStates = opponentChampions.map((c) => ({ ...c, buffs: c.buffs.map((b) => ({ ...b })) }));

  const myChamp = getChampion(myAction.championId);
  const oppChamp = getChampion(opponentAction.championId);
  const myState = myStates.find((s) => s.id === myAction.championId)!;
  const oppState = oppStates.find((s) => s.id === opponentAction.championId)!;

  const mySide: CombatSide = { champion: myChamp, state: myState, action: myAction };
  const oppSide: CombatSide = { champion: oppChamp, state: oppState, action: opponentAction };

  // Determine speed priority
  const mySpeed = getEffectiveSpeed(myChamp, myState);
  const oppSpeed = getEffectiveSpeed(oppChamp, oppState);

  let first: CombatSide;
  let second: CombatSide;
  let firstIsMe: boolean;

  if (mySpeed > oppSpeed || (mySpeed === oppSpeed && myChamp.id < oppChamp.id)) {
    first = mySide;
    second = oppSide;
    firstIsMe = true;
  } else {
    first = oppSide;
    second = mySide;
    firstIsMe = false;
  }

  // First attacker acts
  executeAction(first, second, firstIsMe, events);

  // Second attacker acts only if not KO'd
  if (!second.state.isKO) {
    executeAction(second, first, !firstIsMe, events);
  }

  // Tick down buff durations
  tickBuffs(myState);
  tickBuffs(oppState);

  return { myChampions: myStates, opponentChampions: oppStates, events };
}

function getEffectiveSpeed(champion: Champion, state: ChampionState): number {
  const speedBuff = state.buffs
    .filter((b) => b.type === "speed" && !b.isDebuff)
    .reduce((sum, b) => sum + b.value, 0);
  return champion.speed + speedBuff;
}

function executeAction(
  actor: CombatSide,
  target: CombatSide,
  _actorIsMe: boolean,
  events: TurnEvent[],
): void {
  const ability = actor.champion.abilities[actor.action.abilityIndex];
  if (!ability) return;

  switch (ability.type) {
    case "damage": {
      const { damage, typeMultiplier } = calculateDamage(
        actor.champion,
        target.champion,
        target.state,
        ability,
        actor.state.buffs,
      );
      target.state.currentHp = Math.max(0, target.state.currentHp - damage);
      actor.state.totalDamageDealt += damage;

      events.push({
        type: "attack",
        attackerId: actor.champion.id,
        defenderId: target.champion.id,
        damage,
        effective: typeMultiplier > 1 ? 2 : typeMultiplier < 1 ? 0 : 1,
        isSuperEffective: typeMultiplier > 1,
        isResisted: typeMultiplier < 1,
      });

      if (target.state.currentHp === 0) {
        target.state.isKO = true;
        events.push({ type: "ko", championId: target.champion.id });
      }
      break;
    }

    case "heal": {
      const healAmount = ability.healAmount ?? 0;
      const oldHp = actor.state.currentHp;
      actor.state.currentHp = Math.min(actor.state.maxHp, oldHp + healAmount);
      const actualHeal = actor.state.currentHp - oldHp;
      events.push({ type: "heal", championId: actor.champion.id, amount: actualHeal, newHp: actor.state.currentHp });
      break;
    }

    case "stat_mod": {
      if (ability.stat && ability.statValue && ability.duration) {
        const isDebuff = ability.isDebuff ?? false;
        const buff: Buff = {
          type: ability.stat,
          value: ability.statValue,
          turnsRemaining: ability.duration,
          isDebuff,
        };
        if (isDebuff) {
          target.state.buffs.push(buff);
          events.push({
            type: "debuff",
            targetId: target.champion.id,
            stat: ability.stat,
            value: ability.statValue,
            duration: ability.duration,
          });
        } else {
          actor.state.buffs.push(buff);
          events.push({
            type: "buff",
            championId: actor.champion.id,
            stat: ability.stat,
            value: ability.statValue,
            duration: ability.duration,
          });
        }
      }
      break;
    }
  }
}

function tickBuffs(state: ChampionState): void {
  state.buffs = state.buffs
    .map((b) => ({ ...b, turnsRemaining: b.turnsRemaining - 1 }))
    .filter((b) => b.turnsRemaining > 0);
}

/**
 * Initialize champion combat state from champion definition.
 */
export function initChampionState(championId: number): ChampionState {
  const champ = getChampion(championId);
  return {
    id: championId,
    currentHp: champ.hp,
    maxHp: champ.hp,
    buffs: [],
    isKO: false,
    totalDamageDealt: 0,
  };
}

/**
 * Check if all champions on a side are KO'd.
 */
export function isTeamEliminated(team: ChampionState[]): boolean {
  return team.every((c) => c.isKO);
}
