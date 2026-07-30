import Phaser from 'phaser';
import type { FighterId } from '../data/types';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload(): void {
    this.load.image('weapon-fist', 'assets/weapon-fist.png');
    this.load.image('weapon-minigun', 'assets/weapon-minigun.png');
  }

  create(): void {
    const fighterIds: FighterId[] = ['sword', 'fist', 'minigun', 'clock', 'plant', 'rock'];
    this.createBodyTexture();
    fighterIds.forEach((id) => {
      this.createFighterTexture(id);
      if (id !== 'fist' && id !== 'minigun') this.createWeaponTexture(id);
    });
    this.createMinigunGripTexture();
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff).fillRect(0, 0, 32, 32);
    g.generateTexture('pixel', 32, 32);
    g.destroy();
    this.registry.set('settings', {
      mode: 'single', p1: 'sword', p2: 'fist', map: 'meadow',
    });
    this.scene.start('TitleScene');
  }

  private createBodyTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(5, 0x050812, 1);
    g.fillStyle(0xffffff).fillCircle(22, 22, 19).strokeCircle(22, 22, 19);
    g.lineStyle(3, 0xb9c7e8, 0.7).beginPath().arc(18, 18, 12, 3.55, 5.25).strokePath();
    g.fillStyle(0xffffff, 0.35).fillCircle(15, 14, 5);
    g.lineStyle(2, 0x050812, 0.55).beginPath().arc(23, 27, 10, 0.25, 1.35).strokePath();
    g.generateTexture('fighter-body', 44, 44);
    g.destroy();
  }

  private createWeaponTexture(id: FighterId): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    this.drawWeapon(g, id, 0, 0, 1);
    g.generateTexture(`weapon-${id}`, 84, 56);
    g.destroy();
  }

  private createMinigunGripTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const outline = 0x050812;
    g.fillStyle(0x7786aa).fillRoundedRect(2, 3, 27, 13, 3);
    g.lineStyle(3, outline, 1).strokeRoundedRect(2, 3, 27, 13, 3);
    g.fillStyle(0xe7efff, 0.8).fillRoundedRect(5, 5, 21, 3, 1);
    g.generateTexture('weapon-minigun-grip', 32, 20);
    g.destroy();
  }

  private createFighterTexture(id: FighterId): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(5, 0x050812, 1);
    g.fillStyle(0xffffff).fillCircle(35, 38, 21).strokeCircle(35, 38, 21);
    g.lineStyle(3, 0xb9c7e8, 0.75).beginPath().arc(30, 34, 13, 3.55, 5.2).strokePath();
    g.fillStyle(0xffffff, 0.35).fillCircle(27, 29, 5);
    this.drawWeapon(g, id, 45, 8, 0.58);
    g.generateTexture(`fighter-${id}`, 96, 64);
    g.destroy();
  }

  private drawWeapon(
    g: Phaser.GameObjects.Graphics,
    id: FighterId,
    offsetX: number,
    offsetY: number,
    scale: number,
  ): void {
    const x = (value: number) => offsetX + value * scale;
    const y = (value: number) => offsetY + value * scale;
    const s = (value: number) => value * scale;
    const outline = 0x050812;
    const metal = 0xe7efff;
    const shade = 0x7786aa;
    const dark = 0x27314d;
    const points = (values: number[]) => {
      const result: Phaser.Geom.Point[] = [];
      for (let index = 0; index < values.length; index += 2) {
        result.push(new Phaser.Geom.Point(x(values[index]), y(values[index + 1])));
      }
      return result;
    };
    const polygon = (values: number[], fill = metal, line = Math.max(2, s(4))) => {
      const shape = points(values);
      g.fillStyle(fill).fillPoints(shape, true);
      g.lineStyle(line, outline, 1).strokePoints(shape, true);
    };

    if (id === 'sword') {
      polygon([24, 35, 61, 4, 75, 5, 74, 17, 37, 42], 0xd9dde5);
      polygon([31, 34, 62, 9, 68, 10, 36, 38], 0xf2f3f5, Math.max(1, s(2)));
      polygon([61, 4, 75, 5, 74, 17, 66, 15], 0xaeb4c0, Math.max(1, s(2)));
      polygon([17, 29, 40, 43, 34, 50, 11, 35], 0xa95708, Math.max(2, s(4)));
      polygon([14, 41, 25, 48, 13, 55, 4, 48], 0x934500, Math.max(2, s(3)));
      return;
    }
    if (id === 'fist') {
      g.fillStyle(dark).fillRoundedRect(x(8), y(30), s(24), s(19), s(5));
      g.lineStyle(Math.max(2, s(4)), outline).strokeRoundedRect(x(8), y(30), s(24), s(19), s(5));
      g.fillStyle(metal).fillRoundedRect(x(24), y(18), s(43), s(29), s(9));
      g.lineStyle(Math.max(2, s(4)), outline).strokeRoundedRect(x(24), y(18), s(43), s(29), s(9));
      [31, 42, 53, 64].forEach((center) => {
        g.fillStyle(0xffffff).fillCircle(x(center), y(17), s(8));
        g.lineStyle(Math.max(2, s(3)), outline).strokeCircle(x(center), y(17), s(8));
      });
      polygon([28, 31, 41, 24, 57, 28, 64, 42, 43, 45], shade, Math.max(1, s(2)));
      g.lineStyle(Math.max(1, s(2)), 0xffffff, 0.65)
        .lineBetween(x(14), y(35), x(27), y(35))
        .lineBetween(x(14), y(41), x(25), y(41));
      return;
    }
    if (id === 'minigun') {
      g.fillStyle(metal).fillCircle(x(24), y(29), s(16));
      g.lineStyle(Math.max(2, s(4)), outline).strokeCircle(x(24), y(29), s(16));
      g.fillStyle(shade).fillRect(x(27), y(13), s(9), s(32));
      g.lineStyle(Math.max(2, s(3)), outline).strokeRect(x(27), y(13), s(9), s(32));
      [14, 23, 32, 41].forEach((barrelY) => {
        g.fillStyle(metal).fillRoundedRect(x(35), y(barrelY), s(43), s(6), s(2));
        g.lineStyle(Math.max(1, s(2)), outline).strokeRoundedRect(x(35), y(barrelY), s(43), s(6), s(2));
      });
      polygon([3, 7, 21, 20, 16, 28, 0, 16], shade, Math.max(2, s(3)));
      g.fillStyle(metal).fillRect(x(29), y(6), s(3), s(8));
      return;
    }
    if (id === 'clock') {
      [10, 25, 40, 55].forEach((angle) => {
        const radians = Phaser.Math.DegToRad(angle * 2.3);
        const cx = 35 + Math.cos(radians) * 23;
        const cy = 28 + Math.sin(radians) * 23;
        g.fillStyle(shade).fillRect(x(cx - 3), y(cy - 3), s(6), s(6));
      });
      g.fillStyle(metal).fillCircle(x(35), y(28), s(23));
      g.lineStyle(Math.max(2, s(5)), outline).strokeCircle(x(35), y(28), s(23));
      g.fillStyle(dark).fillCircle(x(35), y(28), s(16));
      g.lineStyle(Math.max(1, s(2)), shade).strokeCircle(x(35), y(28), s(16));
      g.lineStyle(Math.max(2, s(3)), metal)
        .lineBetween(x(35), y(28), x(35), y(15))
        .lineBetween(x(35), y(28), x(47), y(34));
      g.fillStyle(metal).fillCircle(x(35), y(28), s(4));
      polygon([54, 37, 75, 43, 70, 51, 49, 42], shade, Math.max(2, s(3)));
      return;
    }
    if (id === 'plant') {
      g.fillStyle(metal).fillRoundedRect(x(8), y(23), s(37), s(27), s(7));
      g.lineStyle(Math.max(2, s(4)), outline).strokeRoundedRect(x(8), y(23), s(37), s(27), s(7));
      g.lineStyle(Math.max(2, s(5)), outline).beginPath().arc(x(28), y(25), s(17), 3.35, 6.05).strokePath();
      polygon([42, 28, 70, 13, 77, 20, 45, 39], shade, Math.max(2, s(3)));
      g.fillStyle(metal).fillCircle(x(75), y(16), s(8));
      g.lineStyle(Math.max(2, s(3)), outline).strokeCircle(x(75), y(16), s(8));
      g.lineStyle(Math.max(1, s(2)), outline)
        .lineBetween(x(10), y(35), x(41), y(35))
        .lineBetween(x(20), y(25), x(20), y(48));
      polygon([55, 8, 61, 1, 67, 8, 61, 14], 0xffffff, Math.max(1, s(2)));
      return;
    }

    g.fillStyle(dark).fillRoundedRect(x(5), y(35), s(36), s(9), s(3));
    g.lineStyle(Math.max(2, s(4)), outline).strokeRoundedRect(x(5), y(35), s(36), s(9), s(3));
    polygon([35, 29, 48, 6, 69, 2, 82, 21, 69, 45, 47, 43]);
    polygon([48, 8, 58, 23, 42, 31, 39, 22], shade, Math.max(1, s(2)));
    polygon([59, 22, 76, 19, 68, 39, 48, 36], 0xffffff, Math.max(1, s(2)));
    g.lineStyle(Math.max(1, s(2)), 0xffffff, 0.55)
      .beginPath().arc(x(61), y(25), s(26), 3.4, 6.1).strokePath();
  }
}
