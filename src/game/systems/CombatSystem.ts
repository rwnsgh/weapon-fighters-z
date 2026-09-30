import Phaser from 'phaser';
import { Fighter, type ActiveAttack } from '../entities/Fighter';

export class CombatSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onHit: (attacker: Fighter, target: Fighter, attack: ActiveAttack) => void,
  ) {}

  update(now: number, fighters: [Fighter, Fighter]): void {
    const [p1, p2] = fighters;
    // Capture both attacks and overlaps before applying either hit. This keeps
    // simultaneous trades identical for 1P and 2P even though JS runs in order.
    const p1Attack = p1.currentAttack;
    const p2Attack = p2.currentAttack;
    const p1WillHit = this.intersects(p1, p2);
    const p2WillHit = this.intersects(p2, p1);

    if (p1WillHit && p1Attack && p2.receiveAttackSnapshot(p1, p1Attack, now)) {
      this.onHit(p1, p2, p1Attack);
    }
    if (p2WillHit && p2Attack && p1.receiveAttackSnapshot(p2, p2Attack, now)) {
      this.onHit(p2, p1, p2Attack);
    }
  }

  private intersects(attacker: Fighter, target: Fighter): boolean {
    const weaponHitbox = attacker.getWeaponHitbox();
    return Boolean(weaponHitbox
      && Phaser.Geom.Intersects.RectangleToRectangle(weaponHitbox, target.getBodyHurtbox()));
  }

  showHitEffect(x: number, y: number, color: number): void {
    const ring = this.scene.add.circle(x, y, 12, color, 0.4).setStrokeStyle(4, 0xffffff);
    this.scene.tweens.add({
      targets: ring, radius: 44, alpha: 0, duration: 180,
      onComplete: () => ring.destroy(),
    });
  }
}
