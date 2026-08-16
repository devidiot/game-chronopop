import type { Engine } from '../game/engine';
import type { Renderer } from '../render/renderer';
import type { Cell } from '../game/types';

/**
 * 터치/마우스 입력 처리.
 *
 * 두 가지 조작을 모두 받는다.
 *  - 드래그(스와이프): 젬을 잡고 원하는 방향으로 민다
 *  - 탭 두 번: 젬을 고르고 인접한 젬을 누른다
 */
export function attachPointer(
  canvas: HTMLCanvasElement,
  engine: Engine,
  renderer: Renderer,
  onSwapAttempt: () => void,
): void {
  let startCell: Cell | null = null;
  let startX = 0;
  let startY = 0;
  let swiped = false;
  let pointerId: number | null = null;
  /** 누른 곳이 폭탄이면 손을 뗄 때 터뜨린다(드래그면 취소) */
  let bombPending: Cell | null = null;

  const localPoint = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const attempt = (a: Cell, b: Cell): void => {
    if (engine.trySwap(a, b)) onSwapAttempt();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (engine.phase !== 'idle') return;
    if (pointerId !== null) return;

    const { x, y } = localPoint(e);
    const cell = renderer.pointToCell(x, y);
    if (!cell) return;

    // 지우기를 준비했다면 고른 젬의 종류를 통째로 없앤다
    if (engine.eraseArmed) {
      const tile = engine.grid[cell.row][cell.col];
      if (tile) engine.eraseKind(tile.kind);
      return;
    }

    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    startCell = cell;
    startX = x;
    startY = y;
    swiped = false;
    bombPending = null;

    // 이미 고른 젬과 인접하면 바로 교환(탭 두 번 조작)
    const sel = engine.selected;
    if (sel && (sel.row !== cell.row || sel.col !== cell.col)) {
      const adjacent =
        Math.abs(sel.row - cell.row) + Math.abs(sel.col - cell.col) === 1;
      if (adjacent) {
        attempt(sel, cell);
        startCell = null;
        return;
      }
    }

    // 폭탄은 눌렀다 떼면 터진다. 밀면 그냥 자리를 바꾼다.
    if (engine.isBomb(cell)) bombPending = cell;

    engine.selected = cell;
    engine.idleMs = 0;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !startCell || swiped) return;
    if (engine.phase !== 'idle') return;

    const { x, y } = localPoint(e);
    const dx = x - startX;
    const dy = y - startY;
    const threshold = renderer.cell * 0.4;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    // 더 많이 움직인 축 방향으로 한 칸 민다
    const target: Cell =
      Math.abs(dx) > Math.abs(dy)
        ? { row: startCell.row, col: startCell.col + (dx > 0 ? 1 : -1) }
        : { row: startCell.row + (dy > 0 ? 1 : -1), col: startCell.col };

    swiped = true;
    bombPending = null; // 밀었으니 폭탄 터뜨리기는 취소
    attempt(startCell, target);
    startCell = null;
  });

  const end = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;

    if (!swiped && bombPending) {
      engine.detonate(bombPending);
    }

    bombPending = null;
    pointerId = null;
    startCell = null;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // 스와이프 중 화면이 스크롤/확대되지 않도록
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
