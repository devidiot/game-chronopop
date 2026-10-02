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

// ------------------------------------------------------------ 두 번째 저장소

/**
 * 기록은 localStorage 와 IndexedDB 두 곳에 똑같이 적는다.
 *
 * 홈 화면 웹앱에서는 localStorage 만 지워지는 일이 있다(iOS 는 메모리가 부족하거나
 * 앱을 갱신할 때 localStorage 를 먼저 비우는 경우가 보고돼 있다). IndexedDB 는
 * 별도로 관리되므로 둘 중 하나만 살아 있어도 켤 때 합쳐서 되살린다.
 *
 * IndexedDB 는 비동기라 평소 읽기는 localStorage 로 하고, 시작할 때 한 번만
 * `hydrateRecords()` 로 두 저장소를 맞춘다.
 */
const DB_NAME = 'chronopop';
const DB_STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function dbGet(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function dbSet(key: string, value: string | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      if (value === null) store.delete(key);
      else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ------------------------------------------------------------ 기록 읽고 쓰기

function parseRecords(raw: string | null): RecordEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        typeof r?.score === 'number' &&
        Number.isFinite(r.score) &&
        typeof r?.at === 'string',
    );
  } catch {
    return [];
  }
}

/** 같은 기록(같은 시각·같은 점수)은 하나로 보고, 높은 점수부터 상위 10개만 남긴다 */
function mergeRecords(...lists: RecordEntry[][]): RecordEntry[] {
  const seen = new Set<string>();
  const out: RecordEntry[] = [];
  for (const list of lists) {
    for (const r of list) {
      const id = `${r.at}|${r.score}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        score: r.score,
        maxChain: Number(r.maxChain) || 0,
        biggestMatch: Number(r.biggestMatch) || 0,
        at: r.at,
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, MAX_RECORDS);
}

function readLocal(key: string): RecordEntry[] {
  try {
    return parseRecords(localStorage.getItem(key));
  } catch {
    // 사파리 프라이빗 모드 등에서 localStorage가 막힐 수 있다
    return [];
  }
}

function writeBoth(key: string, list: RecordEntry[]): void {
  const json = JSON.stringify(list);
  try {
    localStorage.setItem(key, json);
  } catch {
    /* 저장 실패는 무시 — 게임 진행에는 지장 없다 */
  }
  void dbSet(key, json);
}

export function getRecords(): RecordEntry[] {
  return readLocal(KEY()).sort((a, b) => b.score - a.score);
}

export function getBest(): number {
  const list = getRecords();
  return list.length > 0 ? list[0].score : 0;
}

/** 기록을 저장하고, 최고 기록 경신이면 true를 돌려준다 */
export function addRecord(entry: RecordEntry): boolean {
  const list = getRecords();
  const prevBest = list.length > 0 ? list[0].score : -1;
  writeBoth(KEY(), mergeRecords(list, [entry]));
  return entry.score > prevBest;
}

/**
 * 저장된 기록표에서 이 기록이 몇 등인지(1부터) 돌려준다.
 * 표에서 밀려났으면 0. 공유 버튼을 띄울지 가릴 때 쓴다.
 */
export function rankOf(entry: Pick<RecordEntry, 'score' | 'at'>): number {
  const i = getRecords().findIndex((r) => r.at === entry.at && r.score === entry.score);
  return i < 0 ? 0 : i + 1;
}

/** 모든 보드 크기의 기록을 지운다 — "기록 지우기"는 전부 지우는 것으로 읽힌다 */
export function clearRecords(): void {
  for (const size of BOARD_SIZES) {
    const key = recordsKey(size);
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
    void dbSet(key, null);
  }
}

/**
 * 시작할 때 한 번 부른다. 두 저장소의 기록을 합쳐 양쪽에 다시 적고,
 * 브라우저에 저장소를 함부로 비우지 말라고(persist) 요청한다.
 *
 * localStorage 에 없던 기록이 IndexedDB 에서 돌아왔으면 true 를 돌려준다.
 * 그때는 BEST 표시를 다시 그려야 한다.
 */
export async function hydrateRecords(): Promise<boolean> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 지원하지 않는 브라우저 */
  }

  let restored = false;
  for (const size of BOARD_SIZES) {
    const key = recordsKey(size);
    const local = readLocal(key);
    const saved = parseRecords(await dbGet(key));
    if (local.length === 0 && saved.length === 0) continue;

    const merged = mergeRecords(local, saved);
    const localJson = JSON.stringify(local.sort((a, b) => b.score - a.score));
    if (JSON.stringify(merged) !== localJson) restored = true;
    writeBoth(key, merged);
  }
  return restored;
}

// ------------------------------------------------------------ 백업 코드

/**
 * 기록 전체를 한 줄짜리 코드로 만든다. 메모장이나 메신저에 붙여 두었다가
 * 앱을 다시 깔거나 기기를 바꿨을 때 `importRecords()` 로 되살린다.
 */
const BACKUP_PREFIX = 'CP1.';

export function exportRecords(): string {
  const payload: Record<string, RecordEntry[]> = {};
  for (const size of BOARD_SIZES) {
    const list = readLocal(recordsKey(size));
    if (list.length > 0) payload[String(size)] = list;
  }
  return BACKUP_PREFIX + btoa(JSON.stringify(payload));
}

export function hasAnyRecord(): boolean {
  return BOARD_SIZES.some((size) => readLocal(recordsKey(size)).length > 0);
}

/**
 * 백업 코드를 읽어 기존 기록과 합친다. 되살린 기록 수를 돌려준다.
 * 코드가 잘못됐으면 예외를 던진다.
 */
export function importRecords(code: string): number {
  const trimmed = code.trim();
  if (!trimmed.startsWith(BACKUP_PREFIX)) throw new Error('not a backup code');
  const payload = JSON.parse(atob(trimmed.slice(BACKUP_PREFIX.length)));
  if (!payload || typeof payload !== 'object') throw new Error('bad payload');

  let added = 0;
  for (const size of BOARD_SIZES) {
    const incoming = parseRecords(JSON.stringify(payload[String(size)] ?? []));
    if (incoming.length === 0) continue;
    const key = recordsKey(size);
    const before = readLocal(key);
    const merged = mergeRecords(before, incoming);
    added += merged.length - before.length;
    writeBoth(key, merged);
  }
  return added;
}

// ------------------------------------------------------------ 설정값

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
