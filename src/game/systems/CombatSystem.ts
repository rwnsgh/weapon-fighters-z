import Phaser from 'phaser';
import { Fighter, type ActiveAttack } from '../entities/Fighter';
import { shouldApplyInterruptedTrade } from './CombatLogic';

export class CombatSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onHit: (attacker: Fighter, target: Fighter, attack: ActiveAttack) => void,
  ) {}

  update(now: number, fighters: [Fighter, Fighter]): void {
    const [p1, p2] = fighters;
    const p1Attack = p1.currentAttack;
    const p2Attack = p2.currentAttack;
    const p1WillHit = this.intersects(p1, p2);
    const p2WillHit = this.intersects(p2, p1);

    if (p1WillHit && p1Attack && p2.receiveHit(p1, now)) this.onHit(p1, p2, p1Attack);
    if (p2WillHit && p2Attack) {
      if (p2.currentAttack) {
        if (p1.receiveHit(p2, now)) this.onHit(p2, p1, p2Attack);
      } else if (shouldApplyInterruptedTrade(Boolean(p2Attack), Boolean(p2.currentAttack))) {
        // The first collision may have interrupted P2's attack. Because both
        // overlaps were sampled in the same physics tick, preserve the trade.
        const traded = p1.receiveBonusHit(
          p2Attack.config.damage,
          p2Attack.config.knockbackX * p2Attack.direction,
          p2Attack.config.knockbackY,
          now,
          p2,
          p2Attack.config.hitstunMs,
          p2Attack.kind,
        );
        if (traded) this.onHit(p2, p1, p2Attack);
      }
    }
  }

  private intersects(attacker: Fighter, target: Fighter): boolean {
    const hitbox = attacker.getHitbox();
    return Boolean(hitbox && Phaser.Geom.Intersects.RectangleToRectangle(hitbox, target.getHurtbox()));
  }

  showHitEffect(x: number, y: number, color: number): void {
    const ring = this.scene.add.circle(x, y, 12, color, 0.4).setStrokeStyle(4, 0xffffff);
    this.scene.tweens.add({
      targets: ring, radius: 44, alpha: 0, duration: 180,
      onComplete: () => ring.destroy(),
    });
  }
}
