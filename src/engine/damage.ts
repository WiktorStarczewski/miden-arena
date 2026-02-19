import type { Ability, Champion, ChampionState, Buff } from "../types";
import { getTypeMultiplier } from "../constants/elements";

/**
 * Calculate final damage for a damage ability.
 *
 * baseDamage = ability.power × (1 + attacker.attack / 20)
 * typeMultiplier = elementMatchup(attacker, defender)
 * effectiveDefense = defender.defense + sum(defenseBuffs)
 * finalDamage = max(1, floor(baseDamage × typeMultiplier - effectiveDefense))
 */
export function calculateDamage(
  attacker: Champion,
  defender: Champion,
  defenderState: ChampionState,
  ability: Ability,
  attackerBuffs: Buff[],
): { damage: number; typeMultiplier: number } {
  const attackDebuffs = attackerBuffs
    .filter((b) => b.type === "attack" && b.isDebuff)
    .reduce((sum, b) => sum + b.value, 0);

  const effectiveAttack = Math.max(0, attacker.attack - attackDebuffs);
  const baseDamage = ability.power * (1 + effectiveAttack / 20);
  const typeMultiplier = getTypeMultiplier(attacker.element, defender.element);

  const defenseBuffValue = defenderState.buffs
    .filter((b) => b.type === "defense" && !b.isDebuff)
    .reduce((sum, b) => sum + b.value, 0);
  const effectiveDefense = defender.defense + defenseBuffValue;

  const finalDamage = Math.max(1, Math.floor(baseDamage * typeMultiplier - effectiveDefense));
  return { damage: finalDamage, typeMultiplier };
}

/**
 * Calculate burn tick damage: 10% of max HP.
 */
export function calculateBurnDamage(state: ChampionState): number {
  return Math.max(1, Math.floor(state.maxHp * 0.1));
}
