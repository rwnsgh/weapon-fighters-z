import Phaser from 'phaser';
import type { AttackConfig, AttackKind, FighterConfig } from '../data/types';
import {
  addRage,
  applyDamage,
  canUseMana,
  consumeRage,
  punchRushDamage,
  regenerateMana,
  spendMana,
  type CombatantStats,
} from '../systems/CombatLogic';

export type FighterState =
  | 'IDLE' | 'RUN' | 'JUMP' | 'FALL'
  | 'ATTACK' | 'SKILL' | 'ULTIMATE'
  | 'HITSTUN' | 'STUN' | 'KO' | 'RESPAWN_INVULNERABLE';
export type AttackPhase = 'startup' | 'active' | 'recovery';

export interface ActiveAttack {
  config: AttackConfig;
  kind: AttackKind;
  startedAt: number;
  id: string;
  phase: AttackPhase;
  direction: -1 | 1;
  hitTargets: Set<number>;
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
  private jumpCutApplied = false;
  private burnUntil = 0;
  private nextBurnAt = 0;
  private burnAttacker?: Fighter;
  private frozenUntil = 0;
  readonly displayTint: number;
  readonly weapon: Phaser.GameObjects.Image;

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
    this.weapon = scene.add.image(x, y - 22, `weapon-${config.id}`)
      .setOrigin(0.12, 0.5)
      .setTint(tint)
      .setDepth(11);
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
    this.jumpBufferedUntil = 0;
    this.coyoteUntil = 0;
    this.jumpCutApplied = false;
    this.bodyRef.enable = true;
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
    if ((this.state === 'HITSTUN' || this.state === 'STUN') && now >= this.stateUntil) {
      this.state = this.bodyRef.blocked.down ? 'IDLE' : 'FALL';
    }
    if (now < this.frozenUntil) {
      this.bodyRef.setAllowGravity(false);
      this.setVelocity(0, 0);
    } else {
      this.bodyRef.setAllowGravity(true);
    }

    if (!this.currentAttack && this.state !== 'HITSTUN' && this.state !== 'STUN') {
      this.facing = opponentX >= this.x ? 1 : -1;
    }
    this.setFlipX(this.facing < 0);

    const grounded = this.bodyRef.blocked.down || this.bodyRef.touching.down;
    if (grounded) this.coyoteUntil = now + 110;
    if (input.jumpPressed) {
      this.jumpBufferedUntil = now + 150;
      this.jumpCutApplied = false;
    }
    const actionLocked = this.currentAttack || this.state === 'HITSTUN' || this.state === 'STUN';
    if (this.controlEnabled && !actionLocked && this.state !== 'RESPAWN_INVULNERABLE') {
      const slowScale = now < this.slowedUntil ? 0.8 : 1;
      const hasteScale = now < this.hastenedUntil ? 1.5 : 1;
      const speedScale = slowScale * hasteScale * this.movementMultiplier;
      const direction = Number(input.right) - Number(input.left);
      const acceleration = this.fighterConfig.moveSpeed * (grounded ? 8.8 : 5.2) * speedScale;
      this.setAccelerationX(direction * acceleration);
      this.setDragX(direction === 0 ? (grounded ? 2200 : 320) : 650);
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
      this.setDragX(grounded ? 1800 : 480);
      const lunge = this.currentAttack.phase === 'active'
        ? this.currentAttack.config.lungeVelocity ?? 0
        : 0;
      this.setVelocityX(this.currentAttack.direction * lunge);
    } else {
      this.setAccelerationX(0);
      this.setDragX(grounded ? 1500 : 320);
    }

    if (!grounded && !this.currentAttack && this.state !== 'HITSTUN' && this.state !== 'STUN'
      && this.state !== 'RESPAWN_INVULNERABLE') {
      this.state = this.bodyRef.velocity.y < 0 ? 'JUMP' : 'FALL';
    }
    if (grounded && !this.lastGrounded && this.state === 'FALL') this.state = 'IDLE';
    this.lastGrounded = grounded;
    this.updatePose();
    this.updateWeaponPose();
  }

  tryAttack(kind: AttackKind, now: number): boolean {
    if (!this.controlEnabled || this.state === 'KO' || this.currentAttack
      || this.state === 'HITSTUN' || this.state === 'STUN'
      || this.state === 'RESPAWN_INVULNERABLE') return false;
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
      config = { ...base, damage: punchRushDamage(this.stats.rage) };
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
    this.currentAttack = {
      config,
      kind,
      startedAt: now,
      id: `${this.playerNumber}-${config.id}-${this.attackCounter += 1}`,
      phase: 'startup',
      direction: this.facing,
      hitTargets: new Set(),
      sequence,
    };
    this.state = kind === 'basic' ? 'ATTACK' : kind === 'skill' ? 'SKILL' : 'ULTIMATE';
    this.emit('attack-start', kind);
    return true;
  }

  private updateAttack(now: number): void {
    const attack = this.currentAttack;
    if (!attack) return;
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

  getHitbox(): Phaser.Geom.Rectangle | null {
    const attack = this.currentAttack;
    if (!attack || attack.phase !== 'active') return null;
    const { config, direction } = attack;
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

  getHurtbox(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - 20, this.y - 40, 40, 40);
  }

  receiveHit(attacker: Fighter, now: number): boolean {
    const attack = attacker.currentAttack;
    if (!attack || attack.hitTargets.has(this.playerNumber) || now < this.invulnerableUntil) return false;
    attack.hitTargets.add(this.playerNumber);
    return this.receiveDamage(
      attack.config.damage,
      attack.config.hitstunMs,
      attack.config.knockbackX * attack.direction,
      attack.config.knockbackY,
      now,
      attacker,
      attack.kind,
    );
  }

  receiveBonusHit(
    damage: number,
    knockbackX: number,
    knockbackY: number,
    now: number,
    attacker: Fighter,
    stunMs = 160,
    attackKind?: AttackKind,
  ): boolean {
    if (now < this.invulnerableUntil || this.state === 'KO') return false;
    return this.receiveDamage(damage, stunMs, knockbackX, knockbackY, now, attacker, attackKind);
  }

  private receiveDamage(
    damage: number,
    hitstunMs: number,
    knockbackX: number,
    knockbackY: number,
    now: number,
    attacker: Fighter,
    attackKind?: AttackKind,
  ): boolean {
    const appliedDamage = Math.max(0, damage * attacker.damageMultiplier);
    this.lastDamageTaken = appliedDamage;
    this.stats = applyDamage(this.stats, appliedDamage);
    this.currentAttack = undefined;
    this.setVelocity(knockbackX, knockbackY);
    this.state = this.stats.health <= 0 ? 'KO' : 'HITSTUN';
    this.stateUntil = now + hitstunMs;
    if (this.state === 'KO') this.setVelocity(knockbackX * 1.2, Math.min(knockbackY, -300));
    if (attacker.fighterConfig.id === 'fist') {
      const gain = attackKind === 'skill' ? 2 : attackKind === 'basic' ? 1 : 0;
      attacker.stats = addRage(attacker.stats, gain);
      if (attackKind === 'skill') this.slowedUntil = now + 3000;
    }
    if (attacker.fighterConfig.id === 'clock' && attackKind === 'basic') {
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
    this.stats = applyDamage(this.stats, 15);
    if (this.stats.health <= 0) {
      this.state = 'KO';
      this.setPosition(640, 180).setVelocity(0, 0);
      return;
    }
    this.setPosition(this.playerNumber === 1 ? 580 : 700, 170).setVelocity(0, 0);
    this.invulnerableUntil = now + 1000;
    this.state = 'RESPAWN_INVULNERABLE';
  }

  private updatePose(): void {
    this.setAngle(0);
    if (this.currentAttack?.phase === 'startup') this.setScale(0.92, 1.06);
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
    let angle = -24;
    let reach = 11;
    let vertical = -22;
    let weaponScale = 0.9;

    if (this.currentAttack) {
      const phase = this.currentAttack.phase;
      if (phase === 'startup') {
        angle = -72;
        reach = 7;
      } else if (phase === 'active') {
        angle = this.fighterConfig.id === 'minigun' ? -6 : 28;
        reach = this.fighterConfig.id === 'minigun' ? 7 : 18;
        weaponScale = 1.08;
      } else {
        angle = -5;
        reach = 13;
      }
      if (this.currentAttack.kind === 'ultimate') {
        weaponScale += 0.18;
        vertical -= 3;
      } else if (this.currentAttack.kind === 'skill') {
        angle += this.fighterConfig.id === 'clock' ? 70 : 12;
      }
    } else if (this.state === 'RUN') {
      angle = -17;
      vertical += Math.sin(this.scene.time.now / 70) * 2;
    } else if (this.state === 'JUMP') {
      angle = -42;
    } else if (this.state === 'FALL') {
      angle = 8;
    } else if (this.state === 'HITSTUN' || this.state === 'STUN' || this.state === 'KO') {
      angle = 58;
      reach = 5;
    }

    const skillTexture = this.fighterConfig.id === 'minigun' && this.currentAttack?.kind === 'skill'
      ? this.currentAttack.phase === 'active' ? 'minigun-skill-active' : 'minigun-skill-ready'
      : `weapon-${this.fighterConfig.id}`;
    const isSkillTexture = skillTexture !== `weapon-${this.fighterConfig.id}`;
    const textureScale = isSkillTexture
      ? (this.currentAttack?.phase === 'active' ? 0.15 : 0.14)
      : weaponScale;

    this.weapon
      .setTexture(skillTexture)
      .setPosition(this.x + this.facing * reach, this.y + vertical)
      .setRotation(Phaser.Math.DegToRad(angle * this.facing))
      .setScale(this.facing * textureScale, textureScale)
      .setAlpha(this.alpha)
      .setVisible(this.visible)
      .clearTint()
      .setTint(this.displayTint);
  }
}
