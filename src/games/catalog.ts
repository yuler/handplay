import type { GameController, GameId, GameOverSummary, SensorMode } from './types';

export type GameCtor = new (onFinish: (summary: GameOverSummary) => void) => GameController;

export interface GameMeta {
  id: GameId;
  title: string;
  icon: string;
  desc: string;
  /** CSS theme class shared by lobby card and ready card */
  theme: string;
  sensor: SensorMode;
  sensorTag: string;
  tags: string[];
  load: () => Promise<GameCtor>;
}

export const GAMES: GameMeta[] = [
  {
    id: 'kitty-chase',
    title: '小花猫逗猫乐',
    icon: '🐱',
    desc: '挥手变出羽毛逗猫棒，逗三花小花猫抓鱼扑蝴蝶！摸摸猫头还能双倍得分～',
    theme: 'kitty',
    sensor: 'hand1',
    sensorTag: '✋ 单手',
    tags: ['⏱ 50 秒', '🐱 摸头双倍'],
    load: () => import('./kittyChase').then((m) => m.KittyChaseGame),
  },
  {
    id: 'gesture-rush',
    title: '闪电结印',
    icon: '✌️',
    desc: '看图比手势，越快分越高！连对 5 次狂热翻倍，还有手指算术题～',
    theme: 'rush',
    sensor: 'hand1',
    sensorTag: '✋ 单手',
    tags: ['⏱ 45 秒', '✊☝️✌️🖐️👍👌'],
    load: () => import('./gestureRush').then((m) => m.GestureRushGame),
  },
  {
    id: 'air-slingshot',
    title: '空气弹弓',
    icon: '🤏',
    desc: '捏住拇指和食指往回拉，松手发射！打靶子和 ⭐，别碰 💣',
    theme: 'sling',
    sensor: 'hand1',
    sensorTag: '✋ 单手',
    tags: ['⏱ 60 秒', '🤏 捏合拉弓'],
    load: () => import('./airSlingshot').then((m) => m.AirSlingshotGame),
  },
  {
    id: 'finger-rune',
    title: '一指画符',
    icon: '☝️',
    desc: '食指当魔法棒！隔空画出 — | ○ ∧ ∨ 符咒，闪电连锁秒杀同符号妖怪～',
    theme: 'rune',
    sensor: 'hand1',
    sensorTag: '✋ 单手',
    tags: ['⏱ 50 秒', '⚡ 连锁施法'],
    load: () => import('./fingerRune').then((m) => m.FingerRuneGame),
  },
  {
    id: 'animal-face',
    title: '萌宠变脸秀',
    icon: '🎭',
    desc: '学小狮子张大嘴、小河豚鼓腮、小狗歪头！脸上实时戴萌宠贴纸还能留念拍照～',
    theme: 'animal',
    sensor: 'face',
    sensorTag: '😜 纯脸部',
    tags: ['⏱ 45 秒', '📸 变身纪念照'],
    load: () => import('./animalFace').then((m) => m.AnimalFaceGame),
  },
  {
    id: 'mouth-munch',
    title: '大嘴吞星',
    icon: '😮',
    desc: '歪头移动、张大嘴吸星星水果、眨眼放双眼激光碎冰块、鼓腮开护盾！',
    theme: 'munch',
    sensor: 'face',
    sensorTag: '😜 纯脸部',
    tags: ['⏱ 50 秒', '👁️ 眨眼激光'],
    load: () => import('./mouthMunch').then((m) => m.MouthMunchGame),
  },
  {
    id: 'no-blink',
    title: '别眨眼 / 憋笑',
    icon: '👁️',
    desc: '飞虫袭眼 + 冷笑话轰炸！局内一键切换双模式，破功瞬间自动抓拍留念！',
    theme: 'noblink',
    sensor: 'face',
    sensorTag: '😜 纯脸部',
    tags: ['📸 破功抓拍', '😂 憋笑挑战'],
    load: () => import('./noBlink').then((m) => m.NoBlinkGame),
  },
  {
    id: 'bubble-pop',
    title: '彩虹泡泡乐团',
    icon: '🫧',
    desc: '伸手戳爆彩虹泡泡弹音乐，双手齐拍黄金大泡泡！单手双手或亲子同屏都能玩～',
    theme: 'bubble',
    sensor: 'hand2',
    sensorTag: '🙌 双手 / 亲子',
    tags: ['⏱ 50 秒', '🎵 音乐泡泡'],
    load: () => import('./bubblePop').then((m) => m.BubblePopGame),
  },
  {
    id: 'dual-hand',
    title: '左右手快闪',
    icon: '🙌',
    desc: '手机靠在桌上，同时举起左右手比出不同手势，还有突发「左右互换」！',
    theme: 'dual',
    sensor: 'hand2',
    sensorTag: '🙌 双手支架',
    tags: ['⏱ 45 秒', '🔀 左右互换'],
    load: () => import('./dualHand').then((m) => m.DualHandGame),
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export const LOBBY_SECTIONS: Array<{ label: string; sensor: SensorMode }> = [
  { label: '✋ 单手隔空玩', sensor: 'hand1' },
  { label: '😜 完全解放双手（脸部体感）', sensor: 'face' },
  { label: '🙌 桌面支架挑战（双手同屏）', sensor: 'hand2' },
];

export function isGameId(id: string): id is GameId {
  return Object.prototype.hasOwnProperty.call(GAME_MAP, id);
}
