import Phaser from 'phaser';
import { fighters } from '../data/fighters';
import type { FighterId, MatchSettings } from '../data/types';
import {
  addBackdrop,
  addButton,
  addTitle,
  fontBody,
  fontDisplay,
  fontTech,
  palette,
} from '../ui/ui';

const fighterOrder: FighterId[] = ['sword', 'fist', 'minigun', 'clock', 'plant', 'rock'];

export class CharacterSelectScene extends Phaser.Scene {
  private selecting: 1 | 2 = 1;
  private p1: FighterId = 'sword';
  private status!: Phaser.GameObjects.Text;
  private previewAvatar!: Phaser.GameObjects.Container;
  private previewName!: Phaser.GameObjects.Text;
  private previewRole!: Phaser.GameObjects.Text;
  private previewStyle!: Phaser.GameObjects.Text;
  private previewProfileBars!: Phaser.GameObjects.Graphics;
  private previewMoveBars!: Phaser.GameObjects.Graphics;
  private previewMoveRows: Phaser.GameObjects.Text[] = [];
  private previewMoveValues: Phaser.GameObjects.Text[] = [];
  private p1RailAvatar!: Phaser.GameObjects.Container;
  private p2RailAvatar!: Phaser.GameObjects.Container;
  private p1RailName!: Phaser.GameObjects.Text;
  private p2RailName!: Phaser.GameObjects.Text;
  private readonly cardFrames = new Map<FighterId, Phaser.GameObjects.Rectangle>();
  private readonly cardBadges = new Map<FighterId, Phaser.GameObjects.Text>();
  private keyboardHandler?: (event: KeyboardEvent) => void;

  constructor() { super('CharacterSelectScene'); }

  create(): void {
    this.selecting = 1;
    this.p1 = 'sword';
    this.cardFrames.clear();
    this.cardBadges.clear();
    this.previewMoveRows = [];
    this.previewMoveValues = [];

    addBackdrop(this, 0x142951);
    addTitle(this, '파이터 선택', 'CHOOSE YOUR FIGHTER  ·  숫자키 1–6');
    this.playerRail();

    fighterOrder.forEach((id, index) => {
      const x = 145 + (index % 3) * 190;
      const y = 290 + Math.floor(index / 3) * 174;
      this.card(x, y, id, index + 1);
    });

    this.profilePanel();
    this.showPreview('sword');

    addButton(this, 640, 675, '승부 방식으로 돌아가기', () => this.scene.start('ModeSelectScene'), 270);
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.scene.start('ModeSelectScene');
        return;
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < fighterOrder.length) this.choose(fighterOrder[index]);
    };
    this.input.keyboard?.on('keydown', this.keyboardHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keyboardHandler) this.input.keyboard?.off('keydown', this.keyboardHandler);
    });
  }

  private playerRail(): void {
    this.add.rectangle(220, 151, 280, 42, 0x0d2849, 0.96)
      .setStrokeStyle(2, 0x37d8ff, 0.75);
    this.add.rectangle(1060, 151, 280, 42, 0x34182c, 0.96)
      .setStrokeStyle(2, 0xff6b9b, 0.75);
    this.add.text(96, 151, '1P', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '20px', color: '#71ebff',
    }).setOrigin(0, 0.5);
    this.add.text(1184, 151, '2P', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '20px', color: '#ff8db4',
    }).setOrigin(1, 0.5);
    this.p1RailAvatar = this.createRosterAvatar(142, 151, 'sword', 0.44)
      .setVisible(false);
    this.p2RailAvatar = this.createRosterAvatar(1138, 151, 'fist', 0.44, true)
      .setVisible(false);
    this.p1RailName = this.add.text(232, 151, '선택 대기', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#d6e8ff',
    }).setOrigin(0.5);
    this.p2RailName = this.add.text(1048, 151, '선택 대기', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#f4d6e2',
    }).setOrigin(0.5);
    this.status = this.add.text(640, 151, '1P가 파이터를 선택하세요', {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '15px', color: '#8feaff',
      backgroundColor: '#070c1e', padding: { x: 18, y: 8 },
    }).setOrigin(0.5);
  }

  private profilePanel(): void {
    this.add.rectangle(956, 414, 534, 444, 0x000000, 0.35);
    this.add.rectangle(950, 407, 526, 438, 0x090f22, 0.98)
      .setStrokeStyle(2, palette.cyan, 0.78);
    this.add.rectangle(950, 190, 518, 5, palette.cyan, 0.78);
    this.add.text(712, 207, 'FIGHTER PROFILE', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '12px', color: '#6d83b3',
      letterSpacing: 2,
    });

    this.add.circle(770, 277, 55, 0x061020, 0.92).setStrokeStyle(2, 0x2c4775, 0.8);
    this.previewAvatar = this.createRosterAvatar(770, 278, 'sword', 1.08);
    this.previewName = this.add.text(844, 238, '', {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '24px', color: '#ffffff',
    });
    this.previewRole = this.add.text(844, 277, '', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '12px', color: '#73e8ff',
      letterSpacing: 1,
    });
    this.previewStyle = this.add.text(844, 305, '', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#aebee0',
      wordWrap: { width: 300 },
    });

    this.add.rectangle(950, 342, 474, 1, 0x314368, 0.8);
    ['기동력', '화력', '사거리'].forEach((label, index) => {
      this.add.text(712, 359 + index * 22, label, {
        fontFamily: fontBody, fontStyle: 'bold', fontSize: '11px', color: '#8799c0',
      });
    });
    this.previewProfileBars = this.add.graphics();

    this.add.rectangle(950, 426, 474, 1, 0x314368, 0.8);
    this.add.text(712, 439, '기술 데이터', {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '12px', color: '#cbd7f2',
    });
    this.add.text(1188, 439, '피해  /  MP', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '11px', color: '#7185b0',
    }).setOrigin(1, 0);

    this.previewMoveBars = this.add.graphics();
    ['BASIC', 'SKILL', 'BURST'].forEach((label, index) => {
      const y = 463 + index * 48;
      this.previewMoveRows.push(this.add.text(712, y, label, {
        fontFamily: fontTech, fontStyle: 'bold', fontSize: '11px', color: '#e8edff',
      }));
      this.previewMoveValues.push(this.add.text(1188, y, '', {
        fontFamily: fontTech, fontStyle: 'bold', fontSize: '11px', color: '#ffffff',
      }).setOrigin(1, 0));
    });
  }

  private card(x: number, y: number, id: FighterId, number: number): void {
    const fighter = fighters[id];
    const shadow = this.add.rectangle(5, 7, 174, 148, 0x000000, 0.38);
    const panel = this.add.rectangle(0, 0, 174, 148, 0x0b1228, 0.98)
      .setStrokeStyle(2, 0x40527c, 0.78);
    const top = this.add.rectangle(0, -71, 170, 6, fighter.color, 0.95);
    const halo = this.add.circle(0, -23, 40, fighter.color, 0.075)
      .setStrokeStyle(2, fighter.color, 0.26);
    const avatar = this.createRosterAvatar(0, -22, id, 0.72);
    const name = this.add.text(0, 35, fighter.title, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5);
    const type = this.add.text(0, 58, fighter.role, {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '10px', color: '#7184ac',
    }).setOrigin(0.5);
    const numberBadge = this.add.text(-73, -63, String(number), {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '12px', color: '#081020',
      backgroundColor: '#ffffff', padding: { x: 5, y: 2 },
    }).setOrigin(0.5);
    const selectedBadge = this.add.text(71, -63, '', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '10px', color: '#ffffff',
      backgroundColor: '#18244a', padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setVisible(false);

    this.cardFrames.set(id, panel);
    this.cardBadges.set(id, selectedBadge);
    const container = this.add.container(
      x, y, [shadow, panel, top, halo, avatar, name, type, numberBadge, selectedBadge],
    ).setSize(174, 148).setInteractive();
    container.on('pointerover', () => {
      panel.setFillStyle(0x111b37).setStrokeStyle(3, fighter.color, 0.95);
      container.setScale(1.025);
      this.showPreview(id);
    });
    container.on('pointerout', () => {
      panel.setFillStyle(0x0b1228);
      if (this.p1 !== id || this.selecting === 1) panel.setStrokeStyle(2, 0x40527c, 0.78);
      container.setScale(1);
    });
    container.on('pointerdown', () => this.choose(id));
  }

  private showPreview(id: FighterId): void {
    const fighter = fighters[id];
    if (this.previewAvatar) this.populateRosterAvatar(this.previewAvatar, id);
    this.previewName?.setText(fighter.title);
    this.previewRole?.setText(`${fighter.name}  //  ${fighter.role}`);
    this.previewStyle?.setText(fighter.style);

    const speed = Phaser.Math.Clamp(Math.round((fighter.moveSpeed - 210) / 7), 1, 10);
    const power = Phaser.Math.Clamp(Math.round((fighter.basicAttack.damage + fighter.skill.damage) / 3.4), 1, 10);
    const range = Phaser.Math.Clamp(Math.round(fighter.basicAttack.hitboxWidth / 24), 1, 10);
    this.previewProfileBars.clear();
    [speed, power, range].forEach((value, index) => {
      const y = 362 + index * 22;
      this.previewProfileBars.fillStyle(0x040815, 0.95).fillRoundedRect(776, y, 412, 9, 3);
      this.previewProfileBars.fillStyle(index === 0 ? 0x37d8ff : index === 1 ? 0xff6672 : 0xa477ff)
        .fillRoundedRect(776, y, 412 * value / 10, 9, 3);
    });

    const maximumDamage = (kind: 'basic' | 'skill' | 'ultimate') => {
      if (id === 'sword' && kind === 'skill') return 35;
      if (id === 'sword' && kind === 'ultimate') return 40;
      if (id === 'fist' && kind === 'ultimate') return 60;
      if (id === 'minigun' && kind === 'basic') return 9;
      if (kind === 'basic') return fighter.basicAttack.damage;
      return fighter[kind].damage;
    };
    const moves = [
      { label: 'BASIC', config: fighter.basicAttack, damage: maximumDamage('basic') },
      { label: 'SKILL', config: fighter.skill, damage: maximumDamage('skill') },
      { label: 'BURST', config: fighter.ultimate, damage: maximumDamage('ultimate') },
    ];
    this.previewMoveBars.clear();
    moves.forEach((move, index) => {
      const y = 463 + index * 48;
      this.previewMoveRows[index]?.setText(`${move.label}  ${move.config.name}`);
      this.previewMoveValues[index]?.setText(`피해 ${move.damage}   MP ${move.config.manaCost}`);
      this.previewMoveBars.fillStyle(0x040815, 0.95).fillRoundedRect(712, y + 21, 300, 8, 3);
      this.previewMoveBars.fillStyle(0xff6672)
        .fillRoundedRect(712, y + 21, 300 * Phaser.Math.Clamp(move.damage / 60, 0, 1), 8, 3);
      this.previewMoveBars.fillStyle(0x040815, 0.95).fillRoundedRect(1030, y + 21, 158, 8, 3);
      if (move.config.manaCost > 0) {
        this.previewMoveBars.fillStyle(0xa477ff)
          .fillRoundedRect(1030, y + 21, 158 * move.config.manaCost / 100, 8, 3);
      }
    });
  }

  private choose(id: FighterId): void {
    this.showPreview(id);
    if (this.selecting === 1) {
      this.p1 = id;
      this.selecting = 2;
      this.populateRosterAvatar(this.p1RailAvatar, id);
      this.p1RailAvatar.setVisible(true);
      this.p1RailName.setText(fighters[id].title);
      this.cardBadges.forEach((badge) => badge.setText('').setVisible(false));
      this.cardBadges.get(id)?.setText('1P').setVisible(true);
      this.cardFrames.get(id)?.setStrokeStyle(3, palette.cyan, 1);
      this.status.setText('2P가 파이터를 선택하세요').setColor('#ff9fbc');
      return;
    }
    this.populateRosterAvatar(this.p2RailAvatar, id);
    this.p2RailAvatar.setVisible(true);
    this.p2RailName.setText(fighters[id].title);
    this.cardBadges.get(id)?.setText(id === this.p1 ? '1P·2P' : '2P').setVisible(true);
    const settings = this.registry.get('settings') as MatchSettings;
    this.registry.set('settings', { ...settings, p1: this.p1, p2: id });
    this.scene.start('MapSelectScene');
  }

  private createRosterAvatar(
    x: number,
    y: number,
    id: FighterId,
    scale: number,
    flipped = false,
  ): Phaser.GameObjects.Container {
    const avatar = this.add.container(x, y).setScale(flipped ? -scale : scale, scale);
    this.populateRosterAvatar(avatar, id);
    return avatar;
  }

  private populateRosterAvatar(
    avatar: Phaser.GameObjects.Container,
    id: FighterId,
  ): void {
    avatar.removeAll(true);
    if (id !== 'sword' && id !== 'fist' && id !== 'minigun') {
      avatar.add(this.add.image(0, 0, `fighter-${id}`).setTint(fighters[id].color));
      return;
    }

    const body = this.add.image(-10, 0, 'fighter-body').setTint(fighters[id].color);
    const weapon = this.add.image(0, -1, `weapon-${id}`)
      .setOrigin(0.12, 0.5)
      .setRotation(Phaser.Math.DegToRad(id === 'sword' ? -28 : id === 'fist' ? -8 : id === 'minigun' ? 1 : -4))
      .setScale(id === 'sword' ? 0.88 : id === 'fist' ? 0.84 : id === 'minigun' ? 0.616 : 0.88)
      .setTint(0xffffff);
    if (id === 'minigun') {
      const grip = this.add.image(-4, -8, 'weapon-minigun-grip')
        .setOrigin(1, 0.5)
        .setRotation(Phaser.Math.DegToRad(-36))
        .setScale(0.616)
        .setTint(0xffffff);
      avatar.add([body, weapon, grip]);
      return;
    }
    avatar.add([body, weapon]);
  }
}
