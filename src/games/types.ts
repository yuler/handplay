import type { FaceState } from '../vision/faceEngine';
import type { HandState } from '../vision/gestures';

export type GameId =
  | 'gesture-rush'
  | 'air-slingshot'
  | 'finger-rune'
  | 'mouth-munch'
  | 'no-blink'
  | 'dual-hand';

export type SensorMode = 'hand1' | 'hand2' | 'face';

export interface SensorFrame {
  hand: HandState;
  hands: HandState[];
  face: FaceState;
  video: HTMLVideoElement;
}

export interface GameHud {
  score: number;
  scoreText?: string;
  timeLeft: number;
  timerText?: string;
  urgent?: boolean;
  combo: number;
}

export interface GameOverSummary {
  gameId: GameId;
  gameName: string;
  score: number;
  scoreDisplay?: string;
  unit: string;
  snapshotUrl?: string;
  snapshotFilename?: string;
  stats: Array<{ label: string; value: string }>;
}

export interface GameController {
  readonly id: GameId;
  readonly name: string;
  readonly sensor: SensorMode;
  reset(): void;
  update(dt: number, w: number, h: number, frame: SensorFrame): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame): void;
  getHud(): GameHud;
  onTap?(x: number, y: number, w: number, h: number): void;
}
