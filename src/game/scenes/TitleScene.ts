import Phaser from 'phaser';
import {
  addBackdrop,
  addKeyHint,
  fontBody,
  fontDisplay,
  fontTech,
  palette,
} from '../ui/ui';

export class TitleScene extends Phaser.Scene {
  private help?: Phaser.GameObjects.Container;
  private keyboardHandler?: (event: KeyboardEvent) => void;

  constructor() { super('TitleScene'); }

  create(): void {
    addBackdrop(this, 0x07556f);
    this.drawArenaBackdrop();

    const leftRing = this.add.circle(265, 315, 132, 0x072a4d, 0.9)
      .setStrokeStyle(5, 0x3ee7ff, 0.75);
    const rightRing = this.add.circle(1015, 315, 132, 0x401735, 0.9)
      .setStrokeStyle(5, 0xff5f9e, 0.75);
    this.add.circle(265, 315, 108, 0x27c8ff, 0.08).setStrokeStyle(2, 0xaaf5ff, 0.28);
    this.add.circle(1015, 315, 108, 0xff3f87, 0.08).setStrokeStyle(2, 0xffc0d7, 0.28);

    const p1 = this.add.image(265, 325, 'fighter-sword').setTint(0x4ce4ff).setScale(2.25);
    const p2Body = this.add.image(-10, 0, 'fighter-body').setTint(0xff668c);
    const p2FistOutline = this.add.image(0, -1, 'weapon-fist')
      .setOrigin(0.12, 0.5)
      .setRotation(Phaser.Math.DegToRad(-8))
      .setScale(0.91)
      .setTintFill(0x050812);
    const p2Fist = this.add.image(0, -1, 'weapon-fist')
      .setOrigin(0.12, 0.5)
      .setRotation(Phaser.Math.DegToRad(-8))
      .setScale(0.84)
      .setTintFill(0xff668c);
    const p2 = this.add.container(1015, 325, [p2Body, p2FistOutline, p2Fist]).setScale(-2.25, 2.25);
    this.tweens.add({ targets: p1, y: 316, duration: 1050, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: p2, y: 334, duration: 1050, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: [leftRing, rightRing], alpha: 0.68, duration: 820, yoyo: true, repeat: -1 });

    this.addPlayerBadge(265, 438, '1P', '특수 장검', 0x24dfff);
    this.addPlayerBadge(1015, 438, '2P', '격투', 0xff5d8e);

    this.add.text(640, 101, 'WFZ', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '126px', color: '#ffffff',
      stroke: '#07132c', strokeThickness: 18,
      shadow: { offsetX: 0, offsetY: 9, color: '#29dfff', blur: 16, fill: true },
    }).setOrigin(0.5);
    this.add.text(640, 183, 'WEAPON FIGHTERS Z', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '27px', color: '#75ebff',
      letterSpacing: 6, stroke: '#061027', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(640, 238, 'VS', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '70px', color: '#fff4b4',
      stroke: '#ff4d6d', strokeThickness: 9,
      shadow: { offsetX: 0, offsetY: 0, color: '#ffb13b', blur: 18, fill: true },
    }).setOrigin(0.5).setRotation(-0.08);
    this.add.text(640, 298, '한 키보드로 붙는 로컬 2인 대전', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '18px',
      color: '#dbeaff', letterSpacing: 2,
    }).setOrigin(0.5);

    this.addPrimaryButton(640, 476, () => this.scene.start('ModeSelectScene'));
    this.addHelpButton(640, 574);
    addKeyHint(this, 540, 648, 'ENTER', '바로 대전');
    addKeyHint(this, 714, 648, 'ESC', '창 닫기');

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !this.help) this.scene.start('ModeSelectScene');
      if (event.key === 'Escape' && this.help) this.toggleHelp();
    };
    this.input.keyboard?.on('keydown', this.keyboardHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keyboardHandler) this.input.keyboard?.off('keydown', this.keyboardHandler);
    });
  }

  private drawArenaBackdrop(): void {
    const g = this.add.graphics();
    g.fillStyle(0x15bde8, 0.12).fillTriangle(0, 95, 495, 95, 325, 720);
    g.fillStyle(0xff3b82, 0.1).fillTriangle(1280, 95, 785, 95, 955, 720);
    g.fillStyle(0x060a19, 0.76).fillRect(0, 602, 1280, 118);
    g.lineStyle(3, 0x56e8ff, 0.23).lineBetween(0, 602, 1280, 602);
    for (let x = 40; x < 1280; x += 96) {
      g.lineStyle(2, x < 640 ? 0x35dfff : 0xff5b98, 0.14);
      g.lineBetween(640, 602, x, 720);
    }
    for (let y = 630; y < 720; y += 28) {
      g.lineStyle(1, 0xb7eaff, 0.12).lineBetween(0, y, 1280, y);
    }
    for (let i = 0; i < 18; i += 1) {
      const left = i % 2 === 0;
      const spark = this.add.rectangle(
        left ? 85 + (i * 67) % 430 : 770 + (i * 83) % 430,
        130 + (i * 71) % 390,
        34 + (i % 4) * 9,
        3,
        left ? 0x52e8ff : 0xff6b9d,
        0.22,
      ).setRotation(left ? -0.45 : 0.45);
      this.tweens.add({
        targets: spark,
        alpha: 0.65,
        x: spark.x + (left ? 28 : -28),
        duration: 760 + i * 35,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private addPlayerBadge(x: number, y: number, player: string, fighter: string, color: number): void {
    this.add.rectangle(x, y, 224, 48, 0x080d20, 0.95).setStrokeStyle(3, color, 0.85);
    this.add.rectangle(x - 88, y, 42, 48, color, 1);
    this.add.text(x - 88, y, player, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '19px', color: '#071020',
    }).setOrigin(0.5);
    this.add.text(x + 10, y, fighter, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '17px', color: '#ffffff',
    }).setOrigin(0.5);
  }

  private addPrimaryButton(x: number, y: number, onClick: () => void): void {
    const glow = this.add.rectangle(0, 8, 444, 82, 0x13dfff, 0.22);
    const bg = this.add.rectangle(0, 0, 428, 72, 0x35dfff, 1)
      .setStrokeStyle(4, 0xe9fcff, 0.95);
    const edge = this.add.rectangle(-204, 0, 12, 52, 0x4168ff, 1);
    const label = this.add.text(0, -7, '게임 시작', {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '27px', color: '#071329',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 22, 'PRESS ENTER TO BATTLE', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '11px',
      color: '#15516b', letterSpacing: 3,
    }).setOrigin(0.5);
    const button = this.add.container(x, y, [glow, bg, edge, label, sub])
      .setSize(444, 82).setInteractive();
    button.on('pointerover', () => {
      bg.setFillStyle(0xffffff);
      glow.setAlpha(0.5);
      button.setScale(1.035);
    });
    button.on('pointerout', () => {
      bg.setFillStyle(0x35dfff);
      glow.setAlpha(0.22);
      button.setScale(1);
    });
    button.on('pointerdown', () => button.setScale(0.98));
    button.on('pointerup', onClick);
    this.tweens.add({ targets: glow, alpha: 0.5, duration: 620, yoyo: true, repeat: -1 });
  }

  private addHelpButton(x: number, y: number): void {
    const bg = this.add.rectangle(0, 0, 260, 52, 0x0a1025, 0.94)
      .setStrokeStyle(2, 0x7188c9, 0.8);
    const text = this.add.text(0, 0, '조작 방법  ·  HOW TO PLAY', {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '15px', color: '#dce7ff',
    }).setOrigin(0.5);
    const button = this.add.container(x, y, [bg, text]).setSize(260, 52).setInteractive();
    button.on('pointerover', () => bg.setFillStyle(0x1b2857));
    button.on('pointerout', () => bg.setFillStyle(0x0a1025));
    button.on('pointerup', () => this.toggleHelp());
  }

  private toggleHelp(): void {
    if (this.help) {
      this.help.destroy(true);
      this.help = undefined;
      return;
    }
    const shade = this.add.rectangle(0, 0, 1280, 720, 0x03050d, 0.82);
    const panel = this.add.rectangle(0, 0, 1030, 560, 0x080e21, 0.99)
      .setStrokeStyle(4, palette.cyan);
    const title = this.add.text(0, -235, 'KEYBOARD CONTROL', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '29px', color: '#ffffff',
      letterSpacing: 4,
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, -195, '한 키보드 · 두 명의 파이터', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '15px', color: '#7d90bd',
    }).setOrigin(0.5);
    const divider = this.add.rectangle(0, 0, 2, 340, 0x34456f, 0.7);
    const p1Title = this.add.text(-250, -156, '1P  //  CYAN', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '18px', color: '#57e8ff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    const p2Title = this.add.text(250, -156, '2P  //  MAGENTA', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '18px', color: '#ff78a7',
      letterSpacing: 2,
    }).setOrigin(0.5);
    const controls: Phaser.GameObjects.GameObject[] = [
      this.helpKey(-250, -102, 'W', '점프', 0x38d7ff),
      this.helpKey(-315, -32, 'A', '왼쪽', 0x38d7ff),
      this.helpKey(-185, -32, 'D', '오른쪽', 0x38d7ff),
      this.helpKey(-350, 75, 'Q', '필살기', 0xff5f93),
      this.helpKey(-250, 75, 'E', '기본 공격', 0xffbf58),
      this.helpKey(-150, 75, 'R', '스킬', 0xa97aff),
      this.helpKey(250, -102, 'P', '점프', 0xff78a7),
      this.helpKey(185, -32, 'L', '왼쪽', 0xff78a7),
      this.helpKey(315, -32, "'", '오른쪽', 0xff78a7),
      this.helpKey(150, 75, 'O', '필살기', 0xff5f93),
      this.helpKey(250, 75, '[', '기본 공격', 0xffbf58),
      this.helpKey(350, 75, ']', '스킬', 0xa97aff),
    ];
    const legendItems = [
      { x: -210, label: '이동·점프', color: 0x38d7ff },
      { x: -65, label: '기본 공격', color: 0xffbf58 },
      { x: 75, label: '스킬', color: 0xa97aff },
      { x: 185, label: '필살기', color: 0xff5f93 },
    ].map(({ x, label, color }) => {
      const dot = this.add.circle(-43, 0, 6, color);
      const text = this.add.text(-28, 0, label, {
        fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#cbd6f2',
      }).setOrigin(0, 0.5);
      return this.add.container(x, 157, [dot, text]);
    });
    const note = this.add.text(0, 200, 'ESC  전투 일시정지   ·   마나는 자동 회복   ·   같은 파이터 선택 가능', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#7f91bb',
    }).setOrigin(0.5);
    const close = this.add.text(0, 246, '화면 또는 ESC를 눌러 닫기', {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '14px', color: '#74e5ff',
    }).setOrigin(0.5);
    this.help = this.add.container(640, 360, [
      shade, panel, title, subtitle, divider, p1Title, p2Title,
      ...controls, ...legendItems, note, close,
    ]).setDepth(200)
      .setSize(1280, 720).setInteractive();
    this.help.once('pointerdown', () => this.toggleHelp());
  }

  private helpKey(
    x: number,
    y: number,
    key: string,
    label: string,
    color: number,
  ): Phaser.GameObjects.Container {
    const shadow = this.add.rectangle(4, 5, 64, 58, 0x000000, 0.45);
    const glow = this.add.rectangle(0, 0, 68, 62, color, 0.1);
    const cap = this.add.rectangle(0, 0, 60, 54, 0x111a35, 1)
      .setStrokeStyle(3, color, 0.95);
    const top = this.add.rectangle(0, -22, 48, 3, 0xffffff, 0.32);
    const text = this.add.text(0, -2, key, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '23px', color: '#ffffff',
    }).setOrigin(0.5);
    const caption = this.add.text(0, 42, label, {
      fontFamily: fontBody, fontStyle: 'bold', fontSize: '12px', color: '#aebbdc',
    }).setOrigin(0.5);
    return this.add.container(x, y, [shadow, glow, cap, top, text, caption]);
  }
}
