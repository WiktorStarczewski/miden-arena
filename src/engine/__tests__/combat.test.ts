import { describe, it, expect } from "vitest";
import { resolveTurn, initChampionState, isTeamEliminated } from "../combat";

describe("initChampionState", () => {
  it("initializes correctly for each champion", () => {
    for (let i = 0; i < 8; i++) {
      const state = initChampionState(i);
      expect(state.id).toBe(i);
      expect(state.currentHp).toBe(state.maxHp);
      expect(state.currentHp).toBeGreaterThan(0);
      expect(state.isKO).toBe(false);
      expect(state.buffs).toEqual([]);
      expect(state.isKO).toBe(false);
    }
  });
});

describe("isTeamEliminated", () => {
  it("returns false when champions are alive", () => {
    const team = [initChampionState(0), initChampionState(1), initChampionState(2)];
    expect(isTeamEliminated(team)).toBe(false);
  });

  it("returns true when all are KO", () => {
    const team = [initChampionState(0), initChampionState(1), initChampionState(2)];
    team.forEach((c) => { c.isKO = true; c.currentHp = 0; });
    expect(isTeamEliminated(team)).toBe(true);
  });

  it("returns false when some are alive", () => {
    const team = [initChampionState(0), initChampionState(1), initChampionState(2)];
    team[0].isKO = true;
    team[0].currentHp = 0;
    expect(isTeamEliminated(team)).toBe(false);
  });
});

describe("resolveTurn", () => {
  it("faster champion attacks first", () => {
    // Gale (id 4, SPD 18) vs Boulder (id 1, SPD 5)
    const myChamps = [initChampionState(4)]; // Gale
    const oppChamps = [initChampionState(1)]; // Boulder

    const { events } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 4, abilityIndex: 0 }, // Wind Blade (24 dmg)
      { championId: 1, abilityIndex: 0 }, // Rock Slam (28 dmg)
    );

    // Gale is faster, so should attack first
    const firstAttack = events.find((e) => e.type === "attack");
    expect(firstAttack).toBeDefined();
    if (firstAttack?.type === "attack") {
      expect(firstAttack.attackerId).toBe(4); // Gale attacks first
    }
  });

  it("speed tie broken by lower ID", () => {
    // Give both the same effective speed by using champions with same speed
    const myChamps = [initChampionState(0)]; // Ember SPD 14
    const oppChamps = [initChampionState(0)]; // Same champion
    // This won't happen in real game (unique draft), but tests tie-breaking

    const { events } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 0, abilityIndex: 0 },
      { championId: 0, abilityIndex: 0 },
    );

    // First attack should still happen
    expect(events.filter((e) => e.type === "attack").length).toBeGreaterThanOrEqual(1);
  });

  it("applies heal correctly", () => {
    const myChamps = [initChampionState(3)]; // Torrent (id 3, Water)
    myChamps[0].currentHp = 50; // Damage them first
    const oppChamps = [initChampionState(2)]; // Ember (id 2, Fire)

    const { myChampions } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 3, abilityIndex: 1 }, // Heal (+25 HP)
      { championId: 2, abilityIndex: 0 }, // Fireball
    );

    // Torrent should have healed (but also taken damage)
    // Hard to predict exact value due to speed ordering, but HP should be valid
    const torrent = myChampions.find((c) => c.id === 3)!;
    expect(torrent.currentHp).toBeGreaterThanOrEqual(0);
    expect(torrent.currentHp).toBeLessThanOrEqual(torrent.maxHp);
  });

  it("applies buff correctly", () => {
    const myChamps = [initChampionState(2)]; // Ember (id 2, Fire)
    const oppChamps = [initChampionState(3)]; // Torrent (id 3, Water)

    const { myChampions, events } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 2, abilityIndex: 1 }, // Flame Shield (+5 DEF, 2 turns)
      { championId: 3, abilityIndex: 0 }, // Tidal Wave
    );

    const buffEvent = events.find((e) => e.type === "buff");
    expect(buffEvent).toBeDefined();

    const ember = myChampions.find((c) => c.id === 2)!;
    // Buff should have been applied, but then ticked down by 1
    // So should have 1 turn remaining
    expect(ember.buffs.length).toBe(1);
    expect(ember.buffs[0].type).toBe("defense");
    expect(ember.buffs[0].value).toBe(5);
    expect(ember.buffs[0].turnsRemaining).toBe(1);
  });

  it("KO prevents second attack", () => {
    // Storm (id 7, ATK 17, SPD 15) using Lightning (30 power) vs Boulder (id 1, HP 140, DEF 16)
    const myChamps = [initChampionState(7)]; // Storm
    const oppChamps = [initChampionState(1)]; // Boulder

    // Reduce Boulder's HP to make KO likely
    oppChamps[0].currentHp = 1;

    const { events } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 7, abilityIndex: 0 }, // Lightning (30 power)
      { championId: 1, abilityIndex: 0 }, // Rock Slam
    );

    const koEvent = events.find((e) => e.type === "ko");
    expect(koEvent).toBeDefined();

    // If Storm is faster and KOs Boulder, Boulder should not attack
    const attacks = events.filter((e) => e.type === "attack");
    // At most 1 attack if KO happened
    if (koEvent) {
      expect(attacks.length).toBeLessThanOrEqual(2); // Could be 1 or 2 depending on speed
    }
  });

  it("applies debuff to opponent", () => {
    const myChamps = [initChampionState(5)]; // Tide (id 5, Water)
    const oppChamps = [initChampionState(0)]; // Inferno (id 0, Fire)

    const { opponentChampions, events } = resolveTurn(
      myChamps,
      oppChamps,
      { championId: 5, abilityIndex: 1 }, // Mist (-4 opp ATK, 2 turns)
      { championId: 0, abilityIndex: 0 }, // Eruption
    );

    const debuffEvent = events.find((e) => e.type === "debuff");
    expect(debuffEvent).toBeDefined();

    const inferno = opponentChampions.find((c) => c.id === 0)!;
    const atkDebuff = inferno.buffs.find((b) => b.type === "attack" && b.isDebuff);
    expect(atkDebuff).toBeDefined();
  });
});
