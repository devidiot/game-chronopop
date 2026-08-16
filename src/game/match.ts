import { COLS, ROWS } from './config';
import type { Cell, Grid, MatchGroup } from './types';

/**
 * 가로/세로 3연속 이상을 찾아 서로 맞닿은 것끼리 하나의 덩어리로 묶는다.
 * L자·T자로 겹치면 5개짜리 한 덩어리가 되어 더 큰 보상을 준다.
 */
export function findMatches(grid: Grid): MatchGroup[] {
  const marked: boolean[][] = Array.from({ length: ROWS }, () =>
    new Array<boolean>(COLS).fill(false),
  );

  // 가로 스캔
  for (let r = 0; r < ROWS; r++) {
    let runStart = 0;
    for (let c = 1; c <= COLS; c++) {
      const prev = grid[r][c - 1];
      const cur = c < COLS ? grid[r][c] : null;
      const same = cur && prev && cur.kind === prev.kind;
      if (!same) {
        const len = c - runStart;
        if (len >= 3 && prev) {
          for (let k = runStart; k < c; k++) marked[r][k] = true;
        }
        runStart = c;
      }
    }
  }

  // 세로 스캔
  for (let c = 0; c < COLS; c++) {
    let runStart = 0;
    for (let r = 1; r <= ROWS; r++) {
      const prev = grid[r - 1][c];
      const cur = r < ROWS ? grid[r][c] : null;
      const same = cur && prev && cur.kind === prev.kind;
      if (!same) {
        const len = r - runStart;
        if (len >= 3 && prev) {
          for (let k = runStart; k < r; k++) marked[k][c] = true;
        }
        runStart = r;
      }
    }
  }

  // 표시된 칸을 같은 종류끼리 BFS로 묶는다
  const visited: boolean[][] = Array.from({ length: ROWS }, () =>
    new Array<boolean>(COLS).fill(false),
  );
  const groups: MatchGroup[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!marked[r][c] || visited[r][c]) continue;
      const kind = grid[r][c]!.kind;
      const cells: Cell[] = [];
      const queue: Cell[] = [{ row: r, col: c }];
      visited[r][c] = true;

      while (queue.length > 0) {
        const cell = queue.pop()!;
        cells.push(cell);
        const neighbors: Cell[] = [
          { row: cell.row - 1, col: cell.col },
          { row: cell.row + 1, col: cell.col },
          { row: cell.row, col: cell.col - 1 },
          { row: cell.row, col: cell.col + 1 },
        ];
        for (const n of neighbors) {
          if (n.row < 0 || n.row >= ROWS || n.col < 0 || n.col >= COLS) continue;
          if (!marked[n.row][n.col] || visited[n.row][n.col]) continue;
          const t = grid[n.row][n.col];
          if (!t || t.kind !== kind) continue;
          visited[n.row][n.col] = true;
          queue.push(n);
        }
      }

      let sumRow = 0;
      let sumCol = 0;
      for (const cell of cells) {
        sumRow += cell.row;
        sumCol += cell.col;
      }
      groups.push({
        kind,
        cells,
        size: cells.length,
        centerRow: sumRow / cells.length,
        centerCol: sumCol / cells.length,
      });
    }
  }

  return groups;
}

/** 매치가 하나라도 있는지만 빠르게 확인 */
export function hasMatch(grid: Grid): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t) continue;
      if (
        c + 2 < COLS &&
        grid[r][c + 1]?.kind === t.kind &&
        grid[r][c + 2]?.kind === t.kind
      ) {
        return true;
      }
      if (
        r + 2 < ROWS &&
        grid[r + 1][c]?.kind === t.kind &&
        grid[r + 2][c]?.kind === t.kind
      ) {
        return true;
      }
    }
  }
  return false;
}
