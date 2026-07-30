import Phaser from 'phaser';
import { combatTuning } from '../config/combatTuning';
import { fighters } from '../data/fighters';
import { voidPlatforms } from '../data/maps';
import type { AttackKind, MatchSettings, RoundResult } from '../data/types';
import { Fighter, type ActiveAttack } from '../entities/Fighter';
import { CombatSystem } from '../systems/CombatSystem';
import {
  determineRoundResult,
  evenlySpacedCutAngle,
  minigunBurstCount,
  screenCutPath,
  swordWavePositions,
} from '../systems/CombatLogic';
import { InputController } from '../systems/InputController';
import { RoundManager } from '../systems/RoundManager';
import { SoundSystem } from '../systems/SoundSystem';
import { FightHUD } from '../ui/FightHUD';
import { addButton, fontBody, fontDisplay, fontTech, palette } from '../ui/ui';

interface PlantNode {
  owner: Fighter;
  x: number;
  y: number;
  water: number;
  grown: boolean;
  expiresAt: number;
  view: Phaser.GameObjects.Container;
}

interface SwordSurface {
  left: number;
  right: number;
  top: number;
}

interface SwordUltimateFreeze {
  until: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
}

export class FightScene extends Phaser.Scene {
  private settings!: MatchSettings;
  private p1!: Fighter;
  private p2!: Fighter;
  private inputs!: InputController;
  private combat!: CombatSystem;
  private rounds!: RoundManager;
  private hud!: FightHUD;
  private sounds!: SoundSystem;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private countdown?: Phaser.GameObjects.Text;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private debugVisible = false;
  private roundEnding = false;
  private isPaused = false;
  private pauseObjects: Phaser.GameObjects.GameObject[] = [];
  private controlsBeforePause: [boolean, boolean] = [false, false];
  private debugHandler?: () => void;
  private escapeHandler?: () => void;
  private plantNodes: PlantNode[] = [];
  private swordTrailAt = new Map<number, number>();
  private swordUltimateFreeze?: SwordUltimateFreeze;

  constructor() { super('FightScene'); }

  create(): void {
    // Scene instances survive restart/start cycles in Phaser. These flags must
    // describe the new round, not the round that just finished.
    this.roundEnding = false;
    this.isPaused = false;
    this.debugVisible = false;
    this.swordTrailAt.clear();
    this.swordUltimateFreeze = undefined;
    this.pauseObjects = [];
    this.controlsBeforePause = [false, false];
    this.countdown = undefined;

    this.settings = this.registry.get('settings') as MatchSettings;
    this.drawArena();
    this.inputs = new InputController(this);
    this.sounds = new SoundSystem(this);
    this.rounds = new RoundManager(this.settings.mode);
    const resume = this.registry.get('resumeRounds') as
      | { round: number; p1Wins: number; p2Wins: number; history: RoundResult[] }
      | undefined;
    if (resume) {
      this.rounds.round = resume.round;
      this.rounds.p1Wins = resume.p1Wins;
      this.rounds.p2Wins = resume.p2Wins;
      this.rounds.history = [...resume.history];
      this.registry.remove('resumeRounds');
    }
    const p1Config = fighters[this.settings.p1];
    const p2Config = fighters[this.settings.p2];
    const same = this.settings.p1 === this.settings.p2;
    const p1Spawn = this.settings.map === 'void' ? { x: 190, y: 330 } : { x: 330, y: 500 };
    const p2Spawn = this.settings.map === 'void' ? { x: 1090, y: 330 } : { x: 950, y: 500 };
    this.p1 = new Fighter(this, p1Spawn.x, p1Spawn.y, p1Config, 1, p1Config.color);
    this.p2 = new Fighter(
      this,
      p2Spawn.x,
      p2Spawn.y,
      p2Config,
      2,
      same ? p2Config.alternateColor : p2Config.color,
    );
    if (this.settings.map === 'meadow') {
      this.p1.setCollideWorldBounds(true);
      this.p2.setCollideWorldBounds(true);
    }
    if (this.settings.map === 'void') {
      const oneWayPlatform: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        fighterObject,
        platformObject,
      ) => {
        const fighter = fighterObject as Fighter;
        const platform = platformObject as Phaser.Types.Physics.Arcade.GameObjectWithBody;
        const platformBody = platform.body as Phaser.Physics.Arcade.StaticBody;
        const previousBottom = fighter.bodyRef.prev.y + fighter.bodyRef.height;
        return fighter.bodyRef.velocity.y >= 0 && previousBottom <= platformBody.top + 14;
      };
      this.physics.add.collider(this.p1, this.platforms, undefined, oneWayPlatform);
      this.physics.add.collider(this.p2, this.platforms, undefined, oneWayPlatform);
    } else {
      this.physics.add.collider(this.p1, this.platforms);
      this.physics.add.collider(this.p2, this.platforms);
    }
    this.physics.add.collider(this.p1, this.p2);
    this.combat = new CombatSystem(
      this,
      (attacker, target, attack) => this.onHit(attacker, target, attack),
    );
    this.hud = new FightHUD(this, this.p1, this.p2);
    this.debugGraphics = this.add.graphics().setDepth(80);
    this.debugText = this.add.text(18, 145, '', {
      fontFamily: fontTech, fontSize: '13px', color: '#e9f5ff',
      backgroundColor: '#050711cc', padding: { x: 8, y: 6 },
    }).setDepth(81).setVisible(false);
    this.wireFighterEvents(this.p1);
    this.wireFighterEvents(this.p2);
    this.debugHandler = () => {
      this.debugVisible = !this.debugVisible;
      this.debugText.setVisible(this.debugVisible);
      if (!this.debugVisible) this.debugGraphics.clear();
    };
    this.escapeHandler = () => this.togglePause();
    this.input.keyboard?.on('keydown-F2', this.debugHandler);
    this.input.keyboard?.on('keydown-ESC', this.escapeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.debugHandler) this.input.keyboard?.off('keydown-F2', this.debugHandler);
      if (this.escapeHandler) this.input.keyboard?.off('keydown-ESC', this.escapeHandler);
      this.input.keyboard?.resetKeys();
    });
    this.startCountdown();
  }

  update(time: number, delta: number): void {
    if (this.isPaused) return;
    this.updatePlantAuras(time);
    const p1Move = {
      left: this.inputs.p1.left.isDown,
      right: this.inputs.p1.right.isDown,
      jumpPressed: Phaser.Input.Keyboard.JustDown(this.inputs.p1.jump),
      jumpHeld: this.inputs.p1.jump.isDown,
    };
    const p2Move = {
      left: this.inputs.p2.left.isDown,
      right: this.inputs.p2.right.isDown,
      jumpPressed: Phaser.Input.Keyboard.JustDown(this.inputs.p2.jump),
      jumpHeld: this.inputs.p2.jump.isDown,
    };
    this.p1.updateFighter(time, delta, this.p2.x, p1Move);
    this.p2.updateFighter(time, delta, this.p1.x, p2Move);
    const swordUltimateFrozen = Boolean(
      this.swordUltimateFreeze && time < this.swordUltimateFreeze.until,
    );
    if (swordUltimateFrozen && this.swordUltimateFreeze) {
      this.holdFighterAt(this.p1, this.swordUltimateFreeze.p1);
      this.holdFighterAt(this.p2, this.swordUltimateFreeze.p2);
    } else if (this.swordUltimateFreeze) {
      this.swordUltimateFreeze = undefined;
    }
    this.updateSwordSlamTrail(this.p1, time);
    this.updateSwordSlamTrail(this.p2, time);

    if (!swordUltimateFrozen) {
      this.handleAttackInput(this.p1, this.inputs.p1, time);
      this.handleAttackInput(this.p2, this.inputs.p2, time);
    }
    this.combat.update(time, [this.p1, this.p2]);

    if (this.settings.map === 'void') {
      this.checkVoidFall(this.p1, time);
      this.checkVoidFall(this.p2, time);
    }
    const result = determineRoundResult(this.p1.stats.health, this.p2.stats.health);
    if (result && !this.roundEnding) this.finishRound(result);
    this.hud.update(this.p1, this.p2, this.rounds, time);
    if (this.debugVisible) this.drawDebug();
  }

  private togglePause(): void {
    if (this.roundEnding) return;
    if (this.isPaused) {
      this.resumeFight();
      return;
    }
    this.isPaused = true;
    this.controlsBeforePause = [this.p1.controlEnabled, this.p2.controlEnabled];
    this.p1.controlEnabled = false;
    this.p2.controlEnabled = false;
    this.physics.world.pause();
    this.time.paused = true;
    this.tweens.pauseAll();

    const shade = this.add.rectangle(640, 360, 1280, 720, 0x03050d, 0.82).setDepth(200);
    const panel = this.add.rectangle(640, 350, 650, 520, 0x0b1127, 0.99)
      .setStrokeStyle(4, palette.cyan, 0.95).setDepth(201);
    const topBand = this.add.rectangle(640, 115, 646, 46, palette.blue, 0.95).setDepth(202);
    const title = this.add.text(640, 176, 'PAUSED', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '52px', color: '#ffffff',
      stroke: '#091027', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(202);
    const subtitle = this.add.text(640, 224, 'ESC를 다시 누르면 전투로 돌아갑니다', {
      fontFamily: fontBody, fontSize: '16px', color: '#aebee8',
    }).setOrigin(0.5).setDepth(202);
    const resume = addButton(this, 640, 300, '계속하기', () => this.resumeFight(), 390).setDepth(203);
    const restart = addButton(this, 640, 380, '현재 라운드 다시 시작', () => {
      this.restoreRuntime();
      this.registry.set('resumeRounds', {
        round: this.rounds.round,
        p1Wins: this.rounds.p1Wins,
        p2Wins: this.rounds.p2Wins,
        history: [...this.rounds.history],
      });
      this.scene.restart();
    }, 390).setDepth(203);
    const select = addButton(this, 640, 460, '파이터 선택으로', () => {
      this.restoreRuntime();
      this.registry.remove('resumeRounds');
      this.scene.start('CharacterSelectScene');
    }, 390).setDepth(203);
    const menu = addButton(this, 640, 540, '메인 메뉴로', () => {
      this.restoreRuntime();
      this.registry.remove('resumeRounds');
      this.scene.start('TitleScene');
    }, 390).setDepth(203);
    this.pauseObjects = [shade, panel, topBand, title, subtitle, resume, restart, select, menu];
  }

  private resumeFight(): void {
    this.restoreRuntime();
    this.pauseObjects.forEach((object) => object.destroy());
    this.pauseObjects = [];
    this.isPaused = false;
    this.p1.controlEnabled = this.controlsBeforePause[0] && !this.roundEnding;
    this.p2.controlEnabled = this.controlsBeforePause[1] && !this.roundEnding;
    this.input.keyboard?.resetKeys();
  }

  private restoreRuntime(): void {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.physics.world.resume();
  }

  private handleAttackInput(
    fighter: Fighter,
    input: { basic: Phaser.Input.Keyboard.Key; skill: Phaser.Input.Keyboard.Key; ultimate: Phaser.Input.Keyboard.Key },
    now: number,
  ): void {
    const rapidClockShot = fighter.fighterConfig.id === 'clock'
      && now < fighter.timeStopUntil
      && input.basic.isDown;
    if (Phaser.Input.Keyboard.JustDown(input.basic) || rapidClockShot) fighter.tryAttack('basic', now);
    if (Phaser.Input.Keyboard.JustDown(input.skill)) fighter.tryAttack('skill', now);
    if (Phaser.Input.Keyboard.JustDown(input.ultimate)) fighter.tryAttack('ultimate', now);
  }

  private wireFighterEvents(fighter: Fighter): void {
    fighter.on('jump', () => this.sounds.play('jump'));
    fighter.on('attack-start', (kind: AttackKind) => {
      this.sounds.play(kind === 'basic' ? 'attack' : kind === 'skill' ? 'skill' : 'ultimate');
      if (kind === 'ultimate') {
        this.ultimateIntro(fighter);
        if (fighter.fighterConfig.id === 'sword' && fighter.currentAttack) {
          this.startSwordUltimateCut(fighter, fighter.currentAttack);
        } else if (fighter.fighterConfig.id === 'fist' && fighter.currentAttack) {
          this.startFistRushDots(fighter, fighter.currentAttack);
          this.startFistRushFinisher(fighter, fighter.currentAttack);
        }
      }
    });
    fighter.on('attack-active', (kind: AttackKind) => {
      if (!((fighter.fighterConfig.id === 'sword' || fighter.fighterConfig.id === 'fist')
        && kind === 'ultimate')) {
        this.attackVisual(fighter, kind);
      }
      if (fighter.fighterConfig.id === 'minigun' && kind === 'ultimate') this.spawnLaserBarrage(fighter);
      if (fighter.fighterConfig.id === 'clock' && kind === 'ultimate') this.startTimeStop(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'basic') this.waterSeeds(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'skill') this.plantSeed(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'ultimate') this.launchTrees(fighter);
      if (fighter.fighterConfig.id === 'rock' && kind === 'skill') this.spawnRockSpikes(fighter);
    });
    fighter.on('sword-slam-dive', () => {
      this.cameras.main.shake(90, 0.004);
    });
    fighter.on('sword-slam-land', (attack: ActiveAttack) => {
      this.sounds.play('hit');
      this.swordSlamImpact(fighter);
      const target = fighter === this.p1 ? this.p2 : this.p1;
      const impactArea = new Phaser.Geom.Rectangle(fighter.x - 92, fighter.y - 78, 184, 104);
      if (Phaser.Geom.Intersects.RectangleToRectangle(impactArea, target.getHurtbox())
        && target.receiveAttackSnapshot(fighter, attack, this.time.now)) {
        this.onHit(fighter, target, attack);
      }
      this.spawnSwordShards(fighter);
    });
    fighter.on('mana-empty', () => {
      const label = this.add.text(fighter.x, fighter.y - 132, '마나 부족!', {
        fontFamily: fontBody, fontSize: '16px', fontStyle: 'bold', color: '#b878ff',
      }).setOrigin(0.5).setDepth(60);
      this.tweens.add({ targets: label, y: label.y - 28, alpha: 0, duration: 520, onComplete: () => label.destroy() });
    });
    fighter.on('dot-damage', (damage: number) => {
      this.damageNumber(fighter.x, fighter.y - 76, damage);
      const ember = this.add.circle(fighter.x, fighter.y - 24, 7, 0xff6b2c, 0.85).setDepth(18);
      this.tweens.add({ targets: ember, y: ember.y - 34, alpha: 0, duration: 260, onComplete: () => ember.destroy() });
    });
  }

  private onHit(attacker: Fighter, target: Fighter, attack: ActiveAttack): void {
    this.sounds.play('hit');
    this.cameras.main.shake(attack.config.hitstopMs + 25, attack.kind === 'ultimate' ? 0.008 : 0.0035);
    this.combat.showHitEffect(target.x, target.y - 48, attacker.fighterConfig.color);
    this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);

    if (attacker.fighterConfig.id === 'sword' && attack.kind === 'ultimate') {
      target.state = 'STUN';
      [110, 220, 330].forEach((delay, index) => {
        this.time.delayedCall(delay, () => {
          if (target.state === 'KO') return;
          const final = index === 2;
          const hit = target.receiveBonusHit(
            15,
            final ? attack.direction * 420 : 0,
            final ? -280 : 0,
            this.time.now,
            attacker,
            final ? 260 : 180,
            'ultimate',
          );
          if (hit) {
            this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
            if (final) this.cameras.main.shake(150, 0.012);
          }
        });
      });
    } else if (attacker.fighterConfig.id === 'minigun' && attack.kind === 'basic') {
      this.continueBurst(attacker, target, attack);
    } else if (attacker.fighterConfig.id === 'plant' && attack.kind === 'basic') {
      this.continueWaterStream(attacker, target);
    } else if (attacker.fighterConfig.id === 'rock' && attack.kind === 'basic') {
      this.time.delayedCall(70, () => {
        if (target.receiveBonusHit(3, attack.direction * 90, -50, this.time.now, attacker, 100, 'basic')) {
          this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
        }
      });
      if (attack.config.id === 'rock-lava-punch') target.applyBurn(attacker, this.time.now, 2000);
    }
  }

  private continueBurst(attacker: Fighter, target: Fighter, attack: ActiveAttack): void {
    const shotCount = minigunBurstCount(attack.sequence);
    for (let shot = 1; shot < shotCount; shot += 1) {
      this.time.delayedCall(shot * 72, () => {
        if (target.state === 'KO') return;
        if (target.receiveBonusHit(
          2,
          0,
          0,
          this.time.now,
          attacker,
          0,
          'basic',
          true,
        )) {
          this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
          this.combat.showHitEffect(target.x, target.y - 24, attacker.fighterConfig.color);
        }
      });
    }
  }

  private continueWaterStream(attacker: Fighter, target: Fighter): void {
    for (let particle = 1; particle < 10; particle += 1) {
      this.time.delayedCall(particle * 58, () => {
        if (target.state === 'KO') return;
        if (target.receiveBonusHit(1, attacker.facing * 12, 8, this.time.now, attacker, 55, 'basic')) {
          this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
        }
      });
    }
  }

  private spawnLaserBarrage(attacker: Fighter): void {
    const target = attacker === this.p1 ? this.p2 : this.p1;
    [0, 1000, 2000].forEach((delay, index) => {
      this.time.delayedCall(delay, () => {
        if (target.state === 'KO') return;
        const x = target.x;
        const warning = this.add.rectangle(x, 350, 58, 560, 0xff5f74, 0.16)
          .setStrokeStyle(3, 0xffd3dd, 0.8).setDepth(17);
        this.tweens.add({ targets: warning, alpha: 0.5, duration: 180, yoyo: true, repeat: 1 });
        this.time.delayedCall(430, () => {
          warning.destroy();
          if (target.state === 'KO') return;
          const laser = this.add.rectangle(x, 345, 42, 570, 0xffffff, 0.92)
            .setStrokeStyle(8, attacker.fighterConfig.color, 0.9).setDepth(22);
          this.tweens.add({ targets: laser, alpha: 0, scaleX: 1.45, duration: 260, onComplete: () => laser.destroy() });
          if (Math.abs(target.x - x) <= 48 && target.receiveBonusHit(
            25, 0, -180, this.time.now, attacker, 380, 'ultimate',
          )) {
            this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
            this.cameras.main.shake(120, 0.008 + index * 0.001);
          }
        });
      });
    });
  }

  private startTimeStop(attacker: Fighter): void {
    const attack = attacker.currentAttack;
    if (!attack) return;
    const target = attacker === this.p1 ? this.p2 : this.p1;
    const duration = 1000 + Math.min(4, attack.sequence) * 1000;
    target.applyStun(this.time.now, duration, true);
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x6e5cff, 0.12).setDepth(13);
    const label = this.add.text(640, 170, `TIME STOP  ${duration / 1000}s`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '38px', color: '#e9e4ff',
      stroke: '#24104f', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(24);
    this.tweens.add({
      targets: [veil, label],
      alpha: 0,
      delay: Math.max(300, duration - 350),
      duration: 350,
      onComplete: () => { veil.destroy(); label.destroy(); },
    });
  }

  private plantSeed(owner: Fighter): void {
    const owned = this.plantNodes.filter((node) => node.owner === owner);
    if (owned.length >= 3) {
      const oldest = owned[0];
      oldest.view.destroy(true);
      this.plantNodes = this.plantNodes.filter((node) => node !== oldest);
    }
    const x = Phaser.Math.Clamp(owner.x + owner.facing * 34, 40, 1240);
    const y = owner.y - 7;
    const soil = this.add.ellipse(0, 5, 42, 12, 0x402819, 0.9);
    const seed = this.add.circle(0, 0, 9, 0xc69b45, 1).setStrokeStyle(3, 0x26170e);
    const label = this.add.text(0, -22, '0/50', {
      fontSize: '11px', color: '#e6ffc9', backgroundColor: '#102216cc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    const view = this.add.container(x, y, [soil, seed, label]).setDepth(8);
    this.plantNodes.push({ owner, x, y, water: 0, grown: false, expiresAt: Infinity, view });
  }

  private waterSeeds(owner: Fighter): void {
    this.plantNodes.forEach((node) => {
      if (node.owner !== owner || node.grown) return;
      if (Math.abs(node.x - owner.x) > 260 || Math.abs(node.y - owner.y) > 150) return;
      node.water = Math.min(50, node.water + 10);
      const label = node.view.list[2] as Phaser.GameObjects.Text;
      label.setText(`${node.water}/50`);
      if (node.water >= 50) this.growTree(node);
    });
  }

  private growTree(node: PlantNode): void {
    node.grown = true;
    node.expiresAt = this.time.now + 30000;
    node.view.removeAll(true);
    const trunk = this.add.rectangle(0, -28, 18, 62, 0x7b4a28, 1).setStrokeStyle(3, 0x2b1a12);
    const crown = this.add.circle(0, -70, 42, node.owner.fighterConfig.color, 0.9)
      .setStrokeStyle(4, 0xd9ffb8, 0.75);
    const aura = this.add.circle(0, -24, 180, node.owner.fighterConfig.color, 0.07)
      .setStrokeStyle(2, node.owner.fighterConfig.color, 0.22);
    node.view.add([aura, trunk, crown]);
    this.tweens.add({ targets: aura, scale: 1.08, alpha: 0.12, duration: 900, yoyo: true, repeat: -1 });
  }

  private updatePlantAuras(now: number): void {
    this.plantNodes = this.plantNodes.filter((node) => {
      if (node.grown && now >= node.expiresAt) {
        node.view.destroy(true);
        return false;
      }
      return true;
    });
    [this.p1, this.p2].forEach((fighter) => {
      const nearby = this.plantNodes.filter((node) => node.grown
        && Phaser.Math.Distance.Between(fighter.x, fighter.y - 20, node.x, node.y - 24) <= 180);
      const ownAura = nearby.some((node) => node.owner === fighter);
      const enemyAura = nearby.some((node) => node.owner !== fighter);
      fighter.movementMultiplier = (ownAura ? 2 : 1) * (enemyAura ? 0.5 : 1);
      fighter.damageMultiplier = (ownAura ? 2 : 1) * (enemyAura ? 0.5 : 1);
    });
  }

  private launchTrees(owner: Fighter): void {
    const target = owner === this.p1 ? this.p2 : this.p1;
    const trees = this.plantNodes.filter((node) => node.owner === owner && node.grown);
    trees.forEach((node, index) => {
      this.tweens.add({
        targets: node.view,
        x: target.x,
        y: target.y - 28,
        angle: owner.facing * 180,
        duration: 520 + index * 100,
        ease: 'Cubic.In',
        onComplete: () => {
          if (target.receiveBonusHit(30, owner.facing * 230, -190, this.time.now, owner, 320, 'ultimate')) {
            this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
            this.combat.showHitEffect(target.x, target.y - 24, owner.fighterConfig.color);
          }
          node.view.destroy(true);
          this.plantNodes = this.plantNodes.filter((candidate) => candidate !== node);
        },
      });
    });
  }

  private spawnRockSpikes(owner: Fighter): void {
    const target = owner === this.p1 ? this.p2 : this.p1;
    const enraged = this.time.now < owner.enragedUntil;
    for (let index = 0; index < 6; index += 1) {
      this.time.delayedCall(index * 130, () => {
        const x = owner.x + owner.facing * (72 + index * 68);
        const height = 62 + index * 9;
        const spike = this.add.triangle(
          x, owner.y - height / 2,
          0, height, 24, 0, 48, height,
          enraged ? 0xff5c26 : owner.fighterConfig.color,
          0.9,
        ).setStrokeStyle(4, 0x2b1720, 0.9).setDepth(16);
        this.tweens.add({ targets: spike, y: spike.y - 18, alpha: 0, delay: 180, duration: 260, onComplete: () => spike.destroy() });
        const area = new Phaser.Geom.Rectangle(x - 28, owner.y - height, 56, height);
        if (Phaser.Geom.Intersects.RectangleToRectangle(area, target.getHurtbox())
          && target.receiveBonusHit(enraged ? 30 : 20, owner.facing * 180, -260, this.time.now, owner, 260, 'skill')) {
          this.damageNumber(target.x, target.y - 82, target.lastDamageTaken);
          if (enraged) target.applyBurn(owner, this.time.now, 3000);
        }
      });
    }
  }

  private spawnSwordShards(attacker: Fighter): void {
    const surface = this.swordSurfaceAt(attacker);
    if (!surface) return;
    const target = attacker === this.p1 ? this.p2 : this.p1;
    Array.from({ length: combatTuning.swordBladeWaveCount }, (_, index) => index + 1)
      .forEach((step) => {
        this.time.delayedCall(step * combatTuning.swordBladeWaveStepMs, () => {
          if (!attacker.active) return;
          const positions = swordWavePositions(attacker.x, surface.left, surface.right, step);
          const hitAreas = positions.map((x) => {
            this.createSwordBlade(x, surface.top, attacker.fighterConfig.color);
            return new Phaser.Geom.Rectangle(x - 22, surface.top - 94, 44, 96);
          });
          if (hitAreas.some((area) => Phaser.Geom.Intersects.RectangleToRectangle(
            area,
            target.getHurtbox(),
          ))) {
            const direction = target.x >= attacker.x ? 1 : -1;
            if (target.receiveBonusHit(5, direction * 120, -90, this.time.now, attacker, 140)) {
              this.damageNumber(target.x, target.y - 100, 5);
            }
          }
        });
      });
  }

  private swordSurfaceAt(attacker: Fighter): SwordSurface | undefined {
    const feetY = attacker.bodyRef.bottom;
    const surfaces: SwordSurface[] = this.settings.map === 'void'
      ? voidPlatforms.map((platform) => ({
        left: platform.x - platform.width / 2,
        right: platform.x + platform.width / 2,
        top: platform.y - platform.height / 2,
      }))
      : [{ left: 0, right: 1280, top: combatTuning.meadowGroundTop }];
    return surfaces
      .filter((surface) => attacker.x >= surface.left && attacker.x <= surface.right)
      .sort((a, b) => Math.abs(a.top - feetY) - Math.abs(b.top - feetY))
      .find((surface) => Math.abs(surface.top - feetY) <= 28);
  }

  private createSwordBlade(x: number, surfaceTop: number, color: number): void {
    const blade = this.add.graphics({ x, y: surfaceTop + 12 }).setDepth(16);
    const bladePoints = [
      new Phaser.Geom.Point(-14, 0),
      new Phaser.Geom.Point(-16, -72),
      new Phaser.Geom.Point(0, -96),
      new Phaser.Geom.Point(16, -72),
      new Phaser.Geom.Point(14, 0),
    ];
    blade.fillStyle(0xdfe5ef, 0.98).fillPoints(bladePoints, true);
    blade.lineStyle(4, 0x090d18, 1).strokePoints(bladePoints, true);
    blade.lineStyle(2, 0xffffff, 0.72)
      .lineBetween(0, -90, 0, -4)
      .lineBetween(0, -90, 12, -70);
    blade.setScale(1, 0.08);
    const maskSource = this.make.graphics({ x: 0, y: 0 });
    maskSource.fillStyle(0xffffff).fillRect(x - 30, surfaceTop - 112, 60, 112);
    const groundMask = maskSource.createGeometryMask();
    blade.setMask(groundMask);
    const glow = this.add.ellipse(x, surfaceTop, 38, 10, color, 0.68).setDepth(15);
    this.tweens.add({
      targets: blade,
      scaleY: 1,
      duration: 125,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: [blade, glow],
      y: '-=8',
      alpha: 0,
      delay: 250,
      duration: 230,
      onComplete: () => {
        blade.destroy();
        glow.destroy();
        groundMask.destroy();
        maskSource.destroy();
      },
    });
  }

  private updateSwordSlamTrail(fighter: Fighter, now: number): void {
    const attack = fighter.currentAttack;
    if (attack?.config.id !== 'sword-slam') {
      this.swordTrailAt.delete(fighter.playerNumber);
      return;
    }
    const nextTrailAt = this.swordTrailAt.get(fighter.playerNumber) ?? 0;
    if (now < nextTrailAt) return;
    this.swordTrailAt.set(fighter.playerNumber, now + 42);
    const descending = attack.phase === 'active';
    const ghost = this.add.rectangle(
      fighter.x,
      fighter.y + (descending ? -38 : 38),
      descending ? 18 : 24,
      descending ? 34 : 24,
      fighter.fighterConfig.color,
      0.62,
    ).setStrokeStyle(2, 0xffffff, 0.24).setDepth(9);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: 0.42,
      y: ghost.y + (descending ? -30 : 30),
      duration: 210,
      onComplete: () => ghost.destroy(),
    });
  }

  private swordSlamImpact(fighter: Fighter): void {
    const color = fighter.fighterConfig.color;
    const ring = this.add.ellipse(fighter.x, fighter.y + 5, 52, 14, color, 0.6)
      .setStrokeStyle(5, 0xffffff, 0.7).setDepth(18);
    this.tweens.add({
      targets: ring,
      scaleX: 3.2,
      scaleY: 1.8,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy(),
    });
    for (let index = -2; index <= 2; index += 1) {
      const debris = this.add.rectangle(
        fighter.x + index * 12,
        fighter.y + 2,
        8,
        16,
        index % 2 === 0 ? 0xffffff : color,
        0.9,
      ).setDepth(19);
      this.tweens.add({
        targets: debris,
        x: debris.x + index * 24,
        y: debris.y - 32 - Math.abs(index) * 9,
        angle: index * 70,
        alpha: 0,
        duration: 300,
        onComplete: () => debris.destroy(),
      });
    }
    this.cameras.main.shake(150, 0.01);
  }

  private attackVisual(fighter: Fighter, kind: AttackKind): void {
    const color = fighter.fighterConfig.color;
    if (fighter.fighterConfig.id === 'sword' && kind === 'skill') return;
    this.weaponTrail(fighter, kind);
    if (fighter.fighterConfig.id === 'sword') {
      const arc = this.add.arc(
        fighter.x + fighter.facing * 62, fighter.y - 50,
        kind === 'ultimate' ? 110 : 66, -70, 70, false, color, 0.65,
      ).setStrokeStyle(kind === 'ultimate' ? 13 : 7, 0xffffff, 0.72).setDepth(15);
      arc.setScale(fighter.facing, 1);
      this.tweens.add({ targets: arc, alpha: 0, scaleX: fighter.facing * 1.35, duration: 190, onComplete: () => arc.destroy() });
      return;
    }
    if (fighter.fighterConfig.id === 'fist') {
      const fist = this.add.circle(
        fighter.x + fighter.facing * 58, fighter.y - (kind === 'skill' ? 88 : 50),
        kind === 'ultimate' ? 40 : 27, color, 0.75,
      ).setStrokeStyle(5, 0xffffff, 0.7).setDepth(15);
      this.tweens.add({ targets: fist, scale: 1.7, alpha: 0, duration: 170, onComplete: () => fist.destroy() });
      return;
    }
    if (fighter.fighterConfig.id === 'minigun') {
      if (kind === 'ultimate') return;
      if (kind === 'skill') {
        const hookX = fighter.x + fighter.facing * 330;
        const chain = this.add.rectangle(
          fighter.x + fighter.facing * 170,
          fighter.y - 32,
          320,
          4,
          0xc6f5ff,
          0.85,
        ).setDepth(16);
        const hook = this.add.circle(hookX, fighter.y - 32, 12, color, 0.95)
          .setStrokeStyle(4, 0xffffff, 0.8).setDepth(17);
        this.tweens.add({
          targets: [chain, hook],
          alpha: 0,
          duration: 280,
          onComplete: () => { chain.destroy(); hook.destroy(); },
        });
        return;
      }
      const sequence = fighter.currentAttack?.sequence ?? 1;
      const count = minigunBurstCount(sequence);
      for (let index = 0; index < count; index += 1) {
        this.time.delayedCall(index * 66, () => {
          const bulletBorder = this.add.rectangle(
            fighter.x + fighter.facing * 60,
            fighter.y - 33 + (index % 2) * 4,
            20,
            7,
            0x111111,
            0.98,
          ).setDepth(16);
          const bulletCore = this.add.rectangle(
            bulletBorder.x,
            bulletBorder.y,
            14,
            3,
            index % 2 ? 0xffffff : color,
            0.95,
          ).setDepth(17);
          this.tweens.add({
            targets: [bulletBorder, bulletCore],
            x: bulletBorder.x + fighter.facing * 756,
            alpha: 0,
            duration: 249,
            onComplete: () => { bulletBorder.destroy(); bulletCore.destroy(); },
          });
        });
      }
      return;
    }
    if (fighter.fighterConfig.id === 'clock') {
      const ring = this.add.circle(
        fighter.x + fighter.facing * 80,
        fighter.y - 55,
        kind === 'ultimate' ? 120 : kind === 'skill' ? 72 : 40,
        color,
        0.16,
      ).setStrokeStyle(kind === 'ultimate' ? 10 : 6, color, 0.9).setDepth(16);
      const hand = this.add.rectangle(ring.x, ring.y, ring.radius * 1.45, 6, 0xffffff, 0.85)
        .setOrigin(0, 0.5).setRotation(-0.7).setDepth(17);
      this.tweens.add({
        targets: [ring, hand],
        rotation: 1.7,
        scale: 1.35,
        alpha: 0,
        duration: 260,
        onComplete: () => { ring.destroy(); hand.destroy(); },
      });
      return;
    }
    if (fighter.fighterConfig.id === 'plant') {
      const count = kind === 'ultimate' ? 7 : kind === 'skill' ? 4 : 2;
      for (let index = 0; index < count; index += 1) {
        const leaf = this.add.ellipse(
          fighter.x + fighter.facing * (58 + index * 34),
          fighter.y - 35 - (index % 3) * 24,
          34,
          18,
          index % 2 ? 0xbaff79 : color,
          0.85,
        ).setRotation(fighter.facing * (0.4 + index * 0.12)).setDepth(16);
        this.tweens.add({
          targets: leaf,
          y: leaf.y - 45,
          angle: leaf.angle + fighter.facing * 80,
          alpha: 0,
          duration: 230 + index * 25,
          onComplete: () => leaf.destroy(),
        });
      }
      return;
    }
    const size = kind === 'ultimate' ? 76 : kind === 'skill' ? 52 : 34;
    const rock = this.add.polygon(
      fighter.x + fighter.facing * 68,
      fighter.y - 53,
      [0, -size / 2, size * 0.46, -size * 0.2, size / 2, size * 0.3, 0, size / 2, -size * 0.5, size * 0.2],
      color,
      0.9,
    ).setStrokeStyle(5, 0xffffff, 0.5).setDepth(16);
    this.tweens.add({
      targets: rock,
      x: rock.x + fighter.facing * (kind === 'ultimate' ? 180 : 75),
      rotation: fighter.facing * 1.2,
      scale: 1.3,
      alpha: 0,
      duration: 230,
      onComplete: () => rock.destroy(),
    });
  }

  private startSwordUltimateCut(attacker: Fighter, attack: ActiveAttack): void {
    const target = attacker === this.p1 ? this.p2 : this.p1;
    const freezeUntil = this.time.now + combatTuning.swordUltimateHitMs;
    if (this.swordUltimateFreeze && this.time.now < this.swordUltimateFreeze.until) {
      this.swordUltimateFreeze.until = Math.max(this.swordUltimateFreeze.until, freezeUntil);
    } else {
      this.swordUltimateFreeze = {
        until: freezeUntil,
        p1: { x: this.p1.x, y: this.p1.y },
        p2: { x: this.p2.x, y: this.p2.y },
      };
    }
    const trails: Phaser.GameObjects.Graphics[] = [];
    const points: Phaser.GameObjects.Ellipse[] = [];
    let effectActive = true;
    const pointCount = combatTuning.swordUltimateTrailCount;
    const baseAngle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);

    for (let index = 0; index < pointCount; index += 1) {
      this.time.delayedCall(index * combatTuning.swordUltimateTrailStaggerMs, () => {
        if (!effectActive) return;
        const angle = evenlySpacedCutAngle(index, pointCount, baseAngle);
        const path = screenCutPath(
          Phaser.Math.Between(240, 1040),
          Phaser.Math.Between(150, 570),
          angle,
          1280,
          720,
          28,
        );
        const point = this.add.ellipse(path.startX, path.startY, 13, 5, 0xffffff, 0.24)
          .setRotation(angle)
          .setDepth(43);
        const trail = this.add.graphics().setDepth(42);
        points.push(point);
        trails.push(trail);
        this.tweens.add({
          targets: point,
          x: path.endX,
          y: path.endY,
          duration: combatTuning.swordUltimatePointTravelMs,
          ease: 'Linear',
          onUpdate: () => {
            if (!effectActive || !trail.active || !point.active) return;
            trail.clear()
              .lineStyle(combatTuning.swordUltimateTrailWidth, 0xffffff, 0.76)
              .lineBetween(path.startX, path.startY, point.x, point.y);
          },
          onComplete: () => point.destroy(),
        });
      });
    }

    this.time.delayedCall(combatTuning.swordUltimateTrailClearMs, () => {
      effectActive = false;
      points.forEach((point) => {
        if (point.active) point.destroy();
      });
      trails.forEach((trail) => {
        if (trail.active) trail.destroy();
      });
    });

    this.time.delayedCall(combatTuning.swordUltimateHitMs, () => {
      const liveAttack = attacker.currentAttack;
      if (!liveAttack || liveAttack.id !== attack.id || liveAttack.phase !== 'active') return;
      const { config, direction } = attack;
      const centerX = attacker.x + config.hitboxOffsetX * direction;
      const centerY = attacker.y - 24 + config.hitboxOffsetY;
      const hitbox = new Phaser.Geom.Rectangle(
        centerX - config.hitboxWidth / 2,
        centerY - config.hitboxHeight / 2,
        config.hitboxWidth,
        config.hitboxHeight,
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitbox, target.getBodyHurtbox())
        && target.receiveAttackSnapshot(attacker, attack, this.time.now)) {
        this.onHit(attacker, target, attack);
      }
    });
  }

  private weaponTrail(fighter: Fighter, kind: AttackKind): void {
    const color = fighter.fighterConfig.color;
    const strength = kind === 'ultimate' ? 1.45 : kind === 'skill' ? 1.2 : 1;
    const isRanged = fighter.fighterConfig.id === 'minigun';
    const count = isRanged ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const progress = index / Math.max(1, count - 1);
      const ghost = this.add.image(
        fighter.x + fighter.facing * (12 + progress * 25),
        fighter.y - 25 - progress * 5,
        `weapon-${fighter.fighterConfig.id}`,
      )
        .setOrigin(0.12, 0.5)
        .setTint(index % 2 ? color : 0xffffff)
        .setAlpha(0.22 + progress * 0.18)
        .setDepth(14)
        .setRotation(fighter.facing * (-1.05 + progress * 1.25))
        .setScale(fighter.facing * (0.75 + progress * 0.18) * strength, (0.75 + progress * 0.18) * strength);
      this.tweens.add({
        targets: ghost,
        x: ghost.x + fighter.facing * (isRanged ? 28 : 48),
        rotation: ghost.rotation + fighter.facing * (isRanged ? 0.08 : 0.55),
        alpha: 0,
        scaleY: ghost.scaleY * 1.15,
        duration: 120 + index * 24,
        onComplete: () => ghost.destroy(),
      });
    }

    const flashX = fighter.x + fighter.facing * (isRanged ? 78 : 58);
    const flashY = fighter.y - (fighter.fighterConfig.id === 'fist' && kind === 'skill' ? 82 : 48);
    const flash = this.add.star(
      flashX,
      flashY,
      kind === 'ultimate' ? 10 : 7,
      kind === 'ultimate' ? 14 : 8,
      kind === 'ultimate' ? 42 : 25,
      color,
      0.8,
    ).setStrokeStyle(3, 0xffffff, 0.75).setDepth(18);
    this.tweens.add({
      targets: flash,
      scale: 1.7,
      rotation: fighter.facing * 0.6,
      alpha: 0,
      duration: kind === 'ultimate' ? 240 : 150,
      onComplete: () => flash.destroy(),
    });
  }

  private ultimateIntro(fighter: Fighter): void {
    const swordUltimate = fighter.fighterConfig.id === 'sword';
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x02030a, 0.72).setDepth(40);
    const line = this.add.text(
      640,
      338,
      swordUltimate ? '가루로 만들어 주지' : fighter.fighterConfig.ultimate.name,
      {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '50px', color: '#ffffff',
      stroke: Phaser.Display.Color.IntegerToColor(fighter.fighterConfig.color).rgba,
      strokeThickness: 7,
      },
    ).setOrigin(0.5).setDepth(44);
    this.tweens.add({
      targets: [shade, line],
      alpha: 0,
      delay: swordUltimate ? combatTuning.swordUltimateTitleHoldMs : 170,
      duration: 240,
      onComplete: () => { shade.destroy(); line.destroy(); },
    });
  }

  private holdFighterAt(fighter: Fighter, position: { x: number; y: number }): void {
    const offsetX = position.x - fighter.x;
    const offsetY = position.y - fighter.y;
    fighter.setPosition(position.x, position.y).setVelocity(0, 0).setAcceleration(0, 0);
    fighter.weapon.setPosition(fighter.weapon.x + offsetX, fighter.weapon.y + offsetY);
    fighter.minigunGrip?.setPosition(
      fighter.minigunGrip.x + offsetX,
      fighter.minigunGrip.y + offsetY,
    );
  }

  private startHeavyPunchCharge(fighter: Fighter, attack: ActiveAttack): void {
    const color = fighter.displayTint;
    const outer = this.add.circle(fighter.weapon.x, fighter.weapon.y, 20, color, 0.08)
      .setStrokeStyle(4, color, 0.9).setDepth(19);
    const inner = this.add.circle(fighter.weapon.x, fighter.weapon.y, 8, 0xffffff, 0.72)
      .setDepth(20);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.events.off(Phaser.Scenes.Events.UPDATE, update);
      outer.destroy();
      inner.destroy();
    };
    const update = () => {
      if (!fighter.currentAttack
        || fighter.currentAttack.id !== attack.id
        || fighter.currentAttack.phase !== 'recovery') {
        cleanup();
        return;
      }
      const recoveryStartedAt = attack.startedAt
        + attack.config.startupMs + attack.config.activeMs;
      const progress = Phaser.Math.Clamp(
        (this.time.now - recoveryStartedAt) / 210,
        0,
        1,
      );
      const pulse = 1 + Math.sin(this.time.now / 38) * 0.12;
      outer.setPosition(fighter.weapon.x, fighter.weapon.y)
        .setScale((0.55 + progress * 1.15) * pulse)
        .setAlpha(0.35 + progress * 0.65);
      inner.setPosition(fighter.weapon.x, fighter.weapon.y)
        .setScale(0.55 + progress * 0.7)
        .setAlpha(0.45 + progress * 0.5);
    };

    this.events.on(Phaser.Scenes.Events.UPDATE, update);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    update();
  }

  private heavyPunchReleaseVisual(fighter: Fighter): void {
    const color = fighter.displayTint;
    const impactX = fighter.x + fighter.facing * 66;
    const impactY = fighter.y - 38;
    const shock = this.add.triangle(
      impactX,
      impactY,
      0,
      -24,
      94,
      0,
      0,
      24,
      color,
      0.62,
    ).setScale(fighter.facing, 1).setDepth(16);
    const ring = this.add.circle(impactX, impactY, 18, color, 0.12)
      .setStrokeStyle(6, 0xffffff, 0.82).setDepth(17);
    this.tweens.add({
      targets: shock,
      x: shock.x + fighter.facing * 40,
      scaleX: fighter.facing * 1.35,
      alpha: 0,
      duration: 170,
      ease: 'Cubic.Out',
      onComplete: () => shock.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 2,
      alpha: 0,
      duration: 190,
      onComplete: () => ring.destroy(),
    });
  }

  private startFistRushFinisher(fighter: Fighter, attack: ActiveAttack): void {
    if (attack.sequence < 4) return;
    const chargeDelay = attack.config.startupMs + attack.config.activeMs + 16;
    this.time.delayedCall(chargeDelay, () => {
      const liveAttack = fighter.currentAttack;
      if (!liveAttack || liveAttack.id !== attack.id || liveAttack.phase !== 'recovery') return;
      this.startHeavyPunchCharge(fighter, attack);
    });
    const finisherDelay = attack.config.startupMs + attack.config.activeMs + 210;
    this.time.delayedCall(finisherDelay, () => {
      const liveAttack = fighter.currentAttack;
      if (!liveAttack || liveAttack.id !== attack.id || liveAttack.phase !== 'recovery') return;
      this.heavyPunchReleaseVisual(fighter);
      const target = fighter === this.p1 ? this.p2 : this.p1;
      if (!attack.hitTicks.has(target.playerNumber)) return;
      if (target.receiveBonusHit(
        15,
        attack.direction * attack.config.knockbackX,
        attack.config.knockbackY,
        this.time.now,
        fighter,
        attack.config.hitstunMs,
        'ultimate',
      )) {
        this.onHit(fighter, target, attack);
      }
    });
  }

  private startFistRushDots(fighter: Fighter, attack: ActiveAttack): void {
    const color = fighter.displayTint;
    const dots = [
      this.add.circle(fighter.x, fighter.y - 42, 14, color, 1),
      this.add.circle(fighter.x, fighter.y - 42, 14, color, 1),
      this.add.circle(fighter.x, fighter.y - 42, 14, color, 1),
      this.add.circle(fighter.x, fighter.y - 42, 14, color, 1),
    ].map((dot) => dot.setStrokeStyle(3, 0xffffff, 0.72).setDepth(21));
    const trails = [
      this.add.graphics().setDepth(20),
      this.add.graphics().setDepth(20),
      this.add.graphics().setDepth(20),
      this.add.graphics().setDepth(20),
    ];
    const trailPoints: Array<Array<{ x: number; y: number }>> = [[], [], [], []];
    const startTime = this.time.now;
    const cycleMs = Phaser.Math.Between(155, 185);
    const forwardReach = attack.config.hitboxOffsetX + attack.config.hitboxWidth / 2;
    const centerVertical = -24 + attack.config.hitboxOffsetY;
    const verticalReach = attack.config.hitboxHeight / 2;
    const verticalBandCount = 6;
    const bandOffset = Phaser.Math.Between(0, verticalBandCount - 1);
    const trajectories = dots.map(() => ({
      cycle: -1,
      arcOffset: 0,
      endOffset: 0,
      horizontalControl: 0.5,
    }));
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.events.off(Phaser.Scenes.Events.UPDATE, update);
      dots.forEach((dot) => dot.destroy());
      trails.forEach((trail) => trail.destroy());
    };
    const pointOnRushParabola = (
      progress: number,
      trajectory: { arcOffset: number; endOffset: number; horizontalControl: number },
    ) => {
      const inverse = 1 - progress;
      const arc = 4 * progress * (1 - progress);
      return {
        x: 2 * inverse * progress * forwardReach * trajectory.horizontalControl
          + progress * progress * forwardReach,
        y: Phaser.Math.Clamp(
          centerVertical + trajectory.arcOffset * arc + trajectory.endOffset * progress,
          centerVertical - verticalReach,
          centerVertical + verticalReach,
        ),
      };
    };
    const update = () => {
      if (!fighter.currentAttack
        || fighter.currentAttack.id !== attack.id
        || fighter.currentAttack.phase === 'recovery') {
        cleanup();
        return;
      }
      const elapsed = this.time.now - startTime;
      dots.forEach((dot, index) => {
        const staggeredElapsed = Math.max(0, elapsed - index * cycleMs / dots.length);
        const cycle = Math.floor(staggeredElapsed / cycleMs);
        const progress = (staggeredElapsed / cycleMs) % 1;
        const trajectory = trajectories[index];
        if (trajectory.cycle !== cycle) {
          trajectory.cycle = cycle;
          const band = (bandOffset + cycle * dots.length + index) % verticalBandCount;
          const bandProgress = (band + Phaser.Math.FloatBetween(0.12, 0.88))
            / verticalBandCount;
          trajectory.arcOffset = Phaser.Math.Linear(
            -verticalReach,
            verticalReach,
            bandProgress,
          );
          trajectory.endOffset = Phaser.Math.FloatBetween(-verticalReach, verticalReach);
          trajectory.horizontalControl = Phaser.Math.FloatBetween(0.28, 0.72);
        }
        const point = pointOnRushParabola(progress, trajectory);
        dot.setPosition(
          fighter.x + fighter.facing * point.x,
          fighter.y + point.y,
        ).setAlpha(fighter.alpha);

        const history = trailPoints[index];
        const previous = history[0];
        if (!previous || Phaser.Math.Distance.Between(previous.x, previous.y, dot.x, dot.y) < 34) {
          history.unshift({ x: dot.x, y: dot.y });
        } else {
          history.length = 0;
          history.push({ x: dot.x, y: dot.y });
        }
        history.splice(8);

        const trail = trails[index].clear();
        for (let pointIndex = 0; pointIndex < history.length - 1; pointIndex += 1) {
          const head = history[pointIndex];
          const tail = history[pointIndex + 1];
          const dx = head.x - tail.x;
          const dy = head.y - tail.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const width = 10 * (1 - pointIndex / Math.max(1, history.length - 1));
          const normalX = -dy / length * width;
          const normalY = dx / length * width;
          const alpha = 0.5 * (1 - pointIndex / Math.max(1, history.length - 1));
          trail.fillStyle(color, alpha * fighter.alpha).fillTriangle(
            head.x + normalX,
            head.y + normalY,
            head.x - normalX,
            head.y - normalY,
            tail.x,
            tail.y,
          );
        }
      });
    };

    this.events.on(Phaser.Scenes.Events.UPDATE, update);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    update();
  }

  private damageNumber(x: number, y: number, damage: number): void {
    const text = this.add.text(x, y, `-${damage}`, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '24px', color: '#fff3a6',
      stroke: '#6b1320', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(70);
    this.tweens.add({ targets: text, y: y - 52, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => text.destroy() });
  }

  private checkVoidFall(fighter: Fighter, now: number): void {
    if (fighter.y < 790 || fighter.state === 'KO' || fighter.state === 'RESPAWN_INVULNERABLE') return;
    fighter.applyVoidFall(now);
    this.cameras.main.shake(120, 0.008);
    this.damageNumber(fighter.x, 190, 15);
  }

  private startCountdown(): void {
    this.p1.controlEnabled = false;
    this.p2.controlEnabled = false;
    this.countdown?.destroy();
    this.countdown = this.add.text(640, 300, '3', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '112px', color: '#ffffff',
      stroke: '#192044', strokeThickness: 12,
    }).setOrigin(0.5).setDepth(90);
    const steps = ['3', '2', '1', 'FIGHT!'];
    steps.forEach((step, index) => {
      this.time.delayedCall(index * 650, () => {
        this.countdown?.setText(step).setScale(step === 'FIGHT!' ? 0.72 : 1).setAlpha(1);
        this.tweens.add({ targets: this.countdown, scale: step === 'FIGHT!' ? 0.95 : 1.3, alpha: 0.2, duration: 520 });
        this.sounds.play('round');
      });
    });
    this.time.delayedCall(steps.length * 650, () => {
      this.countdown?.destroy();
      this.countdown = undefined;
      this.p1.controlEnabled = true;
      this.p2.controlEnabled = true;
    });
  }

  private finishRound(result: RoundResult): void {
    this.roundEnding = true;
    this.p1.controlEnabled = false;
    this.p2.controlEnabled = false;
    this.sounds.play('ko');
    const label = result === 'draw' ? 'DOUBLE KO · DRAW' : `${result === 'p1' ? '1P' : '2P'}  K.O.`;
    this.add.text(640, 300, label, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '72px', color: '#ffffff',
      stroke: '#7e1b39', strokeThickness: 12,
    }).setOrigin(0.5).setDepth(100);
    const outcome = this.rounds.record(result);
    this.time.delayedCall(1900, () => {
      if (outcome.matchOver) {
        this.registry.set('result', {
          winner: outcome.winner,
          history: [...this.rounds.history],
          p1Wins: this.rounds.p1Wins,
          p2Wins: this.rounds.p2Wins,
        });
        this.scene.start('ResultScene');
        return;
      }
      this.registry.set('resumeRounds', {
        round: this.rounds.round,
        p1Wins: this.rounds.p1Wins,
        p2Wins: this.rounds.p2Wins,
        history: this.rounds.history,
      });
      this.scene.restart();
    });
  }

  private drawArena(): void {
    if (this.settings.map === 'meadow') {
      this.cameras.main.setBackgroundColor(0x4ba7d1);
      const g = this.add.graphics();
      g.fillGradientStyle(0x3896c7, 0x3896c7, 0xa5e7ee, 0xdff7e6, 1).fillRect(0, 0, 1280, 560);
      g.fillStyle(0xfff3b1, 0.18).fillCircle(1050, 132, 88);
      g.fillStyle(0xfff3b1).fillCircle(1050, 132, 50);
      g.lineStyle(3, 0xffffff, 0.35).strokeCircle(1050, 132, 64);
      g.fillStyle(0x5d91a2, 0.45).fillTriangle(0, 500, 260, 210, 535, 500);
      g.fillStyle(0x4d8297, 0.4).fillTriangle(360, 500, 650, 180, 940, 500);
      g.fillStyle(0x5b94a3, 0.36).fillTriangle(790, 500, 1070, 240, 1280, 500);
      g.fillStyle(0x8fd6a1).fillEllipse(210, 520, 700, 270).fillEllipse(980, 520, 820, 300);
      g.fillStyle(0x66b982, 0.9).fillEllipse(590, 555, 680, 215);
      g.lineStyle(3, 0xd9fff2, 0.45)
        .beginPath().arc(240, 480, 330, 3.55, 5.75).strokePath()
        .beginPath().arc(945, 490, 390, 3.45, 5.85).strokePath();
      [
        [180, 155, 150], [510, 115, 110], [820, 190, 125],
      ].forEach(([x, y, width]) => {
        g.fillStyle(0xffffff, 0.56)
          .fillEllipse(x, y, width, 34)
          .fillCircle(x - width * 0.18, y - 12, 25)
          .fillCircle(x + width * 0.08, y - 17, 31);
      });
      for (let index = 0; index < 24; index += 1) {
        const x = 30 + index * 54;
        const height = 10 + (index % 4) * 5;
        g.lineStyle(2, index % 3 === 0 ? 0xb9ff8f : 0x74d891, 0.55)
          .lineBetween(
            x,
            combatTuning.meadowGroundTop + 2,
            x + (index % 2 ? 5 : -5),
            combatTuning.meadowGroundTop + 2 - height,
          );
      }
      this.platforms = this.physics.add.staticGroup();
      const groundCenter = combatTuning.meadowGroundTop + combatTuning.meadowGroundHeight / 2;
      const ground = this.platforms.create(640, groundCenter, 'pixel') as Phaser.Physics.Arcade.Sprite;
      ground.setDisplaySize(1280, combatTuning.meadowGroundHeight).setTint(0x246847).refreshBody();
      this.add.rectangle(640, combatTuning.meadowGroundTop + 2, 1280, 10, 0x8dea83, 1);
      this.add.rectangle(640, combatTuning.meadowGroundTop + 10, 1280, 6, 0x3c9e66, 1);
      for (let x = 18; x < 1280; x += 52) {
        this.add.polygon(
          x,
          combatTuning.meadowGroundTop + 43,
          [0, -18, 20, -10, 26, 12, 5, 22, -15, 8],
          0x1c573e,
          0.34,
        );
      }
      this.physics.world.setBounds(24, 0, 1232, 720);
      return;
    }
    this.cameras.main.setBackgroundColor(0x070516);
    const stars = this.add.graphics();
    stars.fillGradientStyle(0x050318, 0x110827, 0x1e0d3d, 0x050718, 1).fillRect(0, 0, 1280, 720);
    stars.fillStyle(0x8d4dff, 0.09).fillEllipse(280, 380, 620, 390);
    stars.fillStyle(0x3de7ff, 0.07).fillEllipse(1020, 280, 520, 310);
    stars.lineStyle(3, 0x9b78ff, 0.18).strokeEllipse(1030, 170, 300, 95);
    stars.fillStyle(0x261b52, 0.9).fillCircle(1030, 170, 74);
    stars.fillStyle(0x534589, 0.45).fillCircle(1005, 145, 16);
    for (let i = 0; i < 85; i += 1) {
      stars.fillStyle(i % 4 === 0 ? 0xa884ff : 0xffffff, Phaser.Math.FloatBetween(0.2, 0.8));
      stars.fillCircle(Phaser.Math.Between(0, 1280), Phaser.Math.Between(110, 650), Phaser.Math.Between(1, 3));
    }
    for (let index = 0; index < 12; index += 1) {
      const shard = this.add.polygon(
        35 + (index * 127) % 1210,
        170 + (index * 83) % 470,
        [0, -14, 8, 0, 0, 25, -7, 1],
        index % 2 ? 0x5f46a0 : 0x226f88,
        0.24,
      ).setRotation(index * 0.37);
      this.tweens.add({
        targets: shard,
        y: shard.y - 14,
        rotation: shard.rotation + 0.5,
        duration: 1800 + index * 130,
        yoyo: true,
        repeat: -1,
      });
    }
    this.platforms = this.physics.add.staticGroup();
    voidPlatforms.forEach((platform) => {
      this.addPlatform(
        platform.x,
        platform.y,
        platform.width,
        platform.height,
        platform.tint,
      );
    });
    this.add.rectangle(640, 355, 64, 5, 0x75e8ff, 0.25);
    this.add.rectangle(430, 530, 86, 4, 0xb499ff, 0.22).setRotation(-0.12);
    this.add.rectangle(850, 530, 86, 4, 0xb499ff, 0.22).setRotation(0.12);
    this.physics.world.setBounds(-220, 0, 1720, 900);
  }

  private addPlatform(x: number, y: number, width: number, height: number, tint: number): void {
    this.add.polygon(
      x,
      y + height / 2 + 14,
      [-width / 2 + 8, -14, width / 2 - 8, -14, width / 2 - 28, 18, -width / 2 + 28, 18],
      0x110c2c,
      0.9,
    ).setStrokeStyle(2, 0x6f55a8, 0.5);
    const platform = this.platforms.create(x, y, 'pixel') as Phaser.Physics.Arcade.Sprite;
    platform.setDisplaySize(width, height).setTint(tint).refreshBody();
    this.add.rectangle(x, y - height / 2 + 3, width - 8, 6, 0xb9a4ff, 0.92);
    this.add.rectangle(x, y + height / 2 - 5, width - 28, 3, 0x33285c, 0.9);
    [x - width / 2 + 22, x + width / 2 - 22].forEach((lightX) => {
      const light = this.add.circle(lightX, y, 4, 0x75e8ff, 0.9);
      this.tweens.add({ targets: light, alpha: 0.25, duration: 680, yoyo: true, repeat: -1 });
    });
  }

  private drawDebug(): void {
    this.debugGraphics.clear();
    [this.p1, this.p2].forEach((fighter, index) => {
      const hurt = fighter.getHurtbox();
      this.debugGraphics.lineStyle(2, index === 0 ? 0x55e8ff : 0xffb55e, 1).strokeRectShape(hurt);
      const hit = fighter.getHitbox();
      if (hit) this.debugGraphics.fillStyle(0xff315b, 0.25).fillRectShape(hit).lineStyle(2, 0xff315b).strokeRectShape(hit);
      this.debugGraphics.lineStyle(2, 0xffffff, 0.7)
        .lineBetween(fighter.x, fighter.y - 45, fighter.x + fighter.bodyRef.velocity.x * 0.16, fighter.y - 45 + fighter.bodyRef.velocity.y * 0.16);
    });
    const line = (fighter: Fighter) => {
      const attack = fighter.currentAttack;
      return `${fighter.playerNumber}P ${fighter.state}  HP:${fighter.stats.health.toFixed(0)} MP:${fighter.stats.mana.toFixed(0)} R:${fighter.stats.rage}\n` +
        `ATK:${attack?.config.id ?? '-'} PHASE:${attack?.phase ?? '-'}  V:${fighter.bodyRef.velocity.x.toFixed(0)},${fighter.bodyRef.velocity.y.toFixed(0)}`;
    };
    this.debugText.setText(`${line(this.p1)}\n\n${line(this.p2)}`);
  }
}
