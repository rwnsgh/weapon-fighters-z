import Phaser from 'phaser';
import type { RoundResult } from '../data/types';
import {
  addBackdrop, addButton, addPanel, fontBody, fontDisplay, fontTech, palette,
} from '../ui/ui';

interface MatchResult {
  winner: RoundResult;
  history: RoundResult[];
  p1Wins: number;
  p2Wins: number;
}

export class ResultScene extends Phaser.Scene {
  private keyboardHandler?: (event: KeyboardEvent) => void;

  constructor() { super('ResultScene'); }

  create(): void {
    addBackdrop(this, 0x42224c);
    const result = this.registry.get('result') as MatchResult;
    const title = result.winner === 'draw' ? '무승부' : `${result.winner === 'p1' ? '1P' : '2P'} 승리`;
    addPanel(this, 640, 255, 940, 350, result.winner === 'draw' ? palette.gold : palette.cyan, 0.9);
    this.add.text(640, 125, 'BATTLE RESULT', {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '17px',
      color: '#ffcf6e', letterSpacing: 5,
    }).setOrigin(0.5);
    this.add.text(640, 215, title, {
      fontFamily: fontDisplay, fontStyle: 'bold', fontSize: '64px', color: '#ffffff',
      stroke: '#20102a', strokeThickness: 12,
    }).setOrigin(0.5);
    const history = result.history.map((round, index) => {
      const label = round === 'draw' ? '무승부' : `${round === 'p1' ? '1P' : '2P'} 승`;
      return `ROUND ${index + 1}  ${label}`;
    }).join('   ·   ');
    this.add.text(640, 290, history, {
      fontFamily: fontBody, fontSize: '16px', color: '#bdc7ee',
      align: 'center', wordWrap: { width: 950 },
    }).setOrigin(0.5);
    this.add.text(640, 334, `FINAL SCORE   ${result.p1Wins}  —  ${result.p2Wins}`, {
      fontFamily: fontTech, fontStyle: 'bold', fontSize: '19px', color: '#ffe78a',
    }).setOrigin(0.5);
    const rematch = () => {
      this.registry.remove('resumeRounds');
      this.scene.start('FightScene');
    };
    addButton(this, 640, 430, '1  ·  재대결', rematch);
    addButton(this, 640, 508, '2  ·  파이터 선택으로', () => this.scene.start('CharacterSelectScene'));
    addButton(this, 640, 590, '메인 메뉴로', () => this.scene.start('TitleScene'));
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === '1' || event.key === 'Enter') rematch();
      if (event.key === '2') this.scene.start('CharacterSelectScene');
      if (event.key === 'Escape') this.scene.start('TitleScene');
    };
    this.input.keyboard?.on('keydown', this.keyboardHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keyboardHandler) this.input.keyboard?.off('keydown', this.keyboardHandler);
    });
  }
}
