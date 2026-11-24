import type { HandState } from '../vision/gestures';

export type GameId = 'gesture-rush' | 'air-slingshot';

export interface GameOverSummary {
  gameId: GameId;
  gameName: string;
  score: number;
  unit: string;
  stats: Array<{ label: string; value: string }>;
}

export interface GameController {
  readonly id: GameId;
  readonly name: string;
  reset(): void;
  update(dt: number, w: number, h: number, hand: HandState): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, hand: HandState): void;
  getHud(): { score: number; timeLeft: number; combo: number };
}
