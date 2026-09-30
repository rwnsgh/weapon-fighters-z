import { describe, expect, it } from 'vitest';
import { combatTuning } from '../config/combatTuning';
import {
  addRage,
  applyDamage,
  applyVoidFall,
  canUseMana,
  consumeRage,
  determineRoundResult,
  evenlySpacedCutAngle,
  facingTowardOpponent,
  minigunBurstCount,
  punchRushActiveDuration,
  punchRushDamage,
  punchRushHitCount,
  punchRushRapidDamage,
  regenerateMana,
  screenCutPath,
  shouldApplyInterruptedTrade,
  shouldSwordSlamDive,
  shouldSwordSlamLand,
  spendMana,
  swordSlamWeaponAngle,
  swordWavePositions,
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

  it('reserves the last 15 damage for the four-stack finisher', () => {
    expect(punchRushRapidDamage(4)).toBe(45);
  });

  it.each([
    [0, 6, 540],
    [2, 8, 720],
    [4, 9, 810],
  ])('scales punch rush duration with total damage at %i stacks', (rage, hits, duration) => {
    expect(punchRushHitCount(rage)).toBe(hits);
    expect(punchRushActiveDuration(rage)).toBe(duration);
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

  it.each([
    [1, 4],
    [2, 4],
    [3, 6],
    [4, 4],
    [6, 6],
  ])('fires the correct minigun burst on attack %i', (sequence, bullets) => {
    expect(minigunBurstCount(sequence)).toBe(bullets);
  });

  it('switches the sword skill from ascent to dive at the apex or timeout', () => {
    expect(shouldSwordSlamDive(250, -320)).toBe(false);
    expect(shouldSwordSlamDive(250, -10)).toBe(true);
    expect(shouldSwordSlamDive(849, -200)).toBe(false);
    expect(shouldSwordSlamDive(850, -200)).toBe(true);
  });

  it('makes the sword slam rise higher while launching and diving more slowly', () => {
    const ascentGravity = combatTuning.gravityY + combatTuning.swordSlamAscentGravityOffset;
    const apexHeight = combatTuning.swordSlamLaunchVelocity ** 2 / (2 * ascentGravity);
    expect(ascentGravity).toBeGreaterThan(0);
    expect(apexHeight).toBeGreaterThanOrEqual(260);
    expect(apexHeight).toBeLessThan(261);
    expect(Math.abs(combatTuning.swordSlamLaunchVelocity)).toBeLessThan(760);
    expect(combatTuning.swordSlamDiveVelocity).toBeLessThan(1080);
  });

  it('ends the sword skill only after touching ground or a platform', () => {
    expect(shouldSwordSlamLand(500, false)).toBe(false);
    expect(shouldSwordSlamLand(80, true)).toBe(false);
    expect(shouldSwordSlamLand(500, true)).toBe(true);
  });

  it('clips sword waves to the current floor or platform edges', () => {
    expect(swordWavePositions(500, 200, 800, 1)).toEqual([362, 638]);
    expect(swordWavePositions(230, 200, 800, 1)).toEqual([368]);
    expect(swordWavePositions(500, 430, 570, 2)).toEqual([]);
  });

  it('locks the sword fighter until the final blade wave is summoned', () => {
    expect(combatTuning.swordSlamLandingLockMs).toBe(
      combatTuning.swordBladeWaveCount * combatTuning.swordBladeWaveStepMs,
    );
  });

  it('clears every sword ultimate trail immediately before applying damage', () => {
    const lastPointFinish = (combatTuning.swordUltimateTrailCount - 1)
      * combatTuning.swordUltimateTrailStaggerMs
      + combatTuning.swordUltimatePointTravelMs;
    expect(combatTuning.swordUltimateTrailClearMs).toBeGreaterThan(lastPointFinish);
    expect(combatTuning.swordUltimateTrailClearMs).toBeLessThan(1000);
    expect(combatTuning.swordUltimateHitMs).toBeGreaterThan(
      combatTuning.swordUltimateTrailClearMs,
    );
    expect(combatTuning.swordUltimateTrailWidth).toBe(6);
    expect(combatTuning.swordUltimateTitleHoldMs).toBe(170 + 500);
  });

  it('spreads eight sword-ultimate cuts evenly through every direction', () => {
    const angles = Array.from(
      { length: combatTuning.swordUltimateTrailCount },
      (_, index) => evenlySpacedCutAngle(index, combatTuning.swordUltimateTrailCount, 0.37),
    );
    const expectedStep = Math.PI / 4;
    expect(angles).toHaveLength(8);
    angles.slice(1).forEach((angle, index) => {
      expect(angle - angles[index]).toBeCloseTo(expectedStep, 8);
    });
  });

  it.each([0, Math.PI / 5, Math.PI / 2, Math.PI * 0.9, -Math.PI / 3])(
    'keeps a straight sword-ultimate path inside the screen at angle %f',
    (angle) => {
      const path = screenCutPath(640, 360, angle, 1280, 720, 28);
      [path.startX, path.endX].forEach((x) => {
        expect(x).toBeGreaterThanOrEqual(27.99);
        expect(x).toBeLessThanOrEqual(1252.01);
      });
      [path.startY, path.endY].forEach((y) => {
        expect(y).toBeGreaterThanOrEqual(27.99);
        expect(y).toBeLessThanOrEqual(692.01);
      });
    },
  );

  it('faces every fighter toward the opponent without jitter at the same x', () => {
    expect(facingTowardOpponent(200, 500, -1)).toBe(1);
    expect(facingTowardOpponent(500, 200, 1)).toBe(-1);
    expect(facingTowardOpponent(300, 300, -1)).toBe(-1);
  });

  it('rotates the sword through the five supplied slam poses', () => {
    expect(swordSlamWeaponAngle(739, false)).toBe(-13);
    expect(swordSlamWeaponAngle(767.5, false)).toBe(42);
    expect(swordSlamWeaponAngle(795, false)).toBe(77);
    expect(swordSlamWeaponAngle(822.5, false)).toBe(107);
    expect(swordSlamWeaponAngle(850, false)).toBe(132);
    expect(swordSlamWeaponAngle(300, true)).toBe(132);
  });
});
