import Phaser from 'phaser';
import { combatTuning } from './combatTuning';
import { BootScene } from '../scenes/BootScene';
import { TitleScene } from '../scenes/TitleScene';
import { ModeSelectScene } from '../scenes/ModeSelectScene';
import { CharacterSelectScene } from '../scenes/CharacterSelectScene';
import { MapSelectScene } from '../scenes/MapSelectScene';
import { FightScene } from '../scenes/FightScene';
import { ResultScene } from '../scenes/ResultScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#080b16',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: combatTuning.gravityY }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    TitleScene,
    ModeSelectScene,
    CharacterSelectScene,
    MapSelectScene,
    FightScene,
    ResultScene,
  ],
};
