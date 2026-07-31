import { describe, expect, it } from 'vitest';
import {
  addRage,
  applyDamage,
  applyVoidFall,
  canUseMana,
  consumeRage,
  determineRoundResult,
  punchRushDamage,
  regenerateMana,
  shouldApplyInterruptedTrade,
  spendMana,
  type CombatantStats,
} from './CombatLogic';

const stats = (overrides: Partial<CombatantStats> = {}): CombatantStats => ({
  health: 100,
  mana: 20,
  maxHealth: 100,
  maxMana: 100,
  rage: 0,
  ...overrides,
});

describe('combat calculations', () => {
  it('applies damage without dropping below zero', () => {
    expect(applyDamage(stats(), 35).health).toBe(65);
    expect(applyDamage(stats({ health: 10 }), 35).health).toBe(0);
  });

  it('blocks a skill when mana is insufficient', () => {
    expect(canUseMana(stats({ mana: 24 }), 25)).toBe(false);
    expect(spendMana(stats({ mana: 24 }), 25).mana).toBe(24);
  });

  it('spends mana for a valid skill', () => {
    expect(spendMana(stats({ mana: 50 }), 30).mana).toBe(20);
  });

  it('regenerates mana at 8 per second and clamps to max', () => {
    expect(regenerateMana(stats({ mana: 20 }), 8, 2).mana).toBe(36);
    expect(regenerateMana(stats({ mana: 99 }), 8, 2).mana).toBe(100);
  });

  it('caps fist rage at four stacks', () => {
    expect(addRage(stats({ rage: 3 }), 2).rage).toBe(4);
  });

  it.each([
    [0, 30],
    [1, 30],
    [2, 40],
    [3, 40],
    [4, 60],
  ])('calculates punch rush total damage for %i stacks', (rage, damage) => {
    expect(punchRushDamage(rage)).toBe(damage);
  });

  it('clears rage after an ultimate', () => {
    expect(consumeRage(stats({ rage: 4 })).rage).toBe(0);
  });

  it('judges simultaneous KO as a draw', () => {
    expect(determineRoundResult(0, 0)).toBe('draw');
    expect(determineRoundResult(0, 10)).toBe('p2');
    expect(determineRoundResult(20, 0)).toBe('p1');
  });

  it('applies 15 void-fall damage', () => {
    expect(applyVoidFall(stats({ health: 34 })).health).toBe(19);
  });

  it('only preserves a simultaneous trade when the sampled attack was interrupted', () => {
    expect(shouldApplyInterruptedTrade(true, false)).toBe(true);
    expect(shouldApplyInterruptedTrade(true, true)).toBe(false);
    expect(shouldApplyInterruptedTrade(false, false)).toBe(false);
  });
});
