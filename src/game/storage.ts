import {
  BOARD_SIZES,
  DEFAULT_BOARD_SIZE,
  getBoardSize,
  type BoardSize,
} from './config';

const SOUND_KEY = 'chronopop.sound';
const VIBRATION_KEY = 'chronopop.vibration';
const BOARD_KEY = 'chronopop.board';
const MAX_RECORDS = 10;

/**
 * 기록은 보드 크기마다 따로 둔다.
 * 8×8은 칸이 많아 점수가 잘 나오므로, 한 표에 섞으면 7×7 기록이 영영 밀린다.
 *
 * 7×7은 예전 키를 그대로 쓴다 — 크기 선택이 생기기 전의 기록이 전부
 * 7×7이라 옮길 필요가 없다.
 */
function recordsKey(size: BoardSize): string {
  return size === DEFAULT_BOARD_SIZE
    ? 'chronopop.records.v1'
    : `chronopop.records.v1.${size}`;
}

const KEY = (): string => recordsKey(getBoardSize());

export interface RecordEntry {
  score: number;
  maxChain: number;
  biggestMatch: number;
  /** ISO 문자열 */
  at: string;
}

function read(): RecordEntry[] {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => typeof r?.score === 'number');
  } catch {
    // 사파리 프라이빗 모드 등에서 localStorage가 막힐 수 있다
    return [];
  }
}

function write(list: RecordEntry[]): void {
  try {
    localStorage.setItem(KEY(), JSON.stringify(list));
  } catch {
    /* 저장 실패는 무시 — 게임 진행에는 지장 없다 */
  }
}

export function getRecords(): RecordEntry[] {
  return read().sort((a, b) => b.score - a.score);
}

export function getBest(): number {
  const list = getRecords();
  return list.length > 0 ? list[0].score : 0;
}

/** 기록을 저장하고, 최고 기록 경신이면 true를 돌려준다 */
export function addRecord(entry: RecordEntry): boolean {
  const list = getRecords();
  const prevBest = list.length > 0 ? list[0].score : -1;
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  write(list.slice(0, MAX_RECORDS));
  return entry.score > prevBest;
}

/** 모든 보드 크기의 기록을 지운다 — "기록 지우기"는 전부 지우는 것으로 읽힌다 */
export function clearRecords(): void {
  try {
    for (const size of BOARD_SIZES) localStorage.removeItem(recordsKey(size));
  } catch {
    /* noop */
  }
}

/** 마지막으로 고른 보드 크기 */
export function getSavedBoardSize(): BoardSize {
  try {
    const raw = Number(localStorage.getItem(BOARD_KEY));
    const found = BOARD_SIZES.find((s) => s === raw);
    return found ?? DEFAULT_BOARD_SIZE;
  } catch {
    return DEFAULT_BOARD_SIZE;
  }
}

export function setSavedBoardSize(size: BoardSize): void {
  try {
    localStorage.setItem(BOARD_KEY, String(size));
  } catch {
    /* noop */
  }
}

export function getSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* noop */
  }
}

export function getVibrationEnabled(): boolean {
  try {
    return localStorage.getItem(VIBRATION_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVibrationEnabled(on: boolean): void {
  try {
    localStorage.setItem(VIBRATION_KEY, on ? 'on' : 'off');
  } catch {
    /* noop */
  }
}
