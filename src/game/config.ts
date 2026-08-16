/**
 * Crush Pang 게임 상수.
 * 밸런스를 만지려면 대부분 이 파일만 고치면 된다.
 */

/**
 * 보드 크기 — 플레이어가 타이틀에서 고른다.
 *
 * 7×7은 8×8보다 칸이 23% 적어 둘 수 있는 수가 줄고, 그만큼 어렵다.
 * 대신 젬이 커져서 손가락으로 집기는 편하다.
 */
export const BOARD_SIZES = [7, 8] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
export const DEFAULT_BOARD_SIZE: BoardSize = 7;

/**
 * 현재 보드 크기. `setBoardSize()` 로만 바꾼다.
 *
 * `const` 가 아니라 `let` 인 이유: ES 모듈의 import 는 값 복사가 아니라
 * 살아 있는 참조라서, 여기서 다시 대입하면 이 값을 쓰는 모든 모듈이
 * 곧바로 새 값을 본다. 덕분에 크기를 인자로 줄줄이 넘기지 않아도 된다.
 *
 * 단, **함수 안에서 읽어야** 한다. 모듈 최상단에서 구조분해로 꺼내 두면
 * 그 시점의 값이 박제된다.
 */
export let COLS: number = DEFAULT_BOARD_SIZE;
export let ROWS: number = DEFAULT_BOARD_SIZE;

/** 판이 시작되기 전(타이틀)에만 호출한다 */
export function setBoardSize(size: BoardSize): void {
  COLS = size;
  ROWS = size;
}

export function getBoardSize(): BoardSize {
  return COLS as BoardSize;
}

/** 젬 종류 수 (GEM_STYLES 길이와 반드시 일치) */
export const KINDS = 6;

// ---------------------------------------------------------------- 시간

/** 시작 제한시간(초) */
export const START_TIME = 60;

/** 남은 시간 상한(초). 아무리 잘해도 이 이상 쌓이지 않는다. */
export const MAX_TIME = 90;

/**
 * 시간 보상 감쇠 기준 점수.
 * 감쇠율 = SOFT_CAP / (SOFT_CAP + 총점) 이므로
 * 총점이 이 값과 같아지는 순간 시간 보상이 절반이 된다.
 */
export const TIME_SOFT_CAP = 6000;

/** 감쇠율 하한 — 후반에도 최소 이만큼은 보상한다. */
export const TIME_DECAY_FLOOR = 0.12;

// ---------------------------------------------------------------- 점수/보상 테이블

/** 매치 크기별 기본 점수 (3개 미만은 발생하지 않음) */
export function baseScore(size: number): number {
  if (size <= 3) return 60;
  if (size === 4) return 180;
  if (size === 5) return 400;
  return 700 + (size - 6) * 250;
}

/**
 * 매치 크기별 기본 시간 보상(초).
 *
 * 3매치는 거의 시간을 주지 않는다. 3개만 계속 맞춰서는 제한시간을
 * 유지할 수 없고, 4·5매치와 연쇄를 노려야 시간이 벌린다.
 */
export function baseTime(size: number): number {
  if (size <= 3) return 0.16;
  if (size === 4) return 0.9;
  if (size === 5) return 2.0;
  return 3.0 + (size - 6) * 0.6;
}

/** 연쇄(체인) 배수 — chain 1회차부터 순서대로 */
export const CHAIN_MULT = [1, 1.5, 2.2, 3.0, 4.0, 5.0, 6.0];

// ---------------------------------------------------------------- 콤보

/**
 * 콤보 — 손을 멈추지 않고 연달아 터뜨리는 것.
 *
 * 매치에 성공하면 이 시간만큼 여유가 생기고, 그 안에 또 성공하면 콤보가
 * 이어진다. 연쇄가 재생되는 동안에는 시계가 멈추므로 긴 연쇄를 만들었다고
 * 손해 보지 않는다.
 */
export const COMBO_WINDOW_MS = 1200;

/** 이 횟수부터 화면에 "N COMBO"를 띄운다 */
export const COMBO_MIN_SHOW = 3;

/** 콤보 1회당 점수 보너스와 상한 (최대 2배) */
export const COMBO_STEP = 0.1;
export const COMBO_MAX_STACK = 10;

// ---------------------------------------------------------------- 연쇄 폭발

/**
 * 큰 매치나 깊은 연쇄가 터질 때 주변 젬까지 함께 날려버린다.
 * 화면이 시원해지고 다음 연쇄가 터질 확률도 올라간다.
 */

/** 이 크기 이상 매치면 주변이 함께 폭발한다 */
export const BLAST_MIN_MATCH = 5;
/** 그때 추가로 터지는 칸 수 */
export const BLAST_MATCH_CELLS = 4;

/** 이 단계 이상 연쇄면 주변이 함께 폭발한다 */
export const BLAST_MIN_CHAIN = 3;
/** 그때 추가로 터지는 칸 수 */
export const BLAST_CHAIN_CELLS = 2;

/** 폭발로 터진 칸 하나당 점수(연쇄 배수가 곱해진다) */
export const BLAST_SCORE = 40;

// ---------------------------------------------------------------- 찬스

/** 게임 시작 시 가진 섞기 횟수 */
export const CHANCE_START = 1;

/** 첫 섞기를 받는 점수 */
export const CHANCE_FIRST_AT = 10000;

/**
 * 다음 지급까지의 간격이 매번 이 비율로 늘어난다.
 * 10,000 → 22,500 → 38,125 → 57,656 …
 * 뒤로 갈수록 하나 더 받기가 어려워진다.
 */
export const CHANCE_STEP_GROWTH = 1.25;

/** 섞기를 쓰면 보드의 이 비율만큼이 다시 섞인다 */
export const CHANCE_RATIO = 0.3;

/** 재배치 연출 길이(ms) */
export const CHANCE_MS = 460;

/**
 * 섞은 뒤 만들어줄 매치 개수의 범위.
 * 이 사이에서 무작위로 목표를 정하고, 모자라면 3연속을 심어 채운다.
 * 섞었는데 아무 일도 안 일어나면 쓴 보람이 없기 때문이다.
 */
export const CHANCE_MATCH_MIN = 0.8;
export const CHANCE_MATCH_MAX = 2.5;

// ---------------------------------------------------------------- 폭탄

/**
 * 새로 떨어지는 젬이 폭탄이 될 확률.
 * 폭탄은 눌러서 터뜨릴 수 있고, 폭발에 휩쓸리면 더 크게 터진다.
 *
 * 폭탄은 새로 떨어지는 젬에서만 생기므로, 한 판에 사라지는 젬 수에
 * 이 확률을 곱하면 기대 개수가 나온다. 실력에 따라 제거량이 다르므로
 * **초보 기준 판당 2개**에 맞췄다(초보는 한 판에 150~180개를 없앤다).
 * 잘하는 사람일수록 더 많이 만나게 된다.
 *
 * `npm run sim` 의 "제거젬 / 폭탄" 열에서 실제 기대치를 확인할 수 있다.
 */
export const BOMB_SPAWN_CHANCE = 0.012;

/** 눌러서 터뜨렸을 때의 반경 (1 = 주변 8칸) */
export const BOMB_TAP_RADIUS = 1;

/** 폭발에 휩쓸려 유폭했을 때의 반경 */
export const BOMB_CHAIN_RADIUS = 2;

/**
 * 폭탄끼리 맞바꿨을 때의 반경.
 * 7×7에서 한 발에 36칸이 날아가므로, 두 발이면 판이 거의 비워진다.
 */
export const BOMB_CROSS_RADIUS = 3;

/** 폭탄으로 터진 칸 하나당 점수(연쇄 배수가 곱해진다) */
export const BOMB_SCORE = 60;

// ---------------------------------------------------------------- 지우기

/** 게임 시작 시 가진 지우기 횟수 — 없이 시작해서 벌어 쓴다 */
export const ERASE_START = 0;

/** 첫 지우기를 받는 점수 */
export const ERASE_FIRST_AT = 7000;

/** 지급 간격 증가율. 7,000 → 16,100 → 27,930 → 43,309 … */
export const ERASE_STEP_GROWTH = 1.3;

/** 지우기로 사라진 칸 하나당 점수 */
export const ERASE_SCORE = 50;

// ---------------------------------------------------------------- 피버 타임

/**
 * 매치할 때마다 게이지가 차고, 가득 차면 피버가 시작된다.
 * 피버 중에는 3매치도 주변을 날려버려 화면이 계속 터진다.
 */
export const FEVER_GAUGE_MAX = 130;

/** 피버 지속 시간(초) */
export const FEVER_DURATION = 8;

/**
 * 피버 중에는 제한시간이 0이 되어도 게임이 끝나지 않는다.
 * 피버가 끝나고 이만큼 더 버틴 뒤에 종료된다(초).
 */
export const FEVER_GRACE_SEC = 1;

/** 피버 중 점수 배수 (시간 보상에는 곱하지 않는다) */
export const FEVER_SCORE_MULT = 2;

/** 피버 중 모든 매치에 얹어주는 추가 폭발 칸 수 */
export const FEVER_BLAST_CELLS = 2;

/**
 * 피버 중에도 다음 피버를 위한 게이지가 이 비율로 찬다.
 * 다 채우면 피버가 끝나는 순간 곧바로 다음 피버로 이어진다.
 */
export const FEVER_GAUGE_IN_FEVER = 0.5;

// ---------------------------------------------------------------- 타격감

/**
 * 큰 매치가 터지는 순간 화면을 아주 잠깐 멈춘다(ms).
 * 격투 게임의 히트스톱과 같은 원리로, 같은 연출도 훨씬 세게 느껴진다.
 */
export const HITSTOP_MATCH4 = 45;
export const HITSTOP_MATCH5 = 80;
export const HITSTOP_CHAIN = 55;
export const HITSTOP_BLAST = 65;
export const HITSTOP_BOMB = 120;
export const HITSTOP_FEVER = 140;

// ---------------------------------------------------------------- 연출 타이밍(ms)

export const SWAP_MS = 130;
export const SWAP_BACK_MS = 150;
export const CLEAR_MS = 220;
export const FALL_MS_PER_ROW = 62;
export const FALL_MS_MIN = 130;
export const SHUFFLE_MS = 420;

/**
 * 이만큼 가만히 있으면 **가장 이득이 큰 수**를 반짝여 알려준다(ms).
 * 거의 즉시 알려주는 셈이라 손이 멈추지 않는다.
 */
export const HINT_DELAY_MS = 400;

// ---------------------------------------------------------------- 젬 아트

export type Animal = 'rabbit' | 'frog' | 'dog' | 'pig' | 'cat' | 'monkey';

export interface GemStyle {
  /** 동물 종류 — 귀 모양이 서로 달라 색 없이도 구분된다 */
  animal: Animal;
  /** 밝은 쪽 색 (하이라이트) */
  light: string;
  /** 기본 색 */
  base: string;
  /** 어두운 쪽 색 (그림자/테두리) */
  dark: string;
  /** 글로우 색 (rgba) */
  glow: string;
}

/**
 * 6종 동물.
 *
 * 색만이 아니라 **귀 실루엣**이 전부 달라서(긴 귀·늘어진 귀·뾰족한 귀…)
 * 색각 이상이거나 화면이 작아도 구분할 수 있다.
 */
export const GEM_STYLES: GemStyle[] = [
  {
    animal: 'rabbit',
    light: '#ffffff',
    base: '#eef0f7',
    dark: '#aab0c4',
    glow: 'rgba(255,255,255,0.5)',
  },
  {
    animal: 'frog',
    light: '#d4fa8f',
    base: '#8fd93c',
    dark: '#3f8a12',
    glow: 'rgba(143,217,60,0.55)',
  },
  {
    animal: 'dog',
    light: '#b6ecff',
    base: '#4fc3f0',
    dark: '#15749c',
    glow: 'rgba(79,195,240,0.55)',
  },
  {
    animal: 'pig',
    light: '#ffd3e0',
    base: '#ff8fb0',
    dark: '#c04a72',
    glow: 'rgba(255,143,176,0.55)',
  },
  {
    animal: 'cat',
    light: '#e6eaf4',
    base: '#a4aec2',
    dark: '#5f6879',
    glow: 'rgba(164,174,194,0.5)',
  },
  {
    animal: 'monkey',
    light: '#f6d5ab',
    base: '#d59b60',
    dark: '#8d5c2c',
    glow: 'rgba(213,155,96,0.5)',
  },
];
