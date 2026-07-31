import Phaser from 'phaser';
import './style.css';
import { gameConfig } from './game/config/gameConfig';

await document.fonts.load('900 32px "WFZ Sans"');
await document.fonts.ready;

new Phaser.Game(gameConfig);
