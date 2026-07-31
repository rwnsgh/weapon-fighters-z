import type { MapId } from './types';

export interface MapConfig {
  id: MapId;
  name: string;
  description: string;
  color: number;
}

export interface PlatformConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  tint: number;
}

/** Symmetric, overlapping routes from either lower platform to the top. */
export const voidPlatforms: readonly PlatformConfig[] = [
  { x: 640, y: 260, width: 700, height: 38, tint: 0x6c66a8 },
  { x: 300, y: 380, width: 320, height: 32, tint: 0x4a4985 },
  { x: 980, y: 380, width: 320, height: 32, tint: 0x4a4985 },
  { x: 640, y: 490, width: 380, height: 34, tint: 0x585393 },
  { x: 430, y: 600, width: 300, height: 30, tint: 0x403d73 },
  { x: 850, y: 600, width: 300, height: 30, tint: 0x403d73 },
];

export const maps: Record<MapId, MapConfig> = {
  meadow: {
    id: 'meadow',
    name: '초원 평지',
    description: '넓은 평지와 보이지 않는 벽. 순수한 정면 승부.',
    color: 0x62c985,
  },
  void: {
    id: 'void',
    name: '공허의 다층 발판',
    description: '좌우 대칭의 6개 발판. 추락하면 피해 15 후 상단에서 복귀.',
    color: 0x9a6bff,
  },
};
