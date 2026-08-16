/** 보드 위의 젬 하나. 논리 위치와 렌더용 보간 위치를 함께 들고 있다. */
export interface Tile {
  id: number;
  kind: number;

  /** 폭탄인가. 눌러서 터뜨릴 수 있고 폭발에 휩쓸리면 유폭한다 */
  bomb: boolean;

  /** 논리 위치 (0 = 최상단 / 최좌측) */
  row: number;
  col: number;

  /** 애니메이션 시작 위치 — 렌더러가 row/col과 보간한다 */
  fromRow: number;
  fromCol: number;

  /** 제거 연출 중 여부 */
  clearing: boolean;
}

/** [row][col] 격자. 빈 칸은 null. */
export type Grid = (Tile | null)[][];

export interface Cell {
  row: number;
  col: number;
}

/** 힌트 한 수 — 어디를 바꾸면 어디가 터지는지 */
export interface HintMove {
  /** 맞바꿀 두 칸 */
  swap: [Cell, Cell];
  /** 그 결과 터지는 칸 전체 */
  cells: Cell[];
}

/** 서로 이어진 같은 종류 젬 덩어리 */
export interface MatchGroup {
  kind: number;
  cells: Cell[];
  size: number;
  /** 점수/시간 팝업을 띄울 중심 좌표 (격자 단위, 소수) */
  centerRow: number;
  centerCol: number;
}

export type Phase =
  | 'title'
  | 'idle'
  | 'swap'
  | 'swapback'
  | 'clear'
  | 'fall'
  | 'shuffle'
  | 'chance'
  | 'over';

/** 엔진이 렌더러/UI에 알리는 사건들 */
export interface EngineEvents {
  onPop: (group: MatchGroup, score: number, time: number, chain: number) => void;
  /** 큰 매치·깊은 연쇄로 주변 젬까지 날아갔을 때 */
  onBlast: (cells: Cell[], bonus: number, chain: number) => void;
  /** 폭탄이 터졌을 때. origins는 터진 폭탄 자리, cells는 휩쓸린 칸 */
  onBomb: (origins: Cell[], cells: Cell[], bonus: number, chain: number) => void;
  onChain: (chain: number) => void;
  onSwapFail: (a: Cell, b: Cell) => void;
  onShuffle: () => void;
  /** 찬스를 써서 보드 일부가 다시 섞였을 때 */
  onChance: (cells: Cell[], left: number) => void;
  /** 점수를 쌓아 찬스를 새로 얻었을 때 */
  onChanceGained: (total: number) => void;
  /** 지우기로 같은 종류를 한꺼번에 없앴을 때 */
  onErase: (cells: Cell[], kind: number, bonus: number, left: number) => void;
  /** 점수를 쌓아 지우기를 새로 얻었을 때 */
  onEraseGained: (total: number) => void;
  /** 콤보가 이어졌을 때 (COMBO_MIN_SHOW 이상부터 알린다) */
  onCombo: (combo: number) => void;
  /** 콤보가 끊겼을 때 */
  onComboEnd: () => void;
  /** 피버 시작 */
  onFeverStart: () => void;
  /** 피버 종료 */
  onFeverEnd: () => void;
  onGameOver: (result: GameResult) => void;
  onScoreChange: (score: number) => void;
}

export interface GameResult {
  score: number;
  maxChain: number;
  /** 한 판에서 이어간 최대 콤보 */
  maxCombo: number;
  biggestMatch: number;
  /** 게임이 실제로 지속된 시간(초) */
  survived: number;
  /** 보너스로 벌어들인 시간 합(초) */
  earnedTime: number;
}
