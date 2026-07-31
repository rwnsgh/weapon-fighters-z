export type FighterId = 'sword' | 'fist' | 'minigun' | 'clock' | 'plant' | 'rock';
export type AttackKind = 'basic' | 'skill' | 'ultimate';
export type GameMode = 'single' | 'bestOf3';
export type MapId = 'meadow' | 'void';

export interface AttackConfig {
  id: string;
  name: string;
  damage: number;
  manaCost: number;
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  hitstunMs: number;
  knockbackX: number;
  knockbackY: number;
  hitboxWidth: number;
  hitboxHeight: number;
  hitboxOffsetX: number;
  hitboxOffsetY: number;
  hitstopMs: number;
  lungeVelocity?: number;
}

export interface FighterConfig {
  id: FighterId;
  name: string;
  title: string;
  role: string;
  style: string;
  color: number;
  alternateColor: number;
  maxHealth: number;
  maxMana: number;
  startMana: number;
  manaRegen: number;
  moveSpeed: number;
  jumpVelocity: number;
  basicAttack: AttackConfig;
  skill: AttackConfig;
  ultimate: AttackConfig;
  descriptions: { basic: string; skill: string; ultimate: string };
}

export interface MatchSettings {
  mode: GameMode;
  p1: FighterId;
  p2: FighterId;
  map: MapId;
}

export type RoundResult = 'p1' | 'p2' | 'draw';
