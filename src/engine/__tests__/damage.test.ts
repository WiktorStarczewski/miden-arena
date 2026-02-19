import { describe, it, expect } from "vitest";
import { calculateDamage, calculateBurnDamage } from "../damage";
import { CHAMPIONS } from "../../constants/champions";
import type { ChampionState } from "../../types";

function makeState(championId: number): ChampionState {
  const champ = CHAMPIONS[championId];
  return {
    id: championId,
    currentHp: champ.hp,
    maxHp: champ.hp,
    buffs: [],
    burnTurns: 0,
    isKO: false,
    totalDamageDealt: 0,
  };
}

describe("calculateDamage", () => {
  it("calculates basic damage correctly", () => {
    const ember = CHAMPIONS[0]; // Fire, ATK 16
    const boulder = CHAMPIONS[2]; // Earth, DEF 16
    const boulderState = makeState(2);
    const ability = ember.abilities[0]; // Fireball: 25 power

    const { damage, typeMultiplier } = calculateDamage(
      ember,
      boulder,
      boulderState,
      ability,
      [],
    );

    // baseDamage = 25 * (1 + 16/20) = 25 * 1.8 = 45
    // Fire vs Earth = 1.5x
    // finalDamage = max(1, floor(45 * 1.5 - 16)) = max(1, floor(51.5)) = 51
    expect(typeMultiplier).toBe(1.5);
    expect(damage).toBe(51);
  });

  it("applies element disadvantage", () => {
    const ember = CHAMPIONS[0]; // Fire
    const torrent = CHAMPIONS[1]; // Water
    const torrentState = makeState(1);
    const ability = ember.abilities[0]; // Fireball: 25 power

    const { damage, typeMultiplier } = calculateDamage(
      ember,
      torrent,
      torrentState,
      ability,
      [],
    );

    // baseDamage = 25 * 1.8 = 45
    // Fire vs Water = 0.67x
    // finalDamage = max(1, floor(45 * 0.67 - 12)) = max(1, floor(18.15)) = 18
    expect(typeMultiplier).toBe(0.67);
    expect(damage).toBe(18);
  });

  it("applies neutral matchup", () => {
    const ember = CHAMPIONS[0]; // Fire
    const gale = CHAMPIONS[3]; // Wind
    const galeState = makeState(3);
    const ability = ember.abilities[0]; // Fireball: 25 power

    const { typeMultiplier } = calculateDamage(
      ember,
      gale,
      galeState,
      ability,
      [],
    );

    // Fire vs Wind = neutral
    expect(typeMultiplier).toBe(1.0);
  });

  it("respects defense buffs", () => {
    const ember = CHAMPIONS[0];
    const boulder = CHAMPIONS[2];
    const boulderState = makeState(2);
    boulderState.buffs = [{ type: "defense", value: 6, turnsRemaining: 2, isDebuff: false }];
    const ability = ember.abilities[0];

    const { damage: damageWithBuff } = calculateDamage(
      ember,
      boulder,
      boulderState,
      ability,
      [],
    );

    // effectiveDefense = 16 + 6 = 22
    // finalDamage = max(1, floor(45 * 1.5 - 22)) = max(1, floor(45.5)) = 45
    expect(damageWithBuff).toBe(45);
  });

  it("respects attack debuffs on attacker", () => {
    const ember = CHAMPIONS[0]; // ATK 16
    const boulder = CHAMPIONS[2];
    const boulderState = makeState(2);
    const ability = ember.abilities[0];

    const attackDebuff = [{ type: "attack" as const, value: 4, turnsRemaining: 2, isDebuff: true }];

    const { damage } = calculateDamage(
      ember,
      boulder,
      boulderState,
      ability,
      attackDebuff,
    );

    // effectiveAttack = max(0, 16 - 4) = 12
    // baseDamage = 25 * (1 + 12/20) = 25 * 1.6 = 40
    // finalDamage = max(1, floor(40 * 1.5 - 16)) = max(1, floor(44)) = 44
    expect(damage).toBe(44);
  });

  it("ensures minimum 1 damage", () => {
    // Use a very low power ability against high defense
    const gale = CHAMPIONS[3]; // ATK 15
    const boulder = CHAMPIONS[2]; // DEF 16
    const boulderState = makeState(2);
    // Give boulder massive defense buff
    boulderState.buffs = [{ type: "defense", value: 100, turnsRemaining: 1, isDebuff: false }];

    const ability = { name: "Test", power: 1, type: "damage" as const, description: "" };

    const { damage } = calculateDamage(gale, boulder, boulderState, ability, []);
    expect(damage).toBe(1);
  });

  it("covers all 100 champion matchups without errors", () => {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const attacker = CHAMPIONS[i];
        const defender = CHAMPIONS[j];
        const defState = makeState(j);

        for (const ability of attacker.abilities) {
          if (ability.type === "damage" || ability.type === "damage_dot") {
            const { damage, typeMultiplier } = calculateDamage(
              attacker,
              defender,
              defState,
              ability,
              [],
            );
            expect(damage).toBeGreaterThanOrEqual(1);
            expect(typeMultiplier).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("calculateBurnDamage", () => {
  it("calculates 10% of max HP", () => {
    const state = makeState(0); // Ember: 90 HP
    expect(calculateBurnDamage(state)).toBe(9);
  });

  it("ensures minimum 1 burn damage", () => {
    const state = makeState(0);
    state.maxHp = 5;
    expect(calculateBurnDamage(state)).toBe(1);
  });
});
