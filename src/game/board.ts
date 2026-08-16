import { BOMB_SPAWN_CHANCE, COLS, KINDS, ROWS } from './config';
import { findMatches, hasMatch } from './match';
import type { Cell, Grid, HintMove, Tile } from './types';

let nextId = 1;

function makeTile(
  kind: number,
  row: number,
  col: number,
  fromRow: number,
  bomb = false,
): Tile {
  return {
    id: nextId++,
    kind,
    row,
    col,
    fromRow,
    fromCol: col,
    clearing: false,
    bomb,
  };
}

/** 새로 떨어지는 젬은 아주 낮은 확률로 폭탄이 된다 */
function rollBomb(): boolean {
  return Math.random() < BOMB_SPAWN_CHANCE;
}

function randKind(): number {
  return Math.floor(Math.random() * KINDS);
}

/**
 * 시작 보드 생성.
 * 채우는 동안 좌측/상단 2칸을 보고 3연속이 되는 종류를 피해
 * "시작하자마자 저절로 터지는" 상황을 막는다.
 */
export function createBoard(): Grid {
  for (let attempt = 0; attempt < 50; attempt++) {
    const grid: Grid = Array.from({ length: ROWS }, () =>
      new Array<Tile | null>(COLS).fill(null),
    );

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const banned = new Set<number>();
        if (c >= 2 && grid[r][c - 1]!.kind === grid[r][c - 2]!.kind) {
          banned.add(grid[r][c - 1]!.kind);
        }
        if (r >= 2 && grid[r - 1][c]!.kind === grid[r - 2][c]!.kind) {
          banned.add(grid[r - 1][c]!.kind);
        }
        let kind = randKind();
        let guard = 0;
        while (banned.has(kind) && guard++ < 20) kind = randKind();
        grid[r][c] = makeTile(kind, r, c, r, rollBomb());
      }
    }

    if (!hasMatch(grid) && hasValidMove(grid)) return grid;
  }

  // 극히 드문 실패 대비 — 일단 채우고 셔플 로직에 맡긴다
  const grid: Grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => makeTile(randKind(), r, c, r)),
  );
  return grid;
}

/** 두 칸이 상하좌우로 붙어 있는가 */
export function isAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

/** 논리적으로 두 타일을 맞바꾼다(연출용 from 좌표도 갱신) */
export function swapTiles(grid: Grid, a: Cell, b: Cell): void {
  const ta = grid[a.row][a.col];
  const tb = grid[b.row][b.col];
  grid[a.row][a.col] = tb;
  grid[b.row][b.col] = ta;

  if (ta) {
    ta.fromRow = ta.row;
    ta.fromCol = ta.col;
    ta.row = b.row;
    ta.col = b.col;
  }
  if (tb) {
    tb.fromRow = tb.row;
    tb.fromCol = tb.col;
    tb.row = a.row;
    tb.col = a.col;
  }
}

/**
 * 탐색용 스왑. 애니메이션 상태(fromRow/fromCol)는 건드리지 않는다.
 *
 * swapTiles로 시험 스왑을 하면 되돌려도 from 좌표가 상대 칸에 남아,
 * 다음 연출 때 아무 상관 없는 젬이 옆칸에서 미끄러져 들어오는 것처럼 보인다.
 */
export function swapForTest(grid: Grid, a: Cell, b: Cell): void {
  const ta = grid[a.row][a.col];
  const tb = grid[b.row][b.col];
  grid[a.row][a.col] = tb;
  grid[b.row][b.col] = ta;
  if (ta) {
    ta.row = b.row;
    ta.col = b.col;
  }
  if (tb) {
    tb.row = a.row;
    tb.col = a.col;
  }
}

/** 한 수라도 둘 곳이 남아 있는가 */
export function hasValidMove(grid: Grid): boolean {
  const test = (a: Cell, b: Cell): boolean => {
    swapForTest(grid, a, b);
    const ok = hasMatch(grid);
    swapForTest(grid, b, a); // 되돌리기
    return ok;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && test({ row: r, col: c }, { row: r, col: c + 1 })) return true;
      if (r + 1 < ROWS && test({ row: r, col: c }, { row: r + 1, col: c })) return true;
    }
  }
  return false;
}

/**
 * 지금 둘 수 있는 수 중 **가장 이득이 큰** 것을 찾는다(힌트용).
 *
 * 평가 기준은 두 가지다.
 *   - 덩어리가 클수록 좋다 (크기^2.2 — 5매치 하나가 3매치 둘보다 낫다)
 *   - 위쪽에서 터질수록 좋다 (위가 비면 그만큼 많이 떨어져 연쇄가 잘 난다)
 *
 * 점수가 같은 수가 여럿이면 그중 하나를 무작위로 고른다.
 * 매번 같은 자리만 가리키면 지루하기 때문이다.
 */
export function findBestMove(grid: Grid): HintMove | null {
  let bestValue = -1;
  let best: HintMove[] = [];

  const evaluate = (a: Cell, b: Cell): void => {
    swapForTest(grid, a, b);

    if (hasMatch(grid)) {
      const groups = findMatches(grid);
      let value = 0;
      for (const group of groups) {
        value += Math.pow(group.size, 2.2) + (group.centerRow < 3 ? 4 : 0);
      }

      if (value >= bestValue) {
        // 칸 좌표는 스왑을 되돌려도 그대로 유효하다
        const move: HintMove = {
          swap: [a, b],
          cells: groups.flatMap((group) => group.cells),
        };
        if (value > bestValue) {
          bestValue = value;
          best = [move];
        } else {
          best.push(move);
        }
      }
    }

    swapForTest(grid, b, a);
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) evaluate({ row: r, col: c }, { row: r, col: c + 1 });
      if (r + 1 < ROWS) evaluate({ row: r, col: c }, { row: r + 1, col: c });
    }
  }

  if (best.length === 0) return null;
  return best[Math.floor(Math.random() * best.length)];
}

/**
 * 지금 둘 수 있는 수 하나를 찾는다.
 * 좋고 나쁨을 따지지 않으므로 시뮬레이터의 "아무 수나 두는" 봇이 쓴다.
 */
export function findHint(grid: Grid): Cell[] | null {
  const found: Cell[][] = [];

  const test = (a: Cell, b: Cell): void => {
    swapForTest(grid, a, b);
    if (hasMatch(grid)) found.push([a, b]);
    swapForTest(grid, b, a);
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) test({ row: r, col: c }, { row: r, col: c + 1 });
      if (r + 1 < ROWS) test({ row: r, col: c }, { row: r + 1, col: c });
    }
  }

  if (found.length === 0) return null;
  return found[Math.floor(Math.random() * found.length)];
}

/** 칸을 Set에 넣을 때 쓰는 키 */
export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`;
}

/**
 * 폭발에 휩쓸릴 주변 칸을 고른다.
 *
 * 터지는 덩어리에 맞닿은(대각선 포함) 칸 중에서, 이미 터질 예정이 아닌 곳을
 * 무작위로 뽑는다. 매번 다른 곳이 날아가야 같은 상황도 다르게 느껴진다.
 */
export function pickBlastCells(
  grid: Grid,
  cells: Cell[],
  count: number,
  doomed: Set<string>,
): Cell[] {
  if (count <= 0) return [];

  const candidates: Cell[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const row = cell.row + dr;
        const col = cell.col + dc;
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) continue;
        if (!grid[row][col]) continue;
        const key = `${row},${col}`;
        if (doomed.has(key) || seen.has(key)) continue;
        seen.add(key);
        candidates.push({ row, col });
      }
    }
  }

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, count);
}

/**
 * 폭탄이 터질 때 휩쓸리는 칸(폭탄 자신은 제외).
 *
 * 정사각형이 아니라 모서리를 깎은 원형에 가깝게 잡아 폭발처럼 보이게 한다.
 * 반경 1이면 주변 8칸, 반경 2면 20칸이다.
 */
export function bombArea(grid: Grid, center: Cell, radius: number): Cell[] {
  const cells: Cell[] = [];
  const limit = radius * radius + radius;

  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (dr * dr + dc * dc > limit) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) continue;
      if (!grid[row][col]) continue;
      cells.push({ row, col });
    }
  }
  return cells;
}

/**
 * 한 줄 전체(폭탄 자신은 제외).
 * 폭탄을 밀어서 터뜨렸을 때 민 방향으로 쓸어버리는 데 쓴다.
 */
export function lineArea(grid: Grid, center: Cell, axis: 'row' | 'col'): Cell[] {
  const cells: Cell[] = [];

  if (axis === 'row') {
    for (let col = 0; col < COLS; col++) {
      if (col === center.col) continue;
      if (grid[center.row][col]) cells.push({ row: center.row, col });
    }
  } else {
    for (let row = 0; row < ROWS; row++) {
      if (row === center.row) continue;
      if (grid[row][center.col]) cells.push({ row, col: center.col });
    }
  }

  return cells;
}

/** 보드 전체에서 특정 종류의 칸을 모은다(지우기용) */
export function cellsOfKind(grid: Grid, kind: number): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]?.kind === kind) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** 제거 대상 칸을 비운다 */
export function clearCells(grid: Grid, cells: Cell[]): void {
  for (const cell of cells) {
    grid[cell.row][cell.col] = null;
  }
}

export interface FallPlan {
  /** 아래로 내려온 기존 타일 */
  moved: Tile[];
  /** 위에서 새로 생성된 타일 */
  spawned: Tile[];
}

/**
 * 빈 칸을 메운다. 기존 타일을 아래로 내리고, 남은 자리는
 * 화면 위쪽(음수 row)에서 떨어지는 새 타일로 채운다.
 */
export function applyGravity(grid: Grid): FallPlan {
  const moved: Tile[] = [];
  const spawned: Tile[] = [];

  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;

    for (let readRow = ROWS - 1; readRow >= 0; readRow--) {
      const tile = grid[readRow][c];
      if (!tile) continue;
      if (readRow !== writeRow) {
        grid[writeRow][c] = tile;
        grid[readRow][c] = null;
        tile.fromRow = tile.row;
        tile.fromCol = tile.col;
        tile.row = writeRow;
        moved.push(tile);
      } else {
        tile.fromRow = tile.row;
        tile.fromCol = tile.col;
      }
      writeRow--;
    }

    // 남은 위쪽 칸 채우기 — 화면 밖에서 순서대로 떨어진다
    let spawnOffset = 1;
    for (let r = writeRow; r >= 0; r--) {
      const tile = makeTile(randKind(), r, c, -spawnOffset, rollBomb());
      spawnOffset++;
      grid[r][c] = tile;
      spawned.push(tile);
    }
  }

  return { moved, spawned };
}

/**
 * 보드의 일부만 무작위로 골라 젬 종류를 서로 섞는다(찬스).
 *
 * 전체 셔플과 달리 매치가 생기는 것을 막지 않는다.
 * 섞다가 우연히 터지는 것도 찬스의 재미이기 때문이다.
 *
 * @returns 실제로 재배치된 칸들
 */
export function reshuffleSome(grid: Grid, ratio: number): Cell[] {
  const all: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) all.push({ row: r, col: c });
    }
  }
  if (all.length < 2) return [];

  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const count = Math.min(all.length, Math.max(4, Math.round(all.length * ratio)));
  const picked = all.slice(0, count);

  const kinds = picked.map((cell) => grid[cell.row][cell.col]!.kind);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  picked.forEach((cell, i) => {
    grid[cell.row][cell.col]!.kind = kinds[i];
  });

  return picked;
}

/** 아무 데나 3연속을 심는다. 실패하면 null. */
function plantMatch(grid: Grid): Cell[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const horizontal = Math.random() < 0.5;
    const row = Math.floor(Math.random() * (horizontal ? ROWS : ROWS - 2));
    const col = Math.floor(Math.random() * (horizontal ? COLS - 2 : COLS));

    const cells: Cell[] = horizontal
      ? [
          { row, col },
          { row, col: col + 1 },
          { row, col: col + 2 },
        ]
      : [
          { row, col },
          { row: row + 1, col },
          { row: row + 2, col },
        ];

    if (cells.some((cell) => !grid[cell.row][cell.col])) continue;

    // 첫 칸의 종류로 맞춰야 원래 있던 젬처럼 자연스럽다
    const kind = grid[cells[0].row][cells[0].col]!.kind;
    for (const cell of cells) grid[cell.row][cell.col]!.kind = kind;
    return cells;
  }

  return null;
}

/**
 * 터질 덩어리가 `want` 개가 되도록 3연속을 심는다.
 * 이미 그만큼 있으면 아무것도 하지 않는다.
 *
 * @returns 손을 댄 칸들
 */
export function seedMatches(grid: Grid, want: number): Cell[] {
  const seeded: Cell[] = [];

  for (let guard = 0; guard < 8; guard++) {
    if (findMatches(grid).length >= want) break;
    const cells = plantMatch(grid);
    if (!cells) break;
    seeded.push(...cells);
  }

  return seeded;
}

/**
 * 둘 곳이 없을 때 보드를 섞는다.
 * 기존 타일의 종류만 재배치하므로 젬 개수 구성은 유지된다.
 */
export function shuffleBoard(grid: Grid): void {
  const kinds: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t) kinds.push(t.kind);
    }
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        if (t) t.kind = kinds[idx++];
      }
    }
    if (!hasMatch(grid) && hasValidMove(grid)) return;
  }
}
