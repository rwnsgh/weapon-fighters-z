import { describe, expect, it } from 'vitest';
import { fighters } from './fighters';

describe('fighter roster', () => {
  it('contains the six fighters required by the proposal', () => {
    expect(Object.keys(fighters)).toEqual([
      'sword',
      'fist',
      'minigun',
      'clock',
      'plant',
      'rock',
    ]);
  });

  it.each(Object.values(fighters))('$name uses the shared health and mana rules', (fighter) => {
    expect(fighter.maxHealth).toBe(150);
    expect(fighter.maxMana).toBe(100);
    expect(fighter.startMana).toBe(100);
    expect(fighter.manaRegen).toBe(5);
    expect(fighter.basicAttack.manaCost).toBe(0);
    expect(fighter.skill.manaCost).toBeGreaterThan(0);
    expect(fighter.ultimate.manaCost).toBeGreaterThan(fighter.skill.manaCost);
  });

  it('keeps the proposal values for sword and fist', () => {
    expect(fighters.sword.basicAttack.damage).toBe(7);
    expect(fighters.sword.skill).toMatchObject({ damage: 20, manaCost: 30 });
    expect(fighters.sword.ultimate).toMatchObject({ damage: 10, manaCost: 75 });
    expect(fighters.fist.basicAttack.damage).toBe(10);
    expect(fighters.fist.skill).toMatchObject({
      damage: 20,
      manaCost: 25,
      startupMs: 0,
      knockbackY: -1160,
      lungeVelocity: 90,
    });
    expect(fighters.fist.ultimate.manaCost).toBe(60);
    expect(fighters.fist.ultimate.hitstunMs).toBe(500);
  });

  it('keeps the revised proposal values for the four completed fighters', () => {
    expect(fighters.minigun.basicAttack.damage).toBe(2);
    expect(fighters.minigun.basicAttack).toMatchObject({
      hitboxWidth: 648,
      hitboxOffsetX: 334,
      hitstunMs: 0,
      knockbackX: 0,
      knockbackY: 0,
      lungeVelocity: 0,
    });
    expect(fighters.minigun.ultimate.manaCost).toBe(80);
    expect(fighters.clock.basicAttack.damage).toBe(3);
    expect(fighters.clock.skill.manaCost).toBe(20);
    expect(fighters.clock.ultimate.manaCost).toBe(90);
    expect(fighters.plant.skill.manaCost).toBe(20);
    expect(fighters.plant.ultimate.manaCost).toBe(80);
    expect(fighters.rock.basicAttack.damage).toBe(7);
    expect(fighters.rock.skill.manaCost).toBe(30);
    expect(fighters.rock.ultimate.manaCost).toBe(60);
  });

  it.each(Object.values(fighters))('$name can reach every intended void platform step', (fighter) => {
    const gravity = 1650;
    const apexHeight = fighter.jumpVelocity ** 2 / (2 * gravity);
    const fullAirTime = (2 * fighter.jumpVelocity) / gravity;
    const horizontalReach = fighter.moveSpeed * fullAirTime;
    expect(apexHeight).toBeGreaterThanOrEqual(148);
    expect(apexHeight).toBeLessThan(160);
    expect(horizontalReach).toBeGreaterThan(220);
  });
});
