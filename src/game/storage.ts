const KEY = 'chronopop.records.v1';
const SOUND_KEY = 'chronopop.sound';
const VIBRATION_KEY = 'chronopop.vibration';
const MAX_RECORDS = 10;

export interface RecordEntry {
  score: number;
  maxChain: number;
  biggestMatch: number;
  /** ISO 문자열 */
  at: string;
}

function read(): RecordEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
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
    localStorage.setItem(KEY, JSON.stringify(list));
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

export function clearRecords(): void {
  try {
    localStorage.removeItem(KEY);
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
