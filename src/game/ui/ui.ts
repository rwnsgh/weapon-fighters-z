import Phaser from 'phaser';

export const fontDisplay = '"WFZ Sans", "Noto Sans KR", "Malgun Gothic", sans-serif';
export const fontBody = '"WFZ Sans", "Noto Sans KR", "Malgun Gothic", sans-serif';
export const fontTech = '"Bahnschrift", "WFZ Sans", "Noto Sans KR", sans-serif';

export const palette = {
  ink: '#f6f7ff',
  muted: '#aab8dc',
  panel: 0x101733,
  panelBright: 0x18234a,
  cyan: 0x37d8ff,
  blue: 0x4d6fff,
  gold: 0xffd66b,
  danger: 0xff4f72,
};

export function addBackdrop(scene: Phaser.Scene, accent = 0x253b78): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x040713, 0x090d24, accent, 0x080c1e, 1);
  g.fillRect(0, 0, 1280, 720);
  g.fillStyle(palette.blue, 0.92).fillRect(0, 0, 1280, 8);
  g.fillStyle(palette.cyan, 0.3).fillRect(0, 8, 1280, 3);
  g.fillStyle(0x030712, 0.78).fillRect(0, 654, 1280, 66);
  g.fillStyle(palette.cyan, 0.06).fillCircle(174, 252, 245);
  g.fillStyle(palette.danger, 0.035).fillCircle(1120, 330, 310);
  g.lineStyle(2, palette.cyan, 0.09).strokeCircle(174, 252, 205);
  g.lineStyle(2, palette.blue, 0.1).strokeCircle(1120, 330, 260);

  for (let i = 0; i < 11; i += 1) {
    const y = 120 + i * 52;
    g.lineStyle(1, 0x88a8e8, 0.075);
    g.lineBetween(-40, y, 1320, y - 66);
  }
  for (let x = -120; x < 1400; x += 110) {
    g.lineStyle(1, palette.cyan, 0.075);
    g.lineBetween(640, 500, x, 720);
  }
  g.lineStyle(2, palette.cyan, 0.2).lineBetween(0, 654, 1280, 654);
  g.fillStyle(palette.blue, 0.16).fillTriangle(0, 130, 0, 510, 210, 310);
  g.fillStyle(palette.danger, 0.1).fillTriangle(1280, 170, 1280, 540, 1080, 350);

  for (let index = 0; index < 18; index += 1) {
    const left = index % 2 === 0;
    const spark = scene.add.rectangle(
      left ? 55 + (index * 83) % 450 : 790 + (index * 71) % 430,
      150 + (index * 97) % 430,
      22 + (index % 4) * 8,
      2,
      left ? palette.cyan : palette.danger,
      0.16,
    ).setRotation(left ? -0.55 : 0.55);
    scene.tweens.add({
      targets: spark,
      x: spark.x + (left ? 25 : -25),
      alpha: 0.58,
      duration: 900 + index * 37,
      yoyo: true,
      repeat: -1,
    });
  }
}

export function addTitle(scene: Phaser.Scene, title: string, subtitle?: string): void {
  scene.add.polygon(646, 69, [-566, -49, 566, -49, 536, 49, -536, 49], 0x000000, 0.3);
  scene.add.polygon(640, 64, [-566, -47, 566, -47, 536, 47, -536, 47], 0x080d20, 0.96)
    .setStrokeStyle(2, palette.blue, 0.62);
  scene.add.rectangle(640, 111, 250, 3, palette.cyan, 0.9);
  scene.add.text(640, 51, title, {
    fontFamily: fontDisplay,
    fontStyle: 'bold',
    fontSize: '36px',
    color: palette.ink,
    stroke: '#060817',
    strokeThickness: 4,
  }).setOrigin(0.5);
  if (subtitle) {
    scene.add.text(640, 91, subtitle, {
      fontFamily: fontTech, fontStyle: 'bold',
      fontSize: '12px', color: '#7ee8ff', letterSpacing: 2,
    }).setOrigin(0.5);
  }
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  width = 360,
): Phaser.GameObjects.Container {
  const isBackButton = label.startsWith('←') || label.includes('돌아가기');
  const displayLabel = isBackButton ? label.replace(/^←\s*/, '') : label;
  const arrowRestX = isBackButton ? -width / 2 + 28 : width / 2 - 28;
  const arrowHoverX = isBackButton ? -width / 2 + 20 : width / 2 - 20;
  const shadow = scene.add.rectangle(7, 9, width, 66, 0x000000, 0.42);
  const glow = scene.add.rectangle(0, 4, width + 10, 70, palette.cyan, 0.06);
  const bg = scene.add.rectangle(0, 0, width, 64, palette.panel, 0.98)
    .setStrokeStyle(2, palette.cyan, 0.82);
  const accent = scene.add.rectangle(-width / 2 + 7, 0, 10, 46, palette.blue, 1);
  const sheen = scene.add.rectangle(0, -27, width - 18, 2, 0xffffff, 0.22);
  const arrow = scene.add.text(arrowRestX, 0, isBackButton ? '‹' : '›', {
    fontFamily: fontTech, fontStyle: 'bold', fontSize: '31px', color: '#50ddff',
  }).setOrigin(0.5);
  const text = scene.add.text(0, 0, displayLabel, {
    fontFamily: fontDisplay,
    fontStyle: 'bold',
    fontSize: '20px',
    color: palette.ink,
  }).setOrigin(0.5);
  const container = scene.add.container(x, y, [shadow, glow, bg, accent, sheen, text, arrow])
    .setSize(width, 70).setInteractive();
  container.on('pointerover', () => {
    bg.setFillStyle(palette.panelBright);
    bg.setStrokeStyle(3, palette.cyan, 1);
    glow.setAlpha(0.22);
    arrow.setX(arrowHoverX);
    container.setScale(1.025);
  });
  container.on('pointerout', () => {
    bg.setFillStyle(palette.panel);
    glow.setAlpha(0.06);
    arrow.setX(arrowRestX);
    container.setScale(1);
  });
  container.on('pointerdown', () => container.setScale(0.985));
  container.on('pointerup', () => {
    container.setScale(1.025);
    onClick();
  });
  return container;
}

export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  accent = palette.cyan,
  alpha = 0.96,
): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(x + 9, y + 11, width, height, 0x000000, 0.38);
  scene.add.rectangle(x, y, width + 12, height + 12, accent, 0.045);
  const panel = scene.add.rectangle(x, y, width, height, palette.panel, alpha)
    .setStrokeStyle(3, accent, 0.8);
  scene.add.rectangle(x, y - height / 2 + 5, width - 16, 3, accent, 0.55);
  scene.add.rectangle(x - width / 2 + 6, y, 4, Math.min(82, height - 20), accent, 0.85);
  return panel;
}

export function addKeyHint(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  label: string,
): Phaser.GameObjects.Container {
  const keycap = scene.add.rectangle(0, 0, 44, 34, 0x202b55, 1)
    .setStrokeStyle(2, palette.cyan, 0.7);
  const keyText = scene.add.text(0, 0, key, {
    fontFamily: fontTech, fontStyle: 'bold', fontSize: '15px', color: '#ffffff',
  }).setOrigin(0.5);
  const caption = scene.add.text(34, 0, label, {
    fontFamily: fontBody, fontSize: '14px', color: palette.muted,
  }).setOrigin(0, 0.5);
  return scene.add.container(x, y, [keycap, keyText, caption]);
}
