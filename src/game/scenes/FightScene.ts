import Phaser from 'phaser';
import { fighters } from '../data/fighters';
import type { AttackKind, MatchSettings, RoundResult } from '../data/types';
import { Fighter, type ActiveAttack } from '../entities/Fighter';
import { CombatSystem } from '../systems/CombatSystem';
import { determineRoundResult } from '../systems/CombatLogic';
import { InputController } from '../systems/InputController';
import { RoundManager } from '../systems/RoundManager';
import { SoundSystem } from '../systems/SoundSystem';
import { FightHUD } from '../ui/FightHUD';
import { addButton, palette } from '../ui/ui';

interface PlantNode {
  owner: Fighter;
  x: number;
  y: number;
  water: number;
  grown: boolean;
  expiresAt: number;
  view: Phaser.GameObjects.Container;
}

interface GrappleVisual {
  attacker: Fighter;
  hook: Phaser.GameObjects.Image;
  cables: Phaser.GameObjects.Image[];
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  startedAt: number;
  duration: number;
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
  private grappleVisuals: GrappleVisual[] = [];

  constructor() { super('FightScene'); }

  create(): void {
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
      fontFamily: 'monospace', fontSize: '14px', color: '#e9f5ff',
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
    });
    this.startCountdown();
  }

  update(time: number, delta: number): void {
    if (this.isPaused) return;
    this.updateGrappleVisuals(time);
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

    this.handleAttackInput(this.p1, this.inputs.p1, time);
    this.handleAttackInput(this.p2, this.inputs.p2, time);
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
      fontFamily: 'Arial Black, sans-serif', fontSize: '54px', color: '#ffffff',
      stroke: '#091027', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(202);
    const subtitle = this.add.text(640, 224, 'ESC를 다시 누르면 전투로 돌아갑니다', {
      fontSize: '17px', color: '#aebee8',
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
      if (kind === 'ultimate') this.ultimateIntro(fighter);
    });
    fighter.on('attack-active', (kind: AttackKind) => {
      this.attackVisual(fighter, kind);
      if (fighter.fighterConfig.id === 'sword' && kind === 'skill') this.spawnSwordShards(fighter);
      if (fighter.fighterConfig.id === 'minigun' && kind === 'skill') this.spawnGrapplingHook(fighter);
      if (fighter.fighterConfig.id === 'minigun' && kind === 'ultimate') this.spawnLaserBarrage(fighter);
      if (fighter.fighterConfig.id === 'clock' && kind === 'ultimate') this.startTimeStop(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'basic') this.waterSeeds(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'skill') this.plantSeed(fighter);
      if (fighter.fighterConfig.id === 'plant' && kind === 'ultimate') this.launchTrees(fighter);
      if (fighter.fighterConfig.id === 'rock' && kind === 'skill') this.spawnRockSpikes(fighter);
    });
    fighter.on('mana-empty', () => {
      const label = this.add.text(fighter.x, fighter.y - 132, '마나 부족!', {
        fontSize: '17px', fontStyle: 'bold', color: '#b878ff',
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
            this.slashLine(target.x, target.y - 50, attacker.fighterConfig.color, index);
            if (final) this.cameras.main.shake(150, 0.012);
          }
        });
      });
    } else if (attacker.fighterConfig.id === 'fist' && attack.kind === 'ultimate') {
      this.rushVisual(target, attacker.fighterConfig.color);
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
    const shotCount = attack.sequence % 3 === 0 ? 6 : 4;
    for (let shot = 1; shot < shotCount; shot += 1) {
      this.time.delayedCall(shot * 72, () => {
        if (target.state === 'KO') return;
        if (target.receiveBonusHit(
          2,
          shot === shotCount - 1 ? attack.direction * 85 : 0,
          -18,
          this.time.now,
          attacker,
          90,
          'basic',
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

  private spawnGrapplingHook(attacker: Fighter): void {
    const target = attacker === this.p1 ? this.p2 : this.p1;
    const startX = attacker.x + attacker.facing * 66;
    const startY = attacker.y - 52;
    const targetX = target.x;
    const targetY = target.y - 46;
    const distance = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
    const duration = Math.max(180, (distance / (attacker.fighterConfig.moveSpeed * 3)) * 1000);
    const hook = this.add.image(startX, startY, 'grapple-hook')
      .setOrigin(0.08, 0.5)
      .setScale(0.16)
      .setRotation(Phaser.Math.Angle.Between(startX, startY, targetX, targetY))
      .setDepth(19);
    const cableCount = Math.max(1, Math.ceil(distance / 30));
    const cables = Array.from({ length: cableCount }, () => this.add.image(startX, startY, 'grapple-cable')
      .setOrigin(0.5)
      .setScale(0.14, 0.14)
      .setRotation(hook.rotation)
      .setDepth(18)
      .setVisible(false));
    this.grappleVisuals.push({
      attacker, hook, cables, startX, startY, targetX, targetY,
      startedAt: this.time.now, duration,
    });
  }

  private updateGrappleVisuals(now: number): void {
    this.grappleVisuals = this.grappleVisuals.filter((visual) => {
      const progress = Phaser.Math.Clamp((now - visual.startedAt) / visual.duration, 0, 1);
      const dx = visual.targetX - visual.startX;
      const dy = visual.targetY - visual.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curve = Math.min(22, Math.max(8, distance * 0.05)) * visual.attacker.facing;
      const perpendicularX = distance === 0 ? 0 : -dy / distance;
      const perpendicularY = distance === 0 ? 0 : dx / distance;
      const pointAt = (t: number): { x: number; y: number } => {
        const bend = Math.sin(t * Math.PI) * curve;
        return {
          x: Phaser.Math.Linear(visual.startX, visual.targetX, t) + perpendicularX * bend,
          y: Phaser.Math.Linear(visual.startY, visual.targetY, t) + perpendicularY * bend,
        };
      };
      const point = pointAt(progress);
      const nextPoint = pointAt(Math.min(1, progress + 0.01));
      const angle = Phaser.Math.Angle.Between(point.x, point.y, nextPoint.x, nextPoint.y);
      visual.hook.setPosition(point.x, point.y).setRotation(angle);
      visual.cables.forEach((cable, index) => {
        const cableProgress = (index + 0.5) / visual.cables.length;
        const cablePoint = pointAt(cableProgress);
        const cableNextPoint = pointAt(Math.min(1, cableProgress + 0.01));
        const visible = cableProgress <= progress;
        cable.setVisible(visible);
        if (visible) {
          cable.setPosition(cablePoint.x, cablePoint.y)
            .setRotation(Phaser.Math.Angle.Between(cablePoint.x, cablePoint.y, cableNextPoint.x, cableNextPoint.y));
        }
      });
      if (progress >= 1) {
        visual.hook.destroy();
        visual.cables.forEach((cable) => cable.destroy());
        return false;
      }
      return true;
    });
  }

  private spawnSwordShards(attacker: Fighter): void {
    [1, 2, 3].forEach((step) => {
      this.time.delayedCall(step * 130, () => {
        if (!attacker.active) return;
        const x = attacker.x + attacker.facing * (90 + step * 75);
        const y = this.settings.map === 'void' ? 503 : 561;
        const shard = this.add.triangle(x, y, 0, 38, 18, 0, 36, 38, attacker.fighterConfig.color, 0.85)
          .setDepth(8).setScale(attacker.facing, 1);
        this.tweens.add({ targets: shard, y: y - 26, alpha: 0, duration: 280, onComplete: () => shard.destroy() });
        const target = attacker === this.p1 ? this.p2 : this.p1;
        const rect = new Phaser.Geom.Rectangle(x - 28, y - 75, 56, 80);
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, target.getHurtbox())) {
          if (target.receiveBonusHit(5, attacker.facing * 120, -90, this.time.now, attacker, 140)) {
            this.damageNumber(target.x, target.y - 100, 5);
          }
        }
      });
    });
  }

  private attackVisual(fighter: Fighter, kind: AttackKind): void {
    const color = fighter.fighterConfig.color;
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
      if (kind === 'skill') return;
      const count = kind === 'ultimate' ? 9 : kind === 'skill' ? 6 : 3;
      for (let index = 0; index < count; index += 1) {
        const bullet = this.add.rectangle(
          fighter.x + fighter.facing * (70 + index * 34),
          fighter.y - 53 + (index % 2) * 8,
          kind === 'ultimate' ? 30 : 20,
          7,
          index % 2 ? 0xffffff : color,
          0.9,
        ).setDepth(16);
        this.tweens.add({
          targets: bullet,
          x: bullet.x + fighter.facing * 95,
          alpha: 0,
          duration: 320 + index * 24,
          onComplete: () => bullet.destroy(),
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

  private ultimateIntro(fighter: Fighter): void {
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x02030a, 0.72).setDepth(40);
    const line = this.add.text(640, 338, fighter.fighterConfig.ultimate.name, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '54px', color: '#ffffff',
      stroke: Phaser.Display.Color.IntegerToColor(fighter.fighterConfig.color).rgba,
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(41);
    this.tweens.add({ targets: [shade, line], alpha: 0, delay: 170, duration: 240, onComplete: () => { shade.destroy(); line.destroy(); } });
  }

  private rushVisual(target: Fighter, color: number): void {
    for (let i = 0; i < 7; i += 1) {
      this.time.delayedCall(i * 45, () => {
        const burst = this.add.circle(
          target.x + Phaser.Math.Between(-38, 38),
          target.y - Phaser.Math.Between(25, 82),
          Phaser.Math.Between(10, 23), color, 0.75,
        ).setDepth(20);
        this.tweens.add({ targets: burst, scale: 1.8, alpha: 0, duration: 150, onComplete: () => burst.destroy() });
      });
    }
  }

  private slashLine(x: number, y: number, color: number, index: number): void {
    const line = this.add.rectangle(x, y, 150, 8, color, 0.85)
      .setRotation(index % 2 === 0 ? -0.5 : 0.5).setDepth(21);
    this.tweens.add({ targets: line, scaleX: 1.6, alpha: 0, duration: 130, onComplete: () => line.destroy() });
  }

  private damageNumber(x: number, y: number, damage: number): void {
    const text = this.add.text(x, y, `-${damage}`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#fff3a6',
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
      fontFamily: 'Arial Black, sans-serif', fontSize: '118px', color: '#ffffff',
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
      fontFamily: 'Arial Black, sans-serif', fontSize: '78px', color: '#ffffff',
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
      this.cameras.main.setBackgroundColor(0x7cc7e8);
      const g = this.add.graphics();
      g.fillStyle(0xcfeeff).fillCircle(1050, 125, 54);
      g.fillStyle(0x91d78b).fillEllipse(240, 520, 650, 260).fillEllipse(960, 520, 780, 290);
      this.platforms = this.physics.add.staticGroup();
      const ground = this.platforms.create(640, 620, 'pixel') as Phaser.Physics.Arcade.Sprite;
      ground.setDisplaySize(1280, 160).setTint(0x3c8959).refreshBody();
      this.physics.world.setBounds(24, 0, 1232, 720);
      return;
    }
    this.cameras.main.setBackgroundColor(0x070516);
    const stars = this.add.graphics();
    for (let i = 0; i < 85; i += 1) {
      stars.fillStyle(i % 4 === 0 ? 0xa884ff : 0xffffff, Phaser.Math.FloatBetween(0.2, 0.8));
      stars.fillCircle(Phaser.Math.Between(0, 1280), Phaser.Math.Between(110, 650), Phaser.Math.Between(1, 3));
    }
    this.platforms = this.physics.add.staticGroup();
    this.addPlatform(640, 245, 650, 38, 0x6c66a8);
    this.addPlatform(190, 390, 250, 32, 0x4a4985);
    this.addPlatform(1090, 390, 250, 32, 0x4a4985);
    this.addPlatform(640, 485, 330, 34, 0x585393);
    this.addPlatform(250, 600, 270, 30, 0x403d73);
    this.addPlatform(1030, 600, 270, 30, 0x403d73);
    this.add.rectangle(640, 355, 64, 5, 0x75e8ff, 0.25);
    this.add.rectangle(430, 530, 86, 4, 0xb499ff, 0.22).setRotation(-0.12);
    this.add.rectangle(850, 530, 86, 4, 0xb499ff, 0.22).setRotation(0.12);
    this.physics.world.setBounds(-220, 0, 1720, 900);
  }

  private addPlatform(x: number, y: number, width: number, height: number, tint: number): void {
    const platform = this.platforms.create(x, y, 'pixel') as Phaser.Physics.Arcade.Sprite;
    platform.setDisplaySize(width, height).setTint(tint).refreshBody();
    this.add.rectangle(x, y - 8, width, 4, 0xb499ff, 0.8);
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
