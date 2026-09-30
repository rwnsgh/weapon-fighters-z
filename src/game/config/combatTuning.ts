/**
 * Shared game-feel values. Keeping these separate from fighter frame data makes
 * movement and input changes easy to tune without creating character-specific
 * exceptions.
 */
export const combatTuning = {
  gravityY: 1650,
  groundAcceleration: 7.2,
  airAcceleration: 4.1,
  groundBraking: 1700,
  airBraking: 230,
  activeMoveDrag: 520,
  attackGroundDrag: 1800,
  attackAirDrag: 440,
  hitGroundDrag: 850,
  hitAirDrag: 230,
  coyoteMs: 120,
  jumpBufferMs: 140,
  attackBufferMs: 130,
  slowMoveScale: 0.78,
  meadowGroundTop: 580,
  meadowGroundHeight: 140,
  swordSlamLaunchVelocity: -600,
  swordSlamAscentGravityOffset: -958,
  swordSlamDiveVelocity: 820,
  swordBladeWaveCount: 3,
  swordBladeWaveStepMs: 115,
  swordSlamLandingLockMs: 345,
  swordUltimateTrailCount: 8,
  swordUltimateTrailStaggerMs: 60,
  swordUltimatePointTravelMs: 220,
  swordUltimateTrailClearMs: 670,
  swordUltimateHitMs: 685,
  swordUltimateTrailWidth: 6,
  swordUltimateTitleHoldMs: 670,
  voidFallDamage: 15,
  voidRespawnInvulnerabilityMs: 1000,
} as const;
