import Phaser from 'phaser';
import type { FighterId } from '../data/types';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload(): void {
    this.load.image('minigun-skill-ready', 'assets/minigun-skill-ready.png');
    this.load.image('minigun-skill-active', 'assets/minigun-skill-active.png');
    this.load.image('grapple-hook', 'assets/grapple-hook.png');
    this.load.image('grapple-cable', 'assets/grapple-cable.png');
  }

  create(): void {
    const fighterIds: FighterId[] = ['sword', 'fist', 'minigun', 'clock', 'plant', 'rock'];
    this.createBodyTexture();
    fighterIds.forEach((id) => {
      this.createFighterTexture(id);
      this.createWeaponTexture(id);
    });
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 32, 32);
    g.generateTexture('pixel', 32, 32);
    g.destroy();
    this.registry.set('settings', {
      mode: 'single', p1: 'sword', p2: 'fist', map: 'meadow',
    });
    this.scene.start('TitleScene');
  }

  private createBodyTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(4, 0x080b12, 1);
    g.fillStyle(0xffffff).fillCircle(22, 22, 20).strokeCircle(22, 22, 20);
    g.lineStyle(2, 0xffffff, 0.38);
    g.beginPath().arc(17, 18, 12, 3.55, 5.1).strokePath();
    g.generateTexture('fighter-body', 44, 44);
    g.destroy();
  }

  private createWeaponTexture(id: FighterId): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const outline = 0x080b12;
    g.lineStyle(4, outline, 1);
    g.fillStyle(0xffffff);

    if (id === 'sword') {
      g.fillTriangle(4, 28, 54, 3, 14, 34).strokeTriangle(4, 28, 54, 3, 14, 34);
      g.fillRect(5, 29, 16, 6).strokeRect(5, 29, 16, 6);
      g.lineStyle(5, outline).lineBetween(10, 35, 5, 42);
    } else if (id === 'fist') {
      g.fillCircle(17, 14, 8).strokeCircle(17, 14, 8);
      g.fillCircle(27, 18, 8).strokeCircle(27, 18, 8);
      g.fillCircle(19, 28, 8).strokeCircle(19, 28, 8);
      g.fillRoundedRect(5, 20, 28, 14, 6).strokeRoundedRect(5, 20, 28, 14, 6);
    } else if (id === 'minigun') {
      g.fillRoundedRect(3, 12, 22, 18, 4).strokeRoundedRect(3, 12, 22, 18, 4);
      g.fillRect(22, 13, 31, 5).strokeRect(22, 13, 31, 5);
      g.fillRect(22, 24, 31, 5).strokeRect(22, 24, 31, 5);
      g.fillRect(9, 29, 8, 12).strokeRect(9, 29, 8, 12);
    } else if (id === 'clock') {
      g.fillCircle(25, 21, 18).strokeCircle(25, 21, 18);
      g.lineStyle(3, outline).lineBetween(25, 21, 25, 9).lineBetween(25, 21, 36, 27);
      g.fillStyle(outline).fillCircle(25, 21, 3);
      g.lineStyle(3, outline).strokeCircle(25, 21, 11);
    } else if (id === 'plant') {
      g.fillRoundedRect(7, 16, 27, 20, 5).strokeRoundedRect(7, 16, 27, 20, 5);
      g.fillTriangle(8, 18, 0, 11, 8, 28).strokeTriangle(8, 18, 0, 11, 8, 28);
      g.lineStyle(4, outline).beginPath().arc(23, 16, 12, 3.4, 6).strokePath();
      g.fillStyle(0xffffff).fillCircle(47, 8, 4).strokeCircle(47, 8, 4);
    } else {
      g.fillTriangle(3, 35, 13, 7, 34, 3).strokeTriangle(3, 35, 13, 7, 34, 3);
      g.fillTriangle(3, 35, 34, 3, 48, 32).strokeTriangle(3, 35, 34, 3, 48, 32);
      g.lineStyle(3, outline).lineBetween(16, 10, 24, 23).lineBetween(24, 23, 39, 17);
    }
    g.generateTexture(`weapon-${id}`, 56, 44);
    g.destroy();
  }

  private createFighterTexture(id: FighterId): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const outline = 0x080b12;
    g.lineStyle(4, outline, 1);
    g.fillStyle(0xffffff);
    g.fillCircle(48, 42, 20).strokeCircle(48, 42, 20);
    g.lineStyle(2, 0xffffff, 0.38);
    g.beginPath().arc(43, 38, 12, 3.55, 5.1).strokePath();
    g.lineStyle(4, outline, 1);

    if (id === 'sword') {
      g.fillStyle(0xffffff);
      g.fillTriangle(57, 39, 92, 15, 65, 45).strokeTriangle(57, 39, 92, 15, 65, 45);
      g.fillRect(55, 40, 15, 6).strokeRect(55, 40, 15, 6);
      g.lineStyle(5, outline).lineBetween(59, 45, 53, 52);
    } else if (id === 'fist') {
      g.fillStyle(0xffffff);
      g.fillCircle(68, 35, 8).strokeCircle(68, 35, 8);
      g.fillCircle(76, 40, 8).strokeCircle(76, 40, 8);
      g.fillCircle(68, 47, 8).strokeCircle(68, 47, 8);
      g.fillRoundedRect(59, 40, 21, 13, 6).strokeRoundedRect(59, 40, 21, 13, 6);
    } else if (id === 'minigun') {
      g.fillStyle(0xffffff).fillRoundedRect(59, 34, 19, 15, 4).strokeRoundedRect(59, 34, 19, 15, 4);
      g.fillRect(75, 35, 18, 4).strokeRect(75, 35, 18, 4);
      g.fillRect(75, 44, 18, 4).strokeRect(75, 44, 18, 4);
      g.fillRect(63, 48, 7, 10).strokeRect(63, 48, 7, 10);
    } else if (id === 'clock') {
      g.fillStyle(0xffffff).fillCircle(70, 40, 13).strokeCircle(70, 40, 13);
      g.lineStyle(3, outline).lineBetween(70, 40, 70, 31).lineBetween(70, 40, 78, 45);
      g.fillStyle(outline).fillCircle(70, 40, 3);
      g.lineStyle(3, outline).strokeCircle(70, 40, 8);
    } else if (id === 'plant') {
      g.fillStyle(0xffffff).fillRoundedRect(59, 37, 19, 16, 5).strokeRoundedRect(59, 37, 19, 16, 5);
      g.fillTriangle(60, 39, 50, 34, 60, 47).strokeTriangle(60, 39, 50, 34, 60, 47);
      g.lineStyle(4, outline).beginPath().arc(69, 37, 9, 3.4, 6).strokePath();
      g.fillStyle(0xffffff).fillCircle(86, 31, 4).strokeCircle(86, 31, 4);
    } else {
      g.fillStyle(0xffffff);
      g.fillTriangle(57, 49, 65, 27, 80, 23).strokeTriangle(57, 49, 65, 27, 80, 23);
      g.fillTriangle(57, 49, 80, 23, 89, 46).strokeTriangle(57, 49, 80, 23, 89, 46);
      g.lineStyle(3, outline).lineBetween(67, 30, 73, 40).lineBetween(73, 40, 83, 36);
    }
    g.generateTexture(`fighter-${id}`, 96, 64);
    g.destroy();
  }
}
