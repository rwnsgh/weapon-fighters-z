import { describe, expect, it } from 'vitest';
import { combatTuning } from '../config/combatTuning';
import { fighters } from './fighters';
import { voidPlatforms, type PlatformConfig } from './maps';

const horizontalOverlap = (a: PlatformConfig, b: PlatformConfig): number => {
  const aLeft = a.x - a.width / 2;
  const aRight = a.x + a.width / 2;
  const bLeft = b.x - b.width / 2;
  const bRight = b.x + b.width / 2;
  return Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
};

describe('void platform routes', () => {
  it('is perfectly mirrored so neither player spawn side is favored', () => {
    const [, upperLeft, upperRight, center, lowerLeft, lowerRight] = voidPlatforms;
    expect(upperLeft.y).toBe(upperRight.y);
    expect(upperLeft.width).toBe(upperRight.width);
    expect(upperLeft.x + upperRight.x).toBe(1280);
    expect(lowerLeft.y).toBe(lowerRight.y);
    expect(lowerLeft.width).toBe(lowerRight.width);
    expect(lowerLeft.x + lowerRight.x).toBe(1280);
    expect(center.x).toBe(640);
  });

  it.each(Object.values(fighters))('$name can climb from either lower side to the top', (fighter) => {
    const leftRoute = [voidPlatforms[4], voidPlatforms[3], voidPlatforms[1], voidPlatforms[0]];
    const rightRoute = [voidPlatforms[5], voidPlatforms[3], voidPlatforms[2], voidPlatforms[0]];
    const maximumJumpHeight = fighter.jumpVelocity ** 2 / (2 * combatTuning.gravityY);

    [leftRoute, rightRoute].forEach((route) => {
      route.slice(0, -1).forEach((platform, index) => {
        const next = route[index + 1];
        const surfaceGap = (platform.y - platform.height / 2) - (next.y - next.height / 2);
        expect(surfaceGap).toBeLessThanOrEqual(maximumJumpHeight - 5);
        expect(horizontalOverlap(platform, next)).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
