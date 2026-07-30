import type { RoundResult } from '../data/types';
import { combatTuning } from '../config/combatTuning';

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

export const punchRushHitDamage = 5;
export const punchRushHitIntervalMs = 90;

export function punchRushRapidDamage(rage: number): number {
  return rage >= 4 ? 45 : punchRushDamage(rage);
}

export function punchRushHitCount(rage: number): number {
  return punchRushRapidDamage(rage) / punchRushHitDamage;
}

export function punchRushActiveDuration(rage: number): number {
  return punchRushHitCount(rage) * punchRushHitIntervalMs;
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
  return applyDamage(stats, combatTuning.voidFallDamage);
}

export function shouldApplyInterruptedTrade(
  attackWasSampled: boolean,
  attackStillActive: boolean,
): boolean {
  return attackWasSampled && !attackStillActive;
}

export function minigunBurstCount(sequence: number): 4 | 6 {
  return sequence > 0 && sequence % 3 === 0 ? 6 : 4;
}

export function shouldSwordSlamDive(elapsedMs: number, verticalVelocity: number): boolean {
  return elapsedMs >= 850 || verticalVelocity >= -20;
}

export function shouldSwordSlamLand(elapsedMs: number, grounded: boolean): boolean {
  return elapsedMs >= 140 && grounded;
}

export function swordWavePositions(
  originX: number,
  surfaceLeft: number,
  surfaceRight: number,
  step: number,
): number[] {
  const distance = 64 + step * 74;
  const edgePadding = 18;
  return [originX - distance, originX + distance]
    .filter((x) => x >= surfaceLeft + edgePadding && x <= surfaceRight - edgePadding);
}

export function facingTowardOpponent(
  fighterX: number,
  opponentX: number,
  currentFacing: -1 | 1,
): -1 | 1 {
  if (opponentX === fighterX) return currentFacing;
  return opponentX > fighterX ? 1 : -1;
}

export function swordSlamWeaponAngle(elapsedMs: number, descending: boolean): number {
  if (descending) return 132;
  const keyframes = [-13, 42, 77, 107, 132] as const;
  const progress = Math.max(0, Math.min(1, (elapsedMs - 740) / 110));
  const scaled = progress * (keyframes.length - 1);
  const frame = Math.min(keyframes.length - 2, Math.floor(scaled));
  const frameProgress = scaled - frame;
  return keyframes[frame] + (keyframes[frame + 1] - keyframes[frame]) * frameProgress;
}

export function screenCutPath(
  centerX: number,
  centerY: number,
  angle: number,
  width: number,
  height: number,
  inset: number,
): { startX: number; startY: number; endX: number; endY: number } {
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const candidates: number[] = [];
  if (Math.abs(directionX) > 0.0001) {
    candidates.push((inset - centerX) / directionX);
    candidates.push((width - inset - centerX) / directionX);
  }
  if (Math.abs(directionY) > 0.0001) {
    candidates.push((inset - centerY) / directionY);
    candidates.push((height - inset - centerY) / directionY);
  }
  const valid = candidates
    .map((distance) => ({
      distance,
      x: centerX + directionX * distance,
      y: centerY + directionY * distance,
    }))
    .filter((point) => point.x >= inset - 0.01 && point.x <= width - inset + 0.01
      && point.y >= inset - 0.01 && point.y <= height - inset + 0.01)
    .sort((a, b) => a.distance - b.distance);
  const start = valid[0];
  const end = valid[valid.length - 1];
  return {
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
  };
}

export function evenlySpacedCutAngle(
  index: number,
  count: number,
  baseAngle: number,
): number {
  return baseAngle + index * (Math.PI * 2 / count);
}
