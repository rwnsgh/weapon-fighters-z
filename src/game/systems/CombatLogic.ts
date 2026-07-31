import type { RoundResult } from '../data/types';

export interface CombatantStats {
  health: number;
  mana: number;
  maxHealth: number;
  maxMana: number;
  rage: number;
}

export function applyDamage(stats: CombatantStats, damage: number): CombatantStats {
  return { ...stats, health: Math.max(0, stats.health - Math.max(0, damage)) };
}

export function canUseMana(stats: CombatantStats, cost: number): boolean {
  return stats.mana >= cost;
}

export function spendMana(stats: CombatantStats, cost: number): CombatantStats {
  return canUseMana(stats, cost) ? { ...stats, mana: stats.mana - cost } : stats;
}

export function regenerateMana(
  stats: CombatantStats,
  perSecond: number,
  deltaSeconds: number,
): CombatantStats {
  return { ...stats, mana: Math.min(stats.maxMana, stats.mana + perSecond * deltaSeconds) };
}

export function addRage(stats: CombatantStats, amount: number): CombatantStats {
  return { ...stats, rage: Math.min(4, Math.max(0, stats.rage + amount)) };
}

export function punchRushDamage(rage: number): number {
  if (rage >= 4) return 60;
  if (rage >= 2) return 40;
  return 30;
}

export function consumeRage(stats: CombatantStats): CombatantStats {
  return { ...stats, rage: 0 };
}

export function determineRoundResult(p1Health: number, p2Health: number): RoundResult | null {
  if (p1Health <= 0 && p2Health <= 0) return 'draw';
  if (p1Health <= 0) return 'p2';
  if (p2Health <= 0) return 'p1';
  return null;
}

export function applyVoidFall(stats: CombatantStats): CombatantStats {
  return applyDamage(stats, 15);
}

export function shouldApplyInterruptedTrade(
  attackWasSampled: boolean,
  attackStillActive: boolean,
): boolean {
  return attackWasSampled && !attackStillActive;
}
