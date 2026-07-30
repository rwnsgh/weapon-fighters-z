import Phaser from 'phaser';
import { combatTuning } from '../config/combatTuning';
import type { AttackConfig, AttackKind, FighterConfig } from '../data/types';
import {
  addRage,
  applyDamage,
  canUseMana,
  consumeRage,
  facingTowardOpponent,
  punchRushActiveDuration,
  punchRushHitCount,
  punchRushHitDamage,
  punchRushHitIntervalMs,
  regenerateMana,
  shouldSwordSlamDive,
  shouldSwordSlamLand,
  spendMana,
  swordSlamWeaponAngle,
  type CombatantStats,
} from '../systems/CombatLogic';

export type FighterState =
  | 'IDLE' | 'RUN' | 'JUMP' | 'FALL'
  | 'ATTACK' | 'SKILL' | 'ULTIMATE'
  | 'HITSTUN' | 'STUN' | 'KO' | 'RESPAWN_INVULNERABLE';
export type AttackPhase = 'startup' | 'active' | 'recovery';
export type FighterStatusEffect =
  | 'invulnerable'
  | 'haste'
  | 'attack-speed-up'
  | 'damage-up'
  | 'slow'
  | 'weakened'
  | 'move-speed-down'
  | 'burn'
  | 'stun';

export interface ActiveAttack {
  config: AttackConfig;
  kind: AttackKind;
  startedAt: number;
  id: string;
  phase: AttackPhase;
  direction: -1 | 1;
  hitTargets: Set<number>;
  hitTicks: Map<number, number>;
  sequence: number;
}

export class Fighter extends Phaser.Physics.Arcade.Sprite {
  readonly playerNumber: 1 | 2;
  readonly fighterConfig: FighterConfig;
  stats: CombatantStats;
  state: FighterState = 'IDLE';
  facing: -1 | 1;
  currentAttack?: ActiveAttack;
  controlEnabled = false;
  manaFlashUntil = 0;
  invulnerableUntil = 0;
  slowedUntil = 0;
  hastenedUntil = 0;
  enragedUntil = 0;
  timeStopUntil = 0;
  movementMultiplier = 1;
  damageMultiplier = 1;
  lastDamageTaken = 0;
  private stateUntil = 0;
  private attackCounter = 0;
  private basicCounter = 0;
  private lastGrounded = false;
  private jumpBufferedUntil = 0;
  private coyoteUntil = 0;
  private bufferedAttack?: { kind: AttackKind; expiresAt: number };
  private jumpCutApplied = false;
  private burnUntil = 0;
  private nextBurnAt = 0;
  private burnAttacker?: Fighter;
  private frozenUntil = 0;
  private swordSlamDescending = false;
  private swordSlamLockedUntil = 0;
  private uppercutRiseLocked = false;
  private uppercutRecoilUntil = 0;
  readonly displayTint: number;
  readonly weapon: Phaser.GameObjects.Image;
  readonly minigunGrip?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: FighterConfig,
    playerNumber: 1 | 2,
    tint: number,
  ) {
    super(scene, x, y, 'fighter-body');
    this.playerNumber = playerNumber;
    this.fighterConfig = config;
    this.displayTint = tint;
    this.facing = playerNumber === 1 ? 1 : -1;
    this.stats = {
      health: config.maxHealth,
      mana: config.startMana,
      maxHealth: config.maxHealth,
      maxMana: config.maxMana,
      rage: 0,
    };
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setName(`fighter-body-${playerNumber}`);
    this.weapon = scene.add.image(x, y - 22, `weapon-${config.id}`)
      .setOrigin(0.12, 0.5)
      .setTint(tint)
      .setName(`fighter-weapon-${playerNumber}`)
      .setDepth(11);
    if (config.id === 'minigun') {
      this.minigunGrip = scene.add.image(x, y - 28, 'weapon-minigun-grip')
        .setOrigin(1, 0.5)
        .setTint(tint)
        .setName(`fighter-minigun-grip-${playerNumber}`)
        .setDepth(12);
    }
    this.setTint(tint);
    this.setOrigin(0.5, 1);
    this.setCollideWorldBounds(false);
    this.setDepth(10);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(40, 40).setOffset(2, 4);
    body.setMaxVelocity(620, 900);
  }

  get bodyRef(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  resetForRound(x: number, y: number, facing: -1 | 1): void {
    this.setPosition(x, y).setVelocity(0, 0).setAlpha(1).clearTint();
    this.setTint(this.displayTint);
    this.stats = {
      health: this.fighterConfig.maxHealth,
      mana: this.fighterConfig.startMana,
      maxHealth: this.fighterConfig.maxHealth,
      maxMana: this.fighterConfig.maxMana,
      rage: 0,
    };
    this.facing = facing;
    this.state = 'IDLE';
    this.currentAttack = undefined;
    this.controlEnabled = false;
    this.invulnerableUntil = 0;
    this.slowedUntil = 0;
    this.hastenedUntil = 0;
    this.enragedUntil = 0;
    this.timeStopUntil = 0;
    this.movementMultiplier = 1;
    this.damageMultiplier = 1;
    this.basicCounter = 0;
    this.burnUntil = 0;
    this.burnAttacker = undefined;
    this.frozenUntil = 0;
    this.swordSlamDescending = false;
    this.swordSlamLockedUntil = 0;
    this.uppercutRiseLocked = false;
    this.uppercutRecoilUntil = 0;
    this.jumpBufferedUntil = 0;
    this.coyoteUntil = 0;
    this.bufferedAttack = undefined;
    this.slowedUntil = 0;
    this.jumpCutApplied = false;
    this.bodyRef.enable = true;
    this.bodyRef.setGravityY(0);
    this.updateWeaponPose();
  }

  updateFighter(
    now: number,
    delta: number,
    opponentX: number,
    input: { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean },
  ): void {
    this.updateAttack(now);
    this.stats = regenerateMana(this.stats, this.fighterConfig.manaRegen, delta / 1000);
    this.updateBurn(now);

    if (this.state === 'KO') {
      this.updateWeaponPose();
      return;
    }
    if (now > this.invulnerableUntil && this.state === 'RESPAWN_INVULNERABLE') {
      this.state = 'FALL';
      this.setAlpha(1);
    } else if (this.state === 'RESPAWN_INVULNERABLE') {
      this.setAlpha(Math.floor(now / 90) % 2 === 0 ? 0.3 : 0.75);
    }
    if (this.uppercutRiseLocked && this.bodyRef.velocity.y >= 0) {
      this.uppercutRiseLocked = false;
    }
    if ((this.state === 'HITSTUN' || this.state === 'STUN')
      && now >= this.stateUntil
      && !this.uppercutRiseLocked) {
      this.state = this.bodyRef.blocked.down ? 'IDLE' : 'FALL';
    }
    let swordSlamLandingLocked = now < this.swordSlamLockedUntil;
    if (!swordSlamLandingLocked && this.state === 'SKILL' && !this.currentAttack) {
      this.state = 'IDLE';
    }
    if (this.bufferedAttack && now > this.bufferedAttack.expiresAt) {
      this.bufferedAttack = undefined;
    }
    if (this.bufferedAttack && this.canStartAttack()) {
      const { kind } = this.bufferedAttack;
      this.bufferedAttack = undefined;
      this.startAttack(kind, now);
    }
    if (now < this.frozenUntil) {
      this.bodyRef.setAllowGravity(false);
      this.setVelocity(0, 0);
    } else {
      this.bodyRef.setAllowGravity(true);
    }

    if (this.state !== 'HITSTUN' && this.state !== 'STUN') {
      this.facing = facingTowardOpponent(this.x, opponentX, this.facing);
      if (this.currentAttack) this.currentAttack.direction = this.facing;
    }
    this.setFlipX(this.facing < 0);

    const grounded = this.bodyRef.blocked.down || this.bodyRef.touching.down;
    const swordSlam = this.currentAttack?.config.id === 'sword-slam'
      ? this.currentAttack
      : undefined;
    if (swordSlam && shouldSwordSlamLand(now - swordSlam.startedAt, grounded)) {
      this.currentAttack = undefined;
      this.swordSlamDescending = false;
      this.swordSlamLockedUntil = now + combatTuning.swordSlamLandingLockMs;
      swordSlamLandingLocked = true;
      this.bodyRef.setGravityY(0);
      this.state = 'SKILL';
      this.setVelocity(0, 0);
      this.emit('sword-slam-land', swordSlam);
    }
    if (grounded) this.coyoteUntil = now + combatTuning.coyoteMs;
    if (input.jumpPressed) {
      this.jumpBufferedUntil = now + combatTuning.jumpBufferMs;
      this.jumpCutApplied = false;
    }
    const mobileMinigunBurst = this.currentAttack?.config.id === 'minigun-burst';
    const actionLocked = (this.currentAttack && !mobileMinigunBurst) || swordSlamLandingLocked
      || this.state === 'HITSTUN' || this.state === 'STUN';
    if (swordSlamLandingLocked) {
      this.setAcceleration(0, 0);
      this.setVelocity(0, 0);
      this.setDragX(combatTuning.attackGroundDrag);
    } else if (this.controlEnabled && swordSlam && this.currentAttack) {
      const slowScale = now < this.slowedUntil ? combatTuning.slowMoveScale : 1;
      const direction = Number(input.right) - Number(input.left);
      const maxMoveSpeed = this.fighterConfig.moveSpeed * slowScale;
      this.setAccelerationX(
        direction * this.fighterConfig.moveSpeed * combatTuning.airAcceleration * slowScale,
      );
      this.setDragX(direction === 0 ? combatTuning.airBraking : combatTuning.activeMoveDrag);
      if (Math.abs(this.bodyRef.velocity.x) > maxMoveSpeed) {
        this.setVelocityX(Phaser.Math.Clamp(this.bodyRef.velocity.x, -maxMoveSpeed, maxMoveSpeed));
      }
      if (this.swordSlamDescending
        && this.bodyRef.velocity.y < combatTuning.swordSlamDiveVelocity) {
        this.setVelocityY(combatTuning.swordSlamDiveVelocity);
      }
    } else if (
      this.controlEnabled
      && this.currentAttack?.config.id === 'fist-uppercut'
      && !grounded
    ) {
      const slowScale = now < this.slowedUntil ? combatTuning.slowMoveScale : 1;
      const direction = Number(input.right) - Number(input.left);
      const maxMoveSpeed = this.fighterConfig.moveSpeed * slowScale;
      this.setAccelerationX(
        direction * this.fighterConfig.moveSpeed * combatTuning.airAcceleration * slowScale,
      );
      this.setDragX(direction === 0 ? combatTuning.airBraking : combatTuning.activeMoveDrag);
      if (Math.abs(this.bodyRef.velocity.x) > maxMoveSpeed) {
        this.setVelocityX(Phaser.Math.Clamp(this.bodyRef.velocity.x, -maxMoveSpeed, maxMoveSpeed));
      }
    } else if (this.controlEnabled && !actionLocked && this.state !== 'RESPAWN_INVULNERABLE') {
      const slowScale = now < this.slowedUntil ? combatTuning.slowMoveScale : 1;
      const hasteScale = now < this.hastenedUntil ? 1.5 : 1;
      const speedScale = slowScale * hasteScale * this.movementMultiplier;
      const direction = Number(input.right) - Number(input.left);
      const acceleration = this.fighterConfig.moveSpeed
        * (grounded ? combatTuning.groundAcceleration : combatTuning.airAcceleration)
        * speedScale;
      this.setAccelerationX(direction * acceleration);
      this.setDragX(direction === 0
        ? (grounded ? combatTuning.groundBraking : combatTuning.airBraking)
        : combatTuning.activeMoveDrag);
      const maxMoveSpeed = this.fighterConfig.moveSpeed * speedScale;
      if (Math.abs(this.bodyRef.velocity.x) > maxMoveSpeed) {
        this.setVelocityX(Phaser.Math.Clamp(this.bodyRef.velocity.x, -maxMoveSpeed, maxMoveSpeed));
      }
      if (this.jumpBufferedUntil >= now && this.coyoteUntil >= now) {
        this.setVelocityY(-this.fighterConfig.jumpVelocity);
        this.jumpBufferedUntil = 0;
        this.coyoteUntil = 0;
        this.jumpCutApplied = false;
        this.state = 'JUMP';
        this.emit('jump');
      } else if (grounded) {
        this.state = direction === 0 ? 'IDLE' : 'RUN';
      }
      if (!input.jumpHeld && this.bodyRef.velocity.y < -160 && !this.jumpCutApplied) {
        this.setVelocityY(this.bodyRef.velocity.y * 0.55);
        this.jumpCutApplied = true;
      }
    } else if (actionLocked && this.currentAttack) {
      this.setAccelerationX(0);
      this.setDragX(grounded ? combatTuning.attackGroundDrag : combatTuning.attackAirDrag);
      const lunge = now < this.uppercutRecoilUntil
        ? -220
        : this.currentAttack.phase === 'active'
          ? this.currentAttack.config.lungeVelocity ?? 0
          : 0;
      this.setVelocityX(this.currentAttack.direction * lunge);
    } else {
      this.setAccelerationX(0);
      this.setDragX(grounded ? combatTuning.hitGroundDrag : combatTuning.hitAirDrag);
    }

    if (!grounded && !this.currentAttack && !swordSlamLandingLocked
      && this.state !== 'HITSTUN' && this.state !== 'STUN'
      && this.state !== 'RESPAWN_INVULNERABLE') {
      this.state = this.bodyRef.velocity.y < 0 ? 'JUMP' : 'FALL';
    }
    if (grounded && !this.lastGrounded && this.state === 'FALL') this.state = 'IDLE';
    this.lastGrounded = grounded;
    this.updatePose();
    this.updateWeaponPose();
  }

  tryAttack(kind: AttackKind, now: number): boolean {
    if (!this.controlEnabled || this.state === 'KO' || this.state === 'RESPAWN_INVULNERABLE') {
      return false;
    }
    if (!this.canStartAttack()) {
      this.bufferedAttack = { kind, expiresAt: now + combatTuning.attackBufferMs };
      return false;
    }
    return this.startAttack(kind, now);
  }

  private canStartAttack(): boolean {
    return !this.currentAttack
      && this.scene.time.now >= this.swordSlamLockedUntil
      && this.state !== 'HITSTUN'
      && this.state !== 'STUN';
  }

  private startAttack(kind: AttackKind, now: number): boolean {
    const base = kind === 'basic'
      ? this.fighterConfig.basicAttack
      : kind === 'skill'
        ? this.fighterConfig.skill
        : this.fighterConfig.ultimate;

    let config = base;
    let sequence = 0;
    if (kind === 'basic') {
      this.basicCounter += 1;
      sequence = this.basicCounter;
    }
    if (kind === 'ultimate' && (this.fighterConfig.id === 'fist' || this.fighterConfig.id === 'clock')) {
      sequence = this.stats.rage;
    }
    if (kind === 'ultimate' && this.fighterConfig.id === 'fist') {
      config = {
        ...base,
        damage: punchRushHitDamage,
        activeMs: punchRushActiveDuration(this.stats.rage),
      };
    } else if (kind === 'basic' && this.fighterConfig.id === 'clock' && now < this.timeStopUntil) {
      config = {
        ...base,
        id: 'clock-minute-hand',
        name: '분침 연사',
        damage: 1,
        startupMs: 20,
        activeMs: 55,
        recoveryMs: 25,
        hitboxWidth: 720,
        hitboxHeight: 70,
        hitboxOffsetX: 370,
      };
    } else if (this.fighterConfig.id === 'rock' && now < this.enragedUntil && kind === 'basic') {
      config = {
        ...base,
        id: 'rock-lava-punch',
        name: '용암 주먹',
        damage: 10,
        startupMs: 95,
        activeMs: 110,
        recoveryMs: 210,
        hitboxWidth: 84,
        hitboxHeight: 72,
        hitboxOffsetX: 52,
      };
    } else if (this.fighterConfig.id === 'rock' && now < this.enragedUntil && kind === 'skill') {
      config = { ...base, manaCost: Math.ceil(base.manaCost * 1.5) };
    }

    if (!canUseMana(this.stats, config.manaCost)) {
      this.manaFlashUntil = now + 420;
      this.emit('mana-empty');
      return false;
    }

    if (kind === 'ultimate' && this.fighterConfig.id === 'fist') {
      this.stats = consumeRage(this.stats);
    } else if (kind === 'skill' && this.fighterConfig.id === 'clock') {
      this.hastenedUntil = now + 5000;
    } else if (kind === 'ultimate' && this.fighterConfig.id === 'clock') {
      const duration = 1000 + Math.min(4, this.stats.rage) * 1000;
      this.timeStopUntil = now + config.startupMs + duration;
      this.stats = consumeRage(this.stats);
    } else if (kind === 'ultimate' && this.fighterConfig.id === 'rock') {
      this.enragedUntil = now + 10000;
    }
    this.stats = spendMana(this.stats, config.manaCost);
    const startsActive = config.startupMs === 0;
    this.currentAttack = {
      config,
      kind,
      startedAt: now,
      id: `${this.playerNumber}-${config.id}-${this.attackCounter += 1}`,
      phase: startsActive ? 'active' : 'startup',
      direction: this.facing,
      hitTargets: new Set(),
      hitTicks: new Map(),
      sequence,
    };
    if (config.id === 'sword-slam') {
      this.swordSlamDescending = false;
      this.bodyRef.setGravityY(combatTuning.swordSlamAscentGravityOffset);
      this.setVelocityY(combatTuning.swordSlamLaunchVelocity);
      this.setAccelerationY(0);
    } else if (config.id === 'fist-uppercut') {
      this.setVelocityY(-679);
      this.setAccelerationY(0);
      this.jumpCutApplied = true;
    }
    this.state = kind === 'basic' ? 'ATTACK' : kind === 'skill' ? 'SKILL' : 'ULTIMATE';
    this.emit('attack-start', kind);
    if (startsActive) this.emit('attack-active', kind);
    return true;
  }

  private updateAttack(now: number): void {
    const attack = this.currentAttack;
    if (!attack) return;
    if (attack.config.id === 'sword-slam') {
      const elapsed = now - attack.startedAt;
      if (!this.swordSlamDescending && shouldSwordSlamDive(elapsed, this.bodyRef.velocity.y)) {
        this.swordSlamDescending = true;
        attack.phase = 'active';
        this.bodyRef.setGravityY(0);
        this.setVelocityY(combatTuning.swordSlamDiveVelocity);
        this.emit('attack-active', attack.kind);
        this.emit('sword-slam-dive');
      }
      return;
    }
    const speed = now < this.hastenedUntil ? 1.5 : 1;
    const elapsed = (now - attack.startedAt) * speed;
    const activeEnd = attack.config.startupMs + attack.config.activeMs;
    const total = activeEnd + attack.config.recoveryMs;
    const nextPhase: AttackPhase = elapsed < attack.config.startupMs
      ? 'startup'
      : elapsed < activeEnd ? 'active' : 'recovery';
    if (attack.phase !== nextPhase) {
      attack.phase = nextPhase;
      if (nextPhase === 'active') this.emit('attack-active', attack.kind);
    }
    if (elapsed >= total) {
      this.currentAttack = undefined;
      this.state = this.bodyRef.blocked.down ? 'IDLE' : 'FALL';
      this.setScale(1);
      this.setAngle(0);
    }
  }

  getWeaponHitbox(): Phaser.Geom.Rectangle | null {
    const attack = this.currentAttack;
    if (!attack || attack.phase !== 'active') return null;
    const { config, direction } = attack;
    if (config.id === 'sword-screen-slash') return null;
    if (config.damage <= 0) return null;
    const centerX = this.x + config.hitboxOffsetX * direction;
    const centerY = this.y - 24 + config.hitboxOffsetY;
    return new Phaser.Geom.Rectangle(
      centerX - config.hitboxWidth / 2,
      centerY - config.hitboxHeight / 2,
      config.hitboxWidth,
      config.hitboxHeight,
    );
  }

  getBodyHurtbox(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - 20, this.y - 40, 40, 40);
  }

  getHitbox(): Phaser.Geom.Rectangle | null {
    return this.getWeaponHitbox();
  }

  getHurtbox(): Phaser.Geom.Rectangle {
    return this.getBodyHurtbox();
  }

  getStatusEffects(now: number): FighterStatusEffect[] {
    const effects: FighterStatusEffect[] = [];
    if (now < this.invulnerableUntil) effects.push('invulnerable');
    if (now < this.hastenedUntil || this.movementMultiplier > 1) effects.push('haste');
    if (now < this.hastenedUntil) effects.push('attack-speed-up');
    if (now < this.enragedUntil || this.damageMultiplier > 1) effects.push('damage-up');
    if (now < this.slowedUntil) effects.push('slow');
    if (this.damageMultiplier < 1) effects.push('weakened');
    if (this.movementMultiplier < 1) effects.push('move-speed-down');
    if (now < this.burnUntil) effects.push('burn');
    if ((this.state === 'STUN' || this.state === 'HITSTUN') && now < this.stateUntil) {
      effects.push('stun');
    }
    return effects;
  }

  receiveHit(attacker: Fighter, now: number): boolean {
    const attack = attacker.currentAttack;
    if (!attack) return false;
    return this.receiveAttackSnapshot(attacker, attack, now);
  }

  receiveAttackSnapshot(attacker: Fighter, attack: ActiveAttack, now: number): boolean {
    const punchRush = attack.config.id === 'fist-rush';
    const rushTick = punchRush
      ? Math.floor((now - attack.startedAt - attack.config.startupMs) / punchRushHitIntervalMs)
      : -1;
    const rushHitCount = punchRush ? punchRushHitCount(attack.sequence) : 0;
    if (now < this.invulnerableUntil) return false;
    if (punchRush) {
      if (rushTick < 0
        || rushTick >= rushHitCount
        || attack.hitTicks.get(this.playerNumber) === rushTick) return false;
      attack.hitTicks.set(this.playerNumber, rushTick);
    } else {
      if (attack.hitTargets.has(this.playerNumber)) return false;
      attack.hitTargets.add(this.playerNumber);
    }
    const uppercut = attack.config.id === 'fist-uppercut';
    const finisherPending = punchRush && attack.sequence >= 4 && rushTick === rushHitCount - 1;
    const finalRushHit = punchRush && attack.sequence < 4 && rushTick === rushHitCount - 1;
    const hit = this.receiveDamage(
      attack.config.damage,
      finisherPending
        ? 340
        : punchRush && !finalRushHit ? punchRushHitIntervalMs + 35 : attack.config.hitstunMs,
      punchRush && !finalRushHit ? 0 : attack.config.knockbackX * attack.direction,
      punchRush && !finalRushHit ? 0 : attack.config.knockbackY,
      now,
      attacker,
      attack.kind,
      attack.config.id === 'minigun-burst',
    );
    if (hit && uppercut && this.state !== 'KO') {
      this.uppercutRiseLocked = true;
      attacker.applyUppercutRecoil(attack.direction, now);
    }
    return hit;
  }

  private applyUppercutRecoil(direction: -1 | 1, now: number): void {
    if (this.state === 'KO') return;
    this.uppercutRecoilUntil = Math.max(this.uppercutRecoilUntil, now + 260);
    this.setVelocityX(direction * -220);
  }

  receiveBonusHit(
    damage: number,
    knockbackX: number,
    knockbackY: number,
    now: number,
    attacker: Fighter,
    stunMs = 160,
    attackKind?: AttackKind,
    allowMovement = false,
  ): boolean {
    if (now < this.invulnerableUntil || this.state === 'KO') return false;
    return this.receiveDamage(
      damage,
      stunMs,
      knockbackX,
      knockbackY,
      now,
      attacker,
      attackKind,
      allowMovement,
    );
  }

  private receiveDamage(
    damage: number,
    hitstunMs: number,
    knockbackX: number,
    knockbackY: number,
    now: number,
    attacker: Fighter,
    attackKind?: AttackKind,
    allowMovement = false,
  ): boolean {
    const appliedDamage = Math.max(0, damage * attacker.damageMultiplier);
    this.lastDamageTaken = appliedDamage;
    this.stats = applyDamage(this.stats, appliedDamage);
    const defeated = this.stats.health <= 0;
    if (!allowMovement || defeated) {
      this.currentAttack = undefined;
      this.swordSlamDescending = false;
      this.swordSlamLockedUntil = 0;
      this.uppercutRiseLocked = false;
      this.uppercutRecoilUntil = 0;
      this.bodyRef.setGravityY(0);
      this.bufferedAttack = undefined;
      this.setVelocity(knockbackX, knockbackY);
      this.state = defeated ? 'KO' : 'HITSTUN';
      this.stateUntil = now + hitstunMs;
      if (defeated) this.setVelocity(knockbackX * 1.2, Math.min(knockbackY, -300));
    }
    if (attacker.fighterConfig.id === 'fist') {
      const gain = attackKind === 'skill' ? 2 : attackKind === 'basic' ? 1 : 0;
      attacker.stats = addRage(attacker.stats, gain);
      if (attackKind === 'skill') this.slowedUntil = now + 3000;
    }
    if (attacker.fighterConfig.id === 'clock'
      && attacker.currentAttack?.config.id === 'clock-wave'
      && attackKind === 'basic') {
      attacker.stats = addRage(attacker.stats, 1);
    }
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(75, () => {
      if (this.active) {
        this.clearTint().setTint(this.displayTint);
      }
    });
    this.emit('damaged', appliedDamage, attacker);
    return true;
  }

  applyStun(now: number, durationMs: number, freeze = false): void {
    if (this.state === 'KO') return;
    this.currentAttack = undefined;
    this.swordSlamDescending = false;
    this.swordSlamLockedUntil = 0;
    this.uppercutRiseLocked = false;
    this.uppercutRecoilUntil = 0;
    this.bodyRef.setGravityY(0);
    this.state = 'STUN';
    this.stateUntil = Math.max(this.stateUntil, now + durationMs);
    this.setAccelerationX(0);
    if (freeze) {
      this.frozenUntil = Math.max(this.frozenUntil, now + durationMs);
      this.setVelocity(0, 0);
    } else {
      this.setVelocityX(0);
    }
  }

  applyBurn(attacker: Fighter, now: number, durationMs: number): void {
    if (this.state === 'KO') return;
    this.burnAttacker = attacker;
    this.burnUntil = now + durationMs;
    this.nextBurnAt = now + 200;
  }

  applyVoidFall(now: number): void {
    this.bodyRef.setGravityY(0);
    this.currentAttack = undefined;
    this.swordSlamDescending = false;
    this.swordSlamLockedUntil = 0;
    this.stats = applyDamage(this.stats, combatTuning.voidFallDamage);
    if (this.stats.health <= 0) {
      this.state = 'KO';
      this.setPosition(640, 180).setVelocity(0, 0);
      return;
    }
    this.setPosition(this.playerNumber === 1 ? 580 : 700, 170).setVelocity(0, 0);
    this.invulnerableUntil = now + combatTuning.voidRespawnInvulnerabilityMs;
    this.state = 'RESPAWN_INVULNERABLE';
  }

  private updatePose(): void {
    this.setAngle(0);
    if (this.currentAttack?.config.id === 'sword-slam') this.setScale(1);
    else if (this.currentAttack?.phase === 'startup') this.setScale(0.92, 1.06);
    else if (this.currentAttack?.phase === 'active') this.setScale(1.18, 0.94);
    else this.setScale(1);
  }

  private updateBurn(now: number): void {
    if (!this.burnAttacker || now >= this.burnUntil || this.state === 'KO') {
      if (now >= this.burnUntil) this.burnAttacker = undefined;
      return;
    }
    if (now < this.nextBurnAt) return;
    this.nextBurnAt += 200;
    const damage = Math.max(0, this.burnAttacker.damageMultiplier);
    this.stats = applyDamage(this.stats, damage);
    this.lastDamageTaken = damage;
    if (this.stats.health <= 0) this.state = 'KO';
    this.emit('dot-damage', damage, this.burnAttacker);
  }

  private updateWeaponPose(): void {
    const id = this.fighterConfig.id;
    const idleAngles = { sword: -28, fist: 12, minigun: 0, clock: -18, plant: -20, rock: -34 };
    const idleReach = { sword: 10, fist: -3, minigun: 14, clock: 9, plant: 9, rock: 8 };
    let angle = idleAngles[id];
    let reach = idleReach[id];
    // The flipped idle pose mounts the minigun above the fighter centre,
    // with the grip pointing back toward the lower-left.
    let vertical = id === 'minigun' ? -12 : id === 'fist' ? -10 : -23;
    let weaponScale = id === 'rock'
      ? 0.94
      : id === 'fist'
        ? 0.84
        : id === 'minigun'
          ? 0.616
          : 0.88;

    if (id === 'sword' && this.scene.time.now < this.swordSlamLockedUntil) {
      angle = 132;
      reach = 38;
      vertical = -28;
      weaponScale = 1.05;
    } else if (
      id === 'fist'
      && this.currentAttack?.kind === 'basic'
    ) {
      const attack = this.currentAttack;
      const elapsed = this.scene.time.now - attack.startedAt;
      const centerReach = 0;
      const centerVertical = -22;
      const textureForwardExtent = 27;
      const hitboxEnd = attack.config.hitboxOffsetX + attack.config.hitboxWidth / 2;
      const fullyExtendedReach = hitboxEnd - textureForwardExtent;

      if (attack.phase === 'startup') {
        const progress = Phaser.Math.Clamp(elapsed / attack.config.startupMs, 0, 1);
        reach = Phaser.Math.Linear(idleReach.fist, centerReach, progress);
        vertical = Phaser.Math.Linear(-10, centerVertical, progress);
        angle = Phaser.Math.Linear(idleAngles.fist, 0, progress);
        weaponScale *= Phaser.Math.Linear(1, 0.9, progress);
      } else if (attack.phase === 'active') {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs) / attack.config.activeMs,
          0,
          1,
        );
        reach = Phaser.Math.Linear(centerReach, fullyExtendedReach, progress);
        vertical = centerVertical;
        angle = 0;
        weaponScale *= Phaser.Math.Linear(0.9, 1.18, progress);
      } else {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs - attack.config.activeMs)
            / attack.config.recoveryMs,
          0,
          1,
        );
        reach = Phaser.Math.Linear(fullyExtendedReach, idleReach.fist, progress);
        vertical = Phaser.Math.Linear(centerVertical, -10, progress);
        angle = Phaser.Math.Linear(0, idleAngles.fist, progress);
        weaponScale *= Phaser.Math.Linear(1.18, 1, progress);
      }
    } else if (
      id === 'fist'
      && this.currentAttack?.config.id === 'fist-uppercut'
    ) {
      const attack = this.currentAttack;
      const elapsed = this.scene.time.now - attack.startedAt;
      const path = [
        { reach: -3, vertical: -10, angle: 12 },
        { reach: 12, vertical: -12, angle: 4 },
        { reach: 26, vertical: -26, angle: -18 },
        { reach: 30, vertical: -43, angle: -38 },
        { reach: 22, vertical: -66, angle: -58 },
      ];
      const samplePath = (progress: number) => {
        const scaled = Phaser.Math.Clamp(progress, 0, 1) * (path.length - 1);
        const index = Math.min(path.length - 2, Math.floor(scaled));
        const localProgress = scaled - index;
        return {
          reach: Phaser.Math.Linear(path[index].reach, path[index + 1].reach, localProgress),
          vertical: Phaser.Math.Linear(
            path[index].vertical,
            path[index + 1].vertical,
            localProgress,
          ),
          angle: Phaser.Math.Linear(path[index].angle, path[index + 1].angle, localProgress),
        };
      };

      if (attack.phase === 'startup') {
        const progress = Phaser.Math.Clamp(elapsed / attack.config.startupMs, 0, 1);
        const pose = samplePath(progress * 0.25);
        ({ reach, vertical, angle } = pose);
      } else if (attack.phase === 'active') {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs) / attack.config.activeMs,
          0,
          1,
        );
        const pose = samplePath(0.25 + progress * 0.75);
        ({ reach, vertical, angle } = pose);
        weaponScale *= Phaser.Math.Linear(1, 1.08, progress);
      } else {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs - attack.config.activeMs)
            / attack.config.recoveryMs,
          0,
          1,
        );
        reach = Phaser.Math.Linear(path[4].reach, idleReach.fist, progress);
        vertical = Phaser.Math.Linear(path[4].vertical, -10, progress);
        angle = Phaser.Math.Linear(path[4].angle, idleAngles.fist, progress);
        weaponScale *= Phaser.Math.Linear(1.08, 1, progress);
      }
    } else if (
      id === 'fist'
      && this.currentAttack?.config.id === 'fist-rush'
      && this.currentAttack.sequence >= 4
      && this.currentAttack.phase === 'recovery'
    ) {
      const attack = this.currentAttack;
      const elapsed = this.scene.time.now - attack.startedAt
        - attack.config.startupMs - attack.config.activeMs;
      const progress = Phaser.Math.Clamp(elapsed / attack.config.recoveryMs, 0, 1);
      const textureForwardExtent = 27;
      const hitboxEnd = attack.config.hitboxOffsetX + attack.config.hitboxWidth / 2;
      const fullyExtendedReach = hitboxEnd - textureForwardExtent;
      if (progress < 0.25) {
        const summon = progress / 0.25;
        reach = Phaser.Math.Linear(idleReach.fist, -26, summon);
        vertical = Phaser.Math.Linear(-10, -28, summon);
        angle = Phaser.Math.Linear(idleAngles.fist, -10, summon);
        weaponScale *= Phaser.Math.Linear(0.25, 0.9, summon);
      } else if (progress < 0.58) {
        const strike = Phaser.Math.Easing.Cubic.Out((progress - 0.25) / 0.33);
        reach = Phaser.Math.Linear(-26, fullyExtendedReach, strike);
        vertical = Phaser.Math.Linear(-28, -22, strike);
        angle = Phaser.Math.Linear(-10, 0, strike);
        weaponScale *= Phaser.Math.Linear(0.9, 1.3, strike);
      } else {
        const recover = (progress - 0.58) / 0.42;
        reach = Phaser.Math.Linear(fullyExtendedReach, idleReach.fist, recover);
        vertical = Phaser.Math.Linear(-22, -10, recover);
        angle = Phaser.Math.Linear(0, idleAngles.fist, recover);
        weaponScale *= Phaser.Math.Linear(1.3, 1, recover);
      }
    } else if (
      id === 'minigun'
      && this.currentAttack?.kind === 'basic'
    ) {
      const attack = this.currentAttack;
      const elapsed = this.scene.time.now - attack.startedAt;
      if (attack.phase === 'startup') {
        const progress = Phaser.Math.Clamp(elapsed / attack.config.startupMs, 0, 1);
        reach = Phaser.Math.Linear(idleReach.minigun, 17, progress);
        vertical = Phaser.Math.Linear(-12, -11, progress);
        angle = Phaser.Math.Linear(idleAngles.minigun, 2, progress);
      } else if (attack.phase === 'active') {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs) / attack.config.activeMs,
          0,
          1,
        );
        const recoil = Math.sin(progress * Math.PI * 8);
        reach = 17.5 + recoil * 0.35;
        vertical = -11 + recoil * 0.3;
        angle = 2 + recoil * 0.5;
        weaponScale *= 1.015;
      } else {
        const progress = Phaser.Math.Clamp(
          (elapsed - attack.config.startupMs - attack.config.activeMs)
            / attack.config.recoveryMs,
          0,
          1,
        );
        reach = Phaser.Math.Linear(17, idleReach.minigun, progress);
        vertical = Phaser.Math.Linear(-11, -12, progress);
        angle = Phaser.Math.Linear(2, idleAngles.minigun, progress);
      }
    } else if (this.currentAttack) {
      const phase = this.currentAttack.phase;
      if (this.currentAttack.config.id === 'sword-slam') {
        const elapsed = this.scene.time.now - this.currentAttack.startedAt;
        const turnProgress = Phaser.Math.Clamp(
          (elapsed - 740) / 110,
          0,
          1,
        );
        angle = swordSlamWeaponAngle(elapsed, phase === 'active');
        reach = Phaser.Math.Linear(20, 38, turnProgress);
        vertical = Phaser.Math.Linear(-24, -28, turnProgress);
        weaponScale = Phaser.Math.Linear(0.96, 1.05, turnProgress);
      } else if (phase === 'startup') {
        const windup = { sword: -112, fist: -48, minigun: -12, clock: -105, plant: -82, rock: -128 };
        angle = windup[id];
        reach = id === 'minigun' ? 4 : 1;
        vertical -= id === 'fist' ? 8 : 2;
        weaponScale *= 0.94;
      } else if (phase === 'active') {
        const swing = { sword: 32, fist: 4, minigun: -2, clock: 82, plant: 26, rock: 44 };
        angle = swing[id];
        reach = id === 'minigun' ? 10 : id === 'fist' ? 20 : 22;
        weaponScale *= this.currentAttack.kind === 'ultimate' ? 1.34 : 1.18;
      } else {
        const followThrough = { sword: 72, fist: 22, minigun: 5, clock: 132, plant: 58, rock: 88 };
        angle = followThrough[id];
        reach = id === 'minigun' ? 7 : 15;
      }
      if (this.currentAttack.kind === 'ultimate') {
        weaponScale += 0.16;
        vertical -= 3;
      } else if (this.currentAttack.kind === 'skill') {
        angle += id === 'clock' ? 22 : id === 'rock' ? 8 : 12;
      }
    } else if (id === 'fist' && this.state === 'IDLE') {
      const idleBob = Math.sin(this.scene.time.now / 220);
      vertical += idleBob * 2;
      reach += Math.cos(this.scene.time.now / 260) * 1.5;
      angle += idleBob * 3;
    } else if (this.state === 'RUN') {
      angle += Math.sin(this.scene.time.now / 85) * 7;
      vertical += Math.sin(this.scene.time.now / 70) * 3;
      reach += Math.sin(this.scene.time.now / 85) * 2;
    } else if (this.state === 'JUMP') {
      angle -= 28;
    } else if (this.state === 'FALL') {
      angle = 8;
    } else if (this.state === 'HITSTUN' || this.state === 'STUN' || this.state === 'KO') {
      angle = 58;
      reach = 5;
    }

    this.weapon
      .setPosition(this.x + this.facing * reach, this.y + vertical)
      .setRotation(Phaser.Math.DegToRad(angle * this.facing))
      .setScale(this.facing * weaponScale, weaponScale)
      .setFlipY(id === 'minigun')
      .setAlpha(this.alpha)
      .setVisible(
        this.visible
        && (this.currentAttack?.config.id !== 'fist-rush'
          || (this.currentAttack.sequence >= 4 && this.currentAttack.phase === 'recovery')),
      )
      .clearTint()
      .setTint(
        id === 'sword' || id === 'fist' || id === 'minigun'
          ? 0xffffff
          : this.displayTint,
      );

    if (this.minigunGrip) {
      let gripAngle = 60;
      let gripOffsetX = -5;
      let gripOffsetY = 0;
      if (this.currentAttack?.kind === 'basic') {
        const attack = this.currentAttack;
        const elapsed = this.scene.time.now - attack.startedAt;
        if (attack.phase === 'startup') {
          const progress = Phaser.Math.Clamp(elapsed / attack.config.startupMs, 0, 1);
          gripAngle = Phaser.Math.Linear(60, 48, progress);
          gripOffsetX = Phaser.Math.Linear(-5, -7, progress);
          gripOffsetY = Phaser.Math.Linear(0, 1, progress);
        } else if (attack.phase === 'active') {
          const progress = Phaser.Math.Clamp(
            (elapsed - attack.config.startupMs) / attack.config.activeMs,
            0,
            1,
          );
          gripAngle = 48 + Math.sin(progress * Math.PI * 8) * 1.2;
          gripOffsetX = -7;
          gripOffsetY = 1;
        } else {
          const progress = Phaser.Math.Clamp(
            (elapsed - attack.config.startupMs - attack.config.activeMs)
              / attack.config.recoveryMs,
            0,
            1,
          );
          gripAngle = Phaser.Math.Linear(48, 60, progress);
          gripOffsetX = Phaser.Math.Linear(-7, -5, progress);
          gripOffsetY = Phaser.Math.Linear(1, 0, progress);
        }
      }
      this.minigunGrip
        .setPosition(
          this.weapon.x + this.facing * gripOffsetX,
          this.weapon.y + gripOffsetY,
        )
        .setRotation(Phaser.Math.DegToRad(gripAngle * this.facing))
        .setScale(this.facing * weaponScale, weaponScale)
        .setFlipX(true)
        .setFlipY(true)
        .setAlpha(this.alpha)
        .setVisible(this.visible)
        .clearTint()
        .setTint(0xffffff);
    }
  }
}
