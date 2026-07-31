import Phaser from 'phaser';
import type { GameMode, MatchSettings } from '../data/types';
import {
  addBackdrop, addButton, addTitle, fontBody, fontDisplay, fontTech, palette,
} from '../ui/ui';

export class ModeSelectScene extends Phaser.Scene {
  private keyboardHandler?: (event: KeyboardEvent) => void;

  constructor() { super('ModeSelectScene'); }

  create(): void {
    addBackdrop(this, 0x34265b);
    addTitle(this, '승부 방식 선택', 'HOW WILL YOU SETTLE THIS?');
    const choose = (mode: GameMode) => {
      const settings = this.registry.get('settings') as MatchSettings;
      this.registry.set('settings', { ...settings, mode });
      this.scene.start('CharacterSelectScene');
    };
    this.add.text(640, 166, 'MATCH PROTOCOL', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '13px', color: '#657bab',
      letterSpacing: 5,
    }).setOrigin(0.5);
    this.modeCard(
      390, 350, '01', '한 판 승부', 'QUICK DUEL',
      '한 번의 K.O.로 승부가 끝납니다.\n빠르고 선명한 단판 대결.',
      palette.cyan, () => choose('single'),
    );
    this.modeCard(
      890, 350, '02', '3판 2선승', 'BEST OF THREE',
      '먼저 두 라운드를 차지한 쪽이 승리.\n적응과 역전이 가능한 정식 대전.',
      0xff6a9b, () => choose('bestOf3'),
    );
    addButton(this, 640, 620, '← 돌아가기', () => this.scene.start('TitleScene'), 240);
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === '1') choose('single');
      if (event.key === '2') choose('bestOf3');
      if (event.key === 'Escape') this.scene.start('TitleScene');
    };
    this.input.keyboard?.on('keydown', this.keyboardHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keyboardHandler) this.input.keyboard?.off('keydown', this.keyboardHandler);
    });
  }

  private modeCard(
    x: number,
    y: number,
    number: string,
    title: string,
    tag: string,
    description: string,
    color: number,
    onClick: () => void,
  ): void {
    const shadow = this.add.rectangle(9, 12, 420, 300, 0x000000, 0.42);
    const glow = this.add.rectangle(0, 0, 432, 312, color, 0.055);
    const panel = this.add.rectangle(0, 0, 420, 300, 0x0a1024, 0.97)
      .setStrokeStyle(3, color, 0.72);
    const top = this.add.rectangle(0, -135, 414, 24, color, 0.88);
    const index = this.add.text(-170, -101, number, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '64px', color: '#ffffff',
      stroke: '#070b19', strokeThickness: 7,
    }).setOrigin(0.5);
    const iconRing = this.add.circle(108, -87, 48, color, 0.11).setStrokeStyle(3, color, 0.65);
    const icons = number === '01'
      ? [this.add.circle(108, -87, 17, color, 0.95)]
      : [
          this.add.circle(88, -87, 14, color, 0.85),
          this.add.circle(108, -87, 14, color, 1),
          this.add.circle(128, -87, 14, color, 0.85),
        ];
    const heading = this.add.text(0, -15, title, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '29px', color: '#ffffff',
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, 25, tag, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '12px', color: '#7ee8ff',
      letterSpacing: 3,
    }).setOrigin(0.5);
    const copy = this.add.text(0, 84, description, {
      fontFamily: fontBody, fontSize: '15px', color: '#aeb9da', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    const select = this.add.text(0, 128, 'SELECT  ›', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '13px', color: '#ffffff',
      backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
      padding: { x: 16, y: 7 },
    }).setOrigin(0.5);
    const container = this.add.container(
      x, y, [shadow, glow, panel, top, index, iconRing, ...icons, heading, subtitle, copy, select],
    ).setSize(432, 312).setInteractive();
    container.on('pointerover', () => {
      panel.setFillStyle(0x121d3c).setStrokeStyle(4, color, 1);
      glow.setAlpha(0.18);
      container.setScale(1.025);
    });
    container.on('pointerout', () => {
      panel.setFillStyle(0x0a1024).setStrokeStyle(3, color, 0.72);
      glow.setAlpha(0.055);
      container.setScale(1);
    });
    container.on('pointerdown', () => container.setScale(0.99));
    container.on('pointerup', onClick);
  }
}
