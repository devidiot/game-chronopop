import {
  BLAST_CHAIN_CELLS,
  BLAST_MATCH_CELLS,
  BLAST_MIN_CHAIN,
  BLAST_MIN_MATCH,
  BLAST_SCORE,
  BOMB_CHAIN_RADIUS,
  BOMB_CROSS_RADIUS,
  BOMB_SCORE,
  BOMB_TAP_RADIUS,
  CHANCE_FIRST_AT,
  CHANCE_MATCH_MAX,
  CHANCE_MATCH_MIN,
  CHANCE_MS,
  CHANCE_RATIO,
  CHANCE_START,
  CHANCE_STEP_GROWTH,
  CLEAR_MS,
  COMBO_MIN_SHOW,
  COMBO_WINDOW_MS,
  ERASE_FIRST_AT,
  ERASE_SCORE,
  ERASE_START,
  ERASE_STEP_GROWTH,
  FALL_MS_MIN,
  FEVER_BLAST_CELLS,
  FEVER_DURATION,
  FEVER_GAUGE_IN_FEVER,
  FEVER_GRACE_SEC,
  FEVER_GAUGE_MAX,
  FEVER_SCORE_MULT,
  FALL_MS_PER_ROW,
  HINT_DELAY_MS,
  MAX_TIME,
  ROWS,
  SHUFFLE_MS,
  START_TIME,
  SWAP_BACK_MS,
  SWAP_MS,
} from './config';
import {
  applyGravity,
  bombArea,
  cellKey,
  cellsOfKind,
  clearCells,
  createBoard,
  findBestMove,
  hasValidMove,
  isAdjacent,
  lineArea,
  pickBlastCells,
  reshuffleSome,
  seedMatches,
  shuffleBoard,
  swapTiles,
} from './board';
import { findMatches } from './match';
import { chainMultiplier, computeGain } from './scoring';
import type {
  Cell,
  EngineEvents,
  GameResult,
  Grid,
  HintMove,
  MatchGroup,
  Phase,
  Tile,
} from './types';

/**
 * 게임 진행 전체를 담당하는 상태 기계.
 *
 * 렌더링은 전혀 하지 않는다. 대신 각 타일에 fromRow/fromCol과
 * phase/progress를 남겨두어 렌더러가 보간만 하면 되도록 한다.
 */
export class Engine {
  grid: Grid = createBoard();
  phase: Phase = 'title';

  timeLeft = START_TIME;
  score = 0;
  chain = 0;

  /** 손을 멈추지 않고 연달아 성공시킨 횟수 */
  combo = 0;
  /** 콤보가 유지되는 남은 시간(ms) */
  private comboLeft = 0;

  /** 선택된 칸 (탭 방식 조작용) */
  selected: Cell | null = null;

  /** 남은 찬스 횟수 */
  chances = CHANCE_START;
  /** 찬스로 방금 재배치된 칸 — 렌더러가 그 칸만 연출한다 */
  chanceCells = new Set<string>();
  /** 다음 섞기를 받는 점수와 그때까지의 간격 */
  private nextChanceAt = CHANCE_FIRST_AT;
  private chanceStep = CHANCE_FIRST_AT;

  /** 남은 지우기 횟수 */
  erases = ERASE_START;
  /** 지우기 버튼을 눌러 젬을 고르기를 기다리는 중인가 */
  eraseArmed = false;
  private nextEraseAt = ERASE_FIRST_AT;
  private eraseStep = ERASE_FIRST_AT;

  /** 방금 민 방향 — 폭탄을 밀어 터뜨릴 때 이 줄이 함께 날아간다 */
  private pendingAxis: 'row' | 'col' | null = null;

  /** 피버 게이지 (0 ~ FEVER_GAUGE_MAX) */
  feverGauge = 0;
  /** 남은 피버 시간(초). 0보다 크면 피버 중이다. */
  feverLeft = 0;
  /** 피버 덕에 더 버틸 수 있는 시간(초) */
  private graceLeft = 0;

  get fever(): boolean {
    return this.feverLeft > 0;
  }

  /** 게이지 충전 비율 0~1 (UI 표시용) */
  get feverRatio(): number {
    return this.fever
      ? this.feverLeft / FEVER_DURATION
      : this.feverGauge / FEVER_GAUGE_MAX;
  }

  // 결과 집계
  private maxChain = 0;
  private maxCombo = 0;
  private biggestMatch = 0;
  private survived = 0;
  private earnedTime = 0;

  /** 마지막 조작 이후 경과(ms) — 힌트 표시에 쓴다 */
  idleMs = 0;

  private t = 0;
  private dur = 1;
  /** 이번 clear 페이즈에 사라질 칸 (매치 + 폭발) */
  private clearingCells: Cell[] = [];
  private pending: [Cell, Cell] | null = null;
  private hintCache: HintMove | null = null;
  private hintSearched = false;

  constructor(private events: EngineEvents) {}

  /**
   * 잠깐만 손을 멈춰도 **가장 이득이 큰** 수를 알려준다.
   *
   * 보드 전체를 훑는 계산이라 idle 구간마다 한 번만 찾는다.
   * "찾아봤지만 없음"과 "아직 안 찾음"을 구분해야 매 프레임 다시 뒤지지 않는다.
   */
  getHint(): HintMove | null {
    if (this.phase !== 'idle' || this.idleMs < HINT_DELAY_MS) return null;
    if (!this.hintSearched) {
      this.hintCache = findBestMove(this.grid);
      this.hintSearched = true;
    }
    return this.hintCache;
  }

  private resetHint(): void {
    this.hintCache = null;
    this.hintSearched = false;
  }

  /** 현재 페이즈 진행도 0~1 */
  get progress(): number {
    return Math.min(1, this.t / this.dur);
  }

  get isPlaying(): boolean {
    return this.phase !== 'title' && this.phase !== 'over';
  }

  /** 새 게임 시작 */
  start(): void {
    this.grid = createBoard();
    this.phase = 'idle';
    this.timeLeft = START_TIME;
    this.score = 0;
    this.chain = 0;
    this.combo = 0;
    this.comboLeft = 0;
    this.selected = null;
    this.maxChain = 0;
    this.maxCombo = 0;
    this.biggestMatch = 0;
    this.survived = 0;
    this.earnedTime = 0;
    this.idleMs = 0;
    this.t = 0;
    this.dur = 1;
    this.clearingCells = [];
    this.pending = null;
    this.resetHint();
    this.chances = CHANCE_START;
    this.nextChanceAt = CHANCE_FIRST_AT;
    this.chanceStep = CHANCE_FIRST_AT;
    this.feverGauge = 0;
    this.feverLeft = 0;
    this.graceLeft = 0;
    this.erases = ERASE_START;
    this.nextEraseAt = ERASE_FIRST_AT;
    this.eraseStep = ERASE_FIRST_AT;
    this.eraseArmed = false;
    this.pendingAxis = null;
    this.chanceCells.clear();
    this.events.onScoreChange(0);
  }

  /** 매 프레임 호출. dt는 ms. */
  update(dt: number): void {
    if (!this.isPlaying) return;

    this.timeLeft -= dt / 1000;
    this.survived += dt / 1000;

    if (this.feverLeft > 0) {
      this.feverLeft -= dt / 1000;
      if (this.feverLeft <= 0) {
        this.feverLeft = 0;
        // 피버 중에 게이지를 다시 채웠다면 끊지 않고 그대로 이어간다
        if (this.feverGauge >= FEVER_GAUGE_MAX) {
          this.feverGauge -= FEVER_GAUGE_MAX;
          this.feverLeft = FEVER_DURATION;
          this.events.onFeverStart();
        } else {
          this.events.onFeverEnd();
        }
      }
    }

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;

      if (this.fever) {
        // 피버 중에는 시간이 다 돼도 끝나지 않는다.
        // 피버가 끝나면 아래 유예만큼 더 버틴다.
        this.graceLeft = FEVER_GRACE_SEC;
      } else if (this.graceLeft > 0) {
        this.graceLeft -= dt / 1000;
        if (this.graceLeft <= 0) {
          this.finish();
          return;
        }
      } else {
        this.finish();
        return;
      }
    }

    if (this.phase === 'idle') {
      this.idleMs += dt;

      // 연쇄가 재생되는 동안에는 시계를 멈춘다.
      // 긴 연쇄를 만들었다고 콤보가 끊기면 억울하기 때문이다.
      if (this.comboLeft > 0) {
        this.comboLeft -= dt;
        if (this.comboLeft <= 0) {
          this.comboLeft = 0;
          if (this.combo > 0) {
            this.combo = 0;
            this.events.onComboEnd();
          }
        }
      }
      return;
    }

    this.t += dt;
    if (this.t < this.dur) return;

    switch (this.phase) {
      case 'swap':
        this.afterSwap();
        break;
      case 'swapback':
        this.settle();
        this.toIdle();
        break;
      case 'clear':
        this.afterClear();
        break;
      case 'fall':
        this.afterFall();
        break;
      case 'shuffle':
        this.toIdle();
        break;
      case 'chance':
        this.afterChance();
        break;
      default:
        break;
    }
  }

  /**
   * 조작 입력. 두 칸이 인접해야 하며 idle 상태에서만 받는다.
   * @returns 스왑을 시도했으면 true
   */
  trySwap(a: Cell, b: Cell): boolean {
    if (this.phase !== 'idle') return false;
    if (!isAdjacent(a, b)) return false;
    if (!this.grid[a.row][a.col] || !this.grid[b.row][b.col]) return false;

    // 폭탄끼리 맞부딪히면 자리를 바꾸는 대신 판을 통째로 날린다
    if (this.isBomb(a) && this.isBomb(b)) return this.crossDetonate(a, b);

    this.selected = null;
    this.idleMs = 0;
    this.resetHint();
    // 다른 젬들의 연출 좌표를 현재 위치로 맞춰둔다.
    // 이게 없으면 관계없는 젬이 함께 미끄러지는 것처럼 보인다.
    this.settle();
    swapTiles(this.grid, a, b);
    this.pending = [a, b];
    this.pendingAxis = a.row === b.row ? 'row' : 'col';
    this.setPhase('swap', SWAP_MS);
    return true;
  }

  /** 지금 찬스를 쓸 수 있는가 */
  get canUseChance(): boolean {
    return this.phase === 'idle' && this.chances > 0;
  }

  /**
   * 찬스 사용. 보드의 일부를 다시 섞는다.
   * 섞은 결과 매치가 생기면 그대로 연쇄로 이어진다.
   */
  useChance(): boolean {
    if (!this.canUseChance) return false;

    this.chances -= 1;
    this.selected = null;
    this.idleMs = 0;
    this.resetHint();
    this.settle();

    const changed = reshuffleSome(this.grid, CHANCE_RATIO);

    // 섞었으면 최소 한 덩어리는 터져야 쓴 보람이 있다.
    // 목표 개수를 범위 안에서 뽑아 모자란 만큼 심어준다.
    const want = Math.max(
      1,
      Math.round(CHANCE_MATCH_MIN + Math.random() * (CHANCE_MATCH_MAX - CHANCE_MATCH_MIN)),
    );
    changed.push(...seedMatches(this.grid, want));

    this.chanceCells = new Set(changed.map(cellKey));

    this.events.onChance(changed, this.chances);
    this.setPhase('chance', CHANCE_MS);
    return true;
  }

  /** 지금 지우기를 쓸 수 있는가 */
  get canUseErase(): boolean {
    return this.phase === 'idle' && this.erases > 0;
  }

  /** 지우기 준비 상태를 켜고 끈다 */
  toggleErase(): boolean {
    if (this.eraseArmed) {
      this.eraseArmed = false;
      return false;
    }
    if (!this.canUseErase) return false;
    this.eraseArmed = true;
    this.selected = null;
    this.idleMs = 0;
    return true;
  }

  /**
   * 준비 상태에서 젬을 하나 고르면 보드에 있는 같은 종류가 전부 사라진다.
   * 그 안에 폭탄이 섞여 있으면 함께 유폭한다.
   */
  eraseKind(kind: number): boolean {
    if (!this.eraseArmed || this.phase !== 'idle') return false;

    const cells = cellsOfKind(this.grid, kind);
    if (cells.length === 0) return false;

    this.eraseArmed = false;
    this.erases -= 1;
    this.selected = null;
    this.idleMs = 0;
    this.resetHint();
    this.pendingAxis = null;
    this.settle();

    this.chain = 1;
    this.bumpCombo();
    const mult = this.fever ? FEVER_SCORE_MULT : 1;

    const doomed = new Set<string>();
    for (const cell of cells) {
      doomed.add(cellKey(cell));
      const tile = this.grid[cell.row][cell.col];
      if (tile) tile.clearing = true;
    }

    const bonus = Math.round(cells.length * ERASE_SCORE * mult);
    this.score += bonus;
    this.events.onErase(cells, kind, bonus, this.erases);

    const seeds = cells
      .filter((cell) => this.isBomb(cell))
      .map((cell) => ({ cell, radius: BOMB_TAP_RADIUS }));

    if (seeds.length > 0) {
      const blown = this.detonateFrom(seeds, doomed);
      if (blown.cells.length > 0) {
        const bombBonus = Math.round(blown.cells.length * BOMB_SCORE * mult);
        this.score += bombBonus;
        this.events.onBomb(blown.origins, blown.cells, bombBonus, this.chain);
      }
    }

    this.events.onScoreChange(this.score);
    this.grantChances();
    this.grantErases();

    this.clearingCells = [...doomed].map((key) => {
      const [row, col] = key.split(',');
      return { row: Number(row), col: Number(col) };
    });
    this.setPhase('clear', CLEAR_MS);
    return true;
  }

  /** 지우기도 같은 방식으로, 다만 더 이른 점수부터 지급한다 */
  private grantErases(): void {
    let gained = false;
    while (this.score >= this.nextEraseAt) {
      this.erases += 1;
      this.eraseStep *= ERASE_STEP_GROWTH;
      this.nextEraseAt += this.eraseStep;
      gained = true;
    }
    if (gained) this.events.onEraseGained(this.erases);
  }

  /** 이 칸에 폭탄이 있는가 */
  isBomb(cell: Cell): boolean {
    return this.grid[cell.row][cell.col]?.bomb === true;
  }

  /** 폭탄을 눌러 터뜨린다 */
  detonate(cell: Cell): boolean {
    if (this.phase !== 'idle' || !this.isBomb(cell)) return false;

    this.selected = null;
    this.idleMs = 0;
    this.resetHint();
    this.pendingAxis = null;
    this.settle();

    this.chain = 1;
    this.bumpCombo();

    const doomed = new Set<string>();
    const blown = this.detonateFrom([{ cell, radius: BOMB_TAP_RADIUS }], doomed);

    const bonus = Math.round(
      blown.cells.length *
        BOMB_SCORE *
        chainMultiplier(this.chain) *
        (this.fever ? FEVER_SCORE_MULT : 1),
    );
    this.score += bonus;
    this.events.onBomb(blown.origins, blown.cells, bonus, this.chain);
    this.events.onScoreChange(this.score);
    this.grantChances();
    this.grantErases();

    this.clearingCells = blown.cells;
    this.setPhase('clear', CLEAR_MS);
    return true;
  }

  /** 폭탄 두 개를 맞바꿔 터뜨리는 대폭발 */
  private crossDetonate(a: Cell, b: Cell): boolean {
    this.selected = null;
    this.idleMs = 0;
    this.resetHint();
    this.pendingAxis = null;
    this.settle();

    this.chain = 1;
    this.bumpCombo();

    const doomed = new Set<string>();
    const blown = this.detonateFrom(
      [
        { cell: a, radius: BOMB_CROSS_RADIUS },
        { cell: b, radius: BOMB_CROSS_RADIUS },
      ],
      doomed,
    );

    const bonus = Math.round(
      blown.cells.length *
        BOMB_SCORE *
        chainMultiplier(this.chain) *
        (this.fever ? FEVER_SCORE_MULT : 1),
    );
    this.score += bonus;
    this.events.onBomb(blown.origins, blown.cells, bonus, this.chain);
    this.events.onScoreChange(this.score);
    this.grantChances();
    this.grantErases();

    this.clearingCells = blown.cells;
    this.setPhase('clear', CLEAR_MS);
    return true;
  }

  /**
   * 폭탄을 터뜨리고, 그 범위 안의 다른 폭탄까지 연달아 유폭시킨다.
   * 유폭한 폭탄은 더 넓은 반경으로 터진다.
   *
   * @param doomed 이미 사라질 예정인 칸들 — 여기에 새로 터진 칸이 추가된다
   */
  private detonateFrom(
    seeds: Array<{ cell: Cell; radius: number; line?: 'row' | 'col' }>,
    doomed: Set<string>,
  ): { origins: Cell[]; cells: Cell[] } {
    const queue = [...seeds];
    const exploded: Cell[] = [];
    const cells: Cell[] = [];
    const seenOrigin = new Set<string>();

    const doom = (cell: Cell): void => {
      const key = cellKey(cell);
      if (doomed.has(key)) return;
      doomed.add(key);
      cells.push(cell);
      const tile = this.grid[cell.row][cell.col];
      if (tile) tile.clearing = true;
    };

    while (queue.length > 0) {
      const { cell, radius: r, line } = queue.shift()!;
      const key = cellKey(cell);
      if (seenOrigin.has(key)) continue;
      seenOrigin.add(key);

      doom(cell);
      exploded.push(cell);

      // 밀어서 터뜨린 폭탄은 민 방향 한 줄까지 쓸어버린다
      const targets = bombArea(this.grid, cell, r);
      if (line) targets.push(...lineArea(this.grid, cell, line));

      for (const target of targets) {
        const tile = this.grid[target.row][target.col];
        // 아직 안 터진 폭탄이면 유폭시킨다 (더 큰 반경으로)
        if (tile?.bomb && !seenOrigin.has(cellKey(target))) {
          queue.push({ cell: target, radius: BOMB_CHAIN_RADIUS });
        }
        doom(target);
      }
    }

    return { origins: exploded, cells };
  }

  // ------------------------------------------------------------ 내부 전이

  private setPhase(phase: Phase, dur: number): void {
    this.phase = phase;
    this.t = 0;
    this.dur = Math.max(1, dur);
  }

  private toIdle(): void {
    // 둘 곳이 없으면 자동으로 섞어준다.
    // 재배치를 먼저 끝내고 연출을 재생해야 화면이 갑자기 바뀌지 않는다.
    if (!hasValidMove(this.grid)) {
      this.events.onShuffle();
      shuffleBoard(this.grid);
      this.settle();
      this.setPhase('shuffle', SHUFFLE_MS);
      return;
    }
    this.phase = 'idle';
    this.chain = 0;
    this.idleMs = 0;
    this.resetHint();
  }

  private settle(): void {
    this.forEachTile((tile) => {
      tile.fromRow = tile.row;
      tile.fromCol = tile.col;
    });
  }

  private forEachTile(fn: (tile: Tile) => void): void {
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const tile = this.grid[r][c];
        if (tile) fn(tile);
      }
    }
  }

  /** 스왑 연출이 끝난 시점 — 매치가 생겼는지 판정 */
  private afterSwap(): void {
    this.settle();
    const groups = findMatches(this.grid);

    if (groups.length === 0) {
      // 헛스왑: 되돌리고 콤보도 끊는다
      const [a, b] = this.pending!;
      this.breakCombo();
      this.events.onSwapFail(a, b);
      swapTiles(this.grid, a, b);
      this.setPhase('swapback', SWAP_BACK_MS);
      return;
    }

    this.bumpCombo();
    this.chain = 0;
    this.beginClear(groups);
  }

  /** 매치 덩어리들에 점수/시간을 주고 제거 연출을 시작 */
  private beginClear(groups: MatchGroup[]): void {
    this.chain += 1;
    this.maxChain = Math.max(this.maxChain, this.chain);

    // 이번에 사라질 칸 전체 — 폭발이 같은 칸을 중복해서 고르지 않도록 모아둔다
    const doomed = new Set<string>();
    for (const group of groups) {
      for (const cell of group.cells) doomed.add(cellKey(cell));
    }

    const blasts: Cell[] = [];

    for (const group of groups) {
      const gain = computeGain(group.size, this.chain, this.combo, this.score);
      const scoreMult = this.fever ? FEVER_SCORE_MULT : 1;

      this.score += Math.round(gain.score * scoreMult);
      this.biggestMatch = Math.max(this.biggestMatch, group.size);

      // 남은 시간에는 상한이 있다 — 넘치는 만큼은 버려진다
      const before = this.timeLeft;
      this.timeLeft = Math.min(MAX_TIME, this.timeLeft + gain.time);
      this.earnedTime += this.timeLeft - before;

      for (const cell of group.cells) {
        const tile = this.grid[cell.row][cell.col];
        if (tile) tile.clearing = true;
      }

      this.events.onPop(group, gain.score, this.timeLeft - before, this.chain);

      // 큰 매치와 깊은 연쇄는 주변까지 날려버린다
      let cells = this.fever ? FEVER_BLAST_CELLS : 0;
      if (group.size >= BLAST_MIN_MATCH) cells += BLAST_MATCH_CELLS;
      if (this.chain >= BLAST_MIN_CHAIN) cells += BLAST_CHAIN_CELLS;

      // 피버 중에도 절반 속도로 다음 피버를 위한 게이지가 찬다
      this.feverGauge +=
        group.size *
        chainMultiplier(this.chain) *
        (this.fever ? FEVER_GAUGE_IN_FEVER : 1);

      const picked = pickBlastCells(this.grid, group.cells, cells, doomed);
      for (const cell of picked) {
        doomed.add(cellKey(cell));
        const tile = this.grid[cell.row][cell.col];
        if (tile) tile.clearing = true;
      }
      blasts.push(...picked);
    }

    // 폭발로 날아간 칸은 시간을 주지 않는다. 시간까지 주면
    // 연쇄가 스스로를 먹여 살려 제한시간이 사실상 사라진다.
    if (blasts.length > 0) {
      const bonus = Math.round(
        blasts.length *
          BLAST_SCORE *
          chainMultiplier(this.chain) *
          (this.fever ? FEVER_SCORE_MULT : 1),
      );
      this.score += bonus;
      this.events.onBlast(blasts, bonus, this.chain);
    }

    // 휩쓸린 폭탄을 유폭시킨다.
    // 매치에 직접 걸린 폭탄보다 폭발에 휘말린 폭탄이 더 크게 터진다.
    // 밀어서 만든 매치(연쇄 1단계)에 폭탄이 걸리면 민 방향 한 줄이 함께 날아간다
    const swipeLine = this.chain === 1 ? this.pendingAxis : null;

    const seeds = [
      ...groups
        .flatMap((group) => group.cells)
        .filter((cell) => this.isBomb(cell))
        .map((cell) => ({
          cell,
          radius: BOMB_TAP_RADIUS,
          ...(swipeLine ? { line: swipeLine } : {}),
        })),
      ...blasts
        .filter((cell) => this.isBomb(cell))
        .map((cell) => ({ cell, radius: BOMB_CHAIN_RADIUS })),
    ];

    if (seeds.length > 0) {
      const blown = this.detonateFrom(seeds, doomed);
      if (blown.cells.length > 0) {
        const bonus = Math.round(
          blown.cells.length *
            BOMB_SCORE *
            chainMultiplier(this.chain) *
            (this.fever ? FEVER_SCORE_MULT : 1),
        );
        this.score += bonus;
        this.events.onBomb(blown.origins, blown.cells, bonus, this.chain);
      }
    }

    if (this.chain >= 2) this.events.onChain(this.chain);
    this.events.onScoreChange(this.score);
    this.grantChances();
    this.grantErases();

    if (!this.fever && this.feverGauge >= FEVER_GAUGE_MAX) {
      this.feverGauge -= FEVER_GAUGE_MAX;
      this.feverLeft = FEVER_DURATION;
      this.events.onFeverStart();
    }

    this.clearingCells = [...doomed].map((key) => {
      const [row, col] = key.split(',');
      return { row: Number(row), col: Number(col) };
    });
    this.setPhase('clear', CLEAR_MS);
  }

  /** 제거 연출 종료 → 실제로 비우고 낙하 시작 */
  private afterClear(): void {
    clearCells(this.grid, this.clearingCells);
    this.clearingCells = [];

    const plan = applyGravity(this.grid);

    let maxDrop = 0;
    for (const tile of [...plan.moved, ...plan.spawned]) {
      maxDrop = Math.max(maxDrop, tile.row - tile.fromRow);
    }
    const dur = Math.max(FALL_MS_MIN, Math.min(maxDrop, ROWS) * FALL_MS_PER_ROW);
    this.setPhase('fall', dur);
  }

  /** 찬스 재배치 연출 종료 → 우연히 매치가 생겼는지 확인 */
  private afterChance(): void {
    this.chanceCells.clear();
    this.settle();

    const groups = findMatches(this.grid);
    if (groups.length > 0) {
      // 섞어서 터뜨린 것도 손을 놀린 결과이므로 콤보로 쳐준다
      this.bumpCombo();
      this.chain = 0;
      this.beginClear(groups);
      return;
    }
    this.toIdle();
  }

  /** 매치에 성공했다 — 콤보를 잇고 시계를 다시 채운다 */
  private bumpCombo(): void {
    this.combo += 1;
    this.comboLeft = COMBO_WINDOW_MS;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo >= COMBO_MIN_SHOW) this.events.onCombo(this.combo);
  }

  private breakCombo(): void {
    this.comboLeft = 0;
    if (this.combo > 0) {
      this.combo = 0;
      this.events.onComboEnd();
    }
  }

  /**
   * 누적 점수가 기준을 넘을 때마다 섞기를 지급한다.
   * 받을 때마다 다음 기준까지의 간격이 20%씩 늘어난다.
   */
  private grantChances(): void {
    let gained = false;
    while (this.score >= this.nextChanceAt) {
      this.chances += 1;
      this.chanceStep *= CHANCE_STEP_GROWTH;
      this.nextChanceAt += this.chanceStep;
      gained = true;
    }
    if (gained) this.events.onChanceGained(this.chances);
  }

  /** 낙하 종료 → 연쇄 판정 */
  private afterFall(): void {
    this.settle();
    const groups = findMatches(this.grid);
    if (groups.length > 0) {
      this.beginClear(groups);
      return;
    }
    this.toIdle();
  }

  private finish(): void {
    this.phase = 'over';
    const result: GameResult = {
      score: this.score,
      maxChain: this.maxChain,
      maxCombo: this.maxCombo,
      biggestMatch: this.biggestMatch,
      survived: this.survived,
      earnedTime: this.earnedTime,
    };
    this.events.onGameOver(result);
  }
}
