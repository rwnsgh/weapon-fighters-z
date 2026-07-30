import Phaser from 'phaser';
import { Fighter, type FighterStatusEffect } from '../entities/Fighter';
import { RoundManager } from '../systems/RoundManager';
import { fontBody, fontDisplay, fontTech } from './ui';

export class FightHUD {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly center: Phaser.GameObjects.Text;
  private readonly p1Rage: Phaser.GameObjects.Text;
  private readonly p2Rage: Phaser.GameObjects.Text;
  private readonly p1Value: Phaser.GameObjects.Text;
  private readonly p2Value: Phaser.GameObjects.Text;
  private readonly p1Stacks: Phaser.GameObjects.Image[] = [];
  private readonly p2Stacks: Phaser.GameObjects.Image[] = [];
  private readonly p1Statuses: Phaser.GameObjects.Text[] = [];
  private readonly p2Statuses: Phaser.GameObjects.Text[] = [];
  private p1Trail: number;
  private p2Trail: number;

  constructor(scene: Phaser.Scene, p1: Fighter, p2: Fighter) {
    this.p1Trail = p1.stats.maxHealth;
    this.p2Trail = p2.stats.maxHealth;
    this.graphics = scene.add.graphics().setDepth(50);
    scene.add.circle(57, 69, 47, 0x0b1024, 0.96).setStrokeStyle(4, p1.fighterConfig.color).setDepth(50);
    scene.add.circle(1223, 69, 47, 0x0b1024, 0.96).setStrokeStyle(4, p2.fighterConfig.color).setDepth(50);
    scene.add.image(57, 73, `fighter-${p1.fighterConfig.id}`)
      .setTint(p1.displayTint).setScale(0.48).setDepth(51);
    scene.add.image(1223, 73, `fighter-${p2.fighterConfig.id}`)
      .setTint(p2.displayTint).setScale(0.48).setFlipX(true).setDepth(51);
    scene.add.text(110, 20, `1P  ${p1.fighterConfig.name}`, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '17px', color: '#ffffff',
    }).setDepth(51);
    scene.add.text(1170, 20, `${p2.fighterConfig.name}  2P`, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '17px', color: '#ffffff',
    }).setOrigin(1, 0).setDepth(51);
    this.center = scene.add.text(640, 24, '', {
      fontFamily: fontTech, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', align: 'center',
    }).setOrigin(0.5, 0).setDepth(51);
    this.p1Rage = scene.add.text(110, 149, '', {
      fontFamily: fontBody, fontSize: '14px', fontStyle: 'bold', color: '#ffbe4f',
    }).setDepth(51);
    this.p2Rage = scene.add.text(1170, 149, '', {
      fontFamily: fontBody, fontSize: '14px', fontStyle: 'bold', color: '#ffbe4f',
    }).setOrigin(1, 0).setDepth(51);
    this.p1Value = scene.add.text(118, 58, '', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '13px', color: '#ffffff',
    }).setDepth(52);
    this.p2Value = scene.add.text(1162, 58, '', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '13px', color: '#ffffff',
    }).setOrigin(1, 0).setDepth(52);
    scene.add.text(640, 104, 'ESC  PAUSE', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '11px', color: '#8ca0d4',
      backgroundColor: '#091022cc', padding: { x: 9, y: 5 },
    }).setOrigin(0.5, 0).setDepth(51);
    for (let index = 0; index < 4; index += 1) {
      this.p1Stacks.push(scene.add.image(0, 0, 'weapon-fist').setScale(0.22).setDepth(52).setVisible(false));
      this.p2Stacks.push(scene.add.image(0, 0, 'weapon-fist').setScale(-0.22, 0.22).setDepth(52).setVisible(false));
    }
    for (let index = 0; index < 9; index += 1) {
      const style: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: fontTech,
        fontStyle: 'bold',
        fontSize: '22px',
        color: '#ffffff',
        padding: { x: 8, y: 5 },
      };
      this.p1Statuses.push(
        scene.add.text(0, 0, '', style).setDepth(53).setVisible(false),
      );
      this.p2Statuses.push(
        scene.add.text(0, 0, '', style).setOrigin(1, 0).setDepth(53).setVisible(false),
      );
    }
  }

  update(p1: Fighter, p2: Fighter, rounds: RoundManager, now: number): void {
    this.p1Trail = Phaser.Math.Linear(this.p1Trail, p1.stats.health, 0.06);
    this.p2Trail = Phaser.Math.Linear(this.p2Trail, p2.stats.health, 0.06);
    this.graphics.clear();
    this.drawBars(110, 51, p1.stats.health, this.p1Trail, p1.stats.maxHealth, p1.stats.mana, p1.manaFlashUntil > now, false);
    this.drawBars(1170, 51, p2.stats.health, this.p2Trail, p2.stats.maxHealth, p2.stats.mana, p2.manaFlashUntil > now, true);
    this.center.setText(
      `ROUND ${rounds.round}\n${rounds.mode === 'bestOf3' ? `${rounds.p1Wins}  —  ${rounds.p2Wins}` : 'FINAL ROUND'}`,
    );
    this.p1Rage.setText(p1.fighterConfig.id === 'clock' ? `시간 스택 ${p1.stats.rage}/4` : '');
    this.p2Rage.setText(p2.fighterConfig.id === 'clock' ? `시간 스택 ${p2.stats.rage}/4` : '');
    this.updateFistStacks(this.p1Stacks, p1);
    this.updateFistStacks(this.p2Stacks, p2);
    this.updateStatusIcons(this.p1Statuses, p1, now, false);
    this.updateStatusIcons(this.p2Statuses, p2, now, true);
    this.p1Value.setText(`${Math.ceil(p1.stats.health)}`);
    this.p2Value.setText(`${Math.ceil(p2.stats.health)}`);
  }

  private drawBars(
    x: number,
    y: number,
    health: number,
    trail: number,
    maxHealth: number,
    mana: number,
    manaFlash: boolean,
    reverse: boolean,
  ): void {
    const width = 380;
    const origin = reverse ? x - width : x;
    const healthRatio = Phaser.Math.Clamp(health / maxHealth, 0, 1);
    const trailRatio = Phaser.Math.Clamp(trail / maxHealth, 0, 1);
    this.graphics.fillStyle(0x070916, 0.9).fillRoundedRect(origin - 4, y - 4, width + 8, 30, 6);
    this.graphics.fillStyle(0xffa44f, 0.55)
      .fillRect(reverse ? x - width * trailRatio : x, y, width * trailRatio, 22);
    this.graphics.fillStyle(healthRatio > 0.35 ? 0x55e28c : 0xff5b62)
      .fillRect(reverse ? x - width * healthRatio : x, y, width * healthRatio, 22);
    this.graphics.fillStyle(0x080b18).fillRoundedRect(origin, y + 32, width, 13, 4);
    this.graphics.fillStyle(manaFlash ? 0xffffff : mana >= 60 ? 0xb06cff : 0x4ba8ff)
      .fillRoundedRect(reverse ? x - width * mana / 100 : x, y + 32, width * mana / 100, 13, 4);
  }

  private updateFistStacks(icons: Phaser.GameObjects.Image[], fighter: Fighter): void {
    icons.forEach((icon, index) => {
      const visible = fighter.fighterConfig.id === 'fist';
      icon.setVisible(visible);
      if (!visible) return;
      const direction = fighter.playerNumber === 1 ? 1 : -1;
      icon
        .setPosition(fighter.x + (index - 1.5) * 18, fighter.y - 72)
        .clearTint()
        .setTint(index < fighter.stats.rage ? 0xff9f31 : 0xc9cedc)
        .setAlpha(index < fighter.stats.rage ? 1 : 0.55)
        .setScale(direction * 0.22, 0.22);
    });
  }

  private updateStatusIcons(
    icons: Phaser.GameObjects.Text[],
    fighter: Fighter,
    now: number,
    reverse: boolean,
  ): void {
    const presentation: Record<
      FighterStatusEffect,
      { symbol: string; background: string }
    > = {
      invulnerable: { symbol: '◆', background: '#d9ecff' },
      haste: { symbol: '»', background: '#168fb8' },
      'attack-speed-up': { symbol: '↯', background: '#256fc4' },
      'damage-up': { symbol: '▲', background: '#258d56' },
      slow: { symbol: '◷', background: '#4d56a8' },
      weakened: { symbol: '−', background: '#6a526f' },
      'move-speed-down': { symbol: '⇣', background: '#5a3f91' },
      burn: { symbol: '♨', background: '#b73525' },
      stun: { symbol: '✹', background: '#b37618' },
    };
    const effects = fighter.getStatusEffects(now);
    icons.forEach((icon, index) => {
      const effect = effects[index];
      icon.setVisible(Boolean(effect));
      if (!effect) return;
      const item = presentation[effect];
      const x = reverse ? 1170 - index * 42 : 110 + index * 42;
      icon
        .setPosition(x, 101)
        .setText(item.symbol)
        .setColor(effect === 'invulnerable' ? '#182239' : '#ffffff')
        .setBackgroundColor(item.background)
        .setAlpha(0.9 + Math.sin(now / 160 + index) * 0.1);
    });
  }
}
