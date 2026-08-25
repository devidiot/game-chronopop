import { cellsOfKind, findBestMove, findHint, isAdjacent } from './board';
import { COLS, KINDS, ROWS } from './config';
import type { Engine } from './engine';
import type { Cell } from './types';

/**
 * 구경 모드 — 컴퓨터가 사람인 척 대신 두는 봇.
 *
 * 엔진에는 어떤 특혜도 없다. 사람이 손으로 하는 것과 **똑같은 입구**
 * (`trySwap` / `detonate` / `useChance` / `eraseKind`)만 쓰고, 판을 미리
 * 들여다보거나 시간을 벌어주는 짓은 하지 않는다.
 *
 * 실력 차이는 오직 **반응 속도(delay)** 하나다. 초보도 고수도 같은 눈으로
 * 같은 수를 고르되, 손이 느리냐 빠르냐만 다르다. 그래서 운이 나쁘면
 * 고수도 초보만 한 점수가 나온다.
 */

export type SkillId = 'rookie' | 'skilled' | 'master';

export interface Skill {
  id: SkillId;
  label: string;
  /** 버튼에 적는 짧은 설명 */
  note: string;
  /**
   * 판이 잠잠해진 뒤 다음 수를 두기까지 걸리는 시간(ms) 범위.
   * 매번 이 안에서 새로 뽑으므로 박자가 기계처럼 고르지 않다.
   */
  delay: [number, number];
}

export const SKILLS: Skill[] = [
  { id: 'rookie', label: '초보', note: '한 수 걸러 한 번 고민 · 0.9~1.4초', delay: [900, 1400] },
  { id: 'skilled', label: '중수', note: '또박또박 이어간다 · 0.55~0.85초', delay: [550, 850] },
  { id: 'master', label: '고수', note: '손이 쉬지 않는다 · 0.28~0.45초', delay: [280, 450] },
];

export function findSkill(id: string | null | undefined): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

/**
 * 뽑은 시간 중 "어디를 칠지 고르는" 데 쓰는 몫.
 * 나머지는 고른 젬을 실제로 미는 손동작에 쓴다. 둘을 합치면
 * 위 `delay` 가 되므로, 실력별 간격은 표에 적힌 그대로다.
 */
const AIM_SHARE = 0.62;

/** 가끔 한눈을 판다 — 사람은 늘 같은 박자로 두지 않는다 */
const DISTRACT_CHANCE = 0.08;
const DISTRACT_MS: [number, number] = [400, 900];

/**
 * 최선의 수를 못 보고 눈에 먼저 띈 수를 두는 확률.
 * **실력과 무관하게 같은 값**이다. 실력 차는 delay 로만 준다.
 */
const SLOPPY_CHANCE = 0.18;

/** 폭탄이 보일 때 그 자리에서 눌러 터뜨릴 확률 */
const BOMB_TAP_CHANCE = 0.45;

/** 지우기가 있을 때 쓸 확률(한 수당) */
const ERASE_CHANCE = 0.08;
/** 이만큼은 깔려 있어야 지우기를 쓸 만하다 */
const ERASE_MIN_CELLS = 7;

/** 섞기가 있을 때 쓸 확률(한 수당) */
const CHANCE_USE_CHANCE = 0.06;

/** 봇이 사람 대신 만지는 손 — 화면 버튼과 완전히 같은 동작이다 */
export interface Hands {
  /** 젬 하나를 고른다(선택 표시가 켜진다) */
  select: (cell: Cell | null) => void;
  /** 고른 젬을 옆으로 민다 */
  swap: (a: Cell, b: Cell) => void;
  /** 폭탄을 눌러 터뜨린다 */
  detonate: (cell: Cell) => void;
  /** 🔀 섞기 버튼 */
  chance: () => void;
  /** 🧹 지우기 버튼 */
  armErase: () => void;
  /** 지우기 준비 상태에서 젬을 눌러 그 종류를 없앤다 */
  erase: (kind: number) => void;
}

type Plan =
  | { kind: 'swap'; a: Cell; b: Cell }
  | { kind: 'bomb'; cell: Cell }
  | { kind: 'erase'; target: number; cell: Cell }
  | { kind: 'chance' };

function rand(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** 판 위의 폭탄 자리 */
function findBombs(engine: Engine): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (engine.grid[r][c]?.bomb) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** 맞붙어 있는 폭탄 두 개 — 서로 밀면 판이 통째로 날아간다 */
function findBombPair(bombs: Cell[]): [Cell, Cell] | null {
  for (let i = 0; i < bombs.length; i++) {
    for (let j = i + 1; j < bombs.length; j++) {
      if (isAdjacent(bombs[i], bombs[j])) return [bombs[i], bombs[j]];
    }
  }
  return null;
}

/** 판에 가장 많이 깔린 동물과 그 자리 하나 */
function fattestKind(engine: Engine): { kind: number; count: number; cell: Cell } | null {
  let best: { kind: number; count: number; cell: Cell } | null = null;

  for (let kind = 0; kind < KINDS; kind++) {
    const cells = cellsOfKind(engine.grid, kind);
    if (cells.length === 0) continue;
    if (!best || cells.length > best.count) {
      best = { kind, count: cells.length, cell: pick(cells) };
    }
  }

  return best;
}

export class Bot {
  /** 지금 구경 중인 실력. null 이면 봇은 자고 있다. */
  private skill: Skill | null = null;

  /** 고른 뒤 아직 손을 대지 않은 수 */
  private plan: Plan | null = null;
  /** 다음 동작까지 남은 시간(ms) */
  private timer = 0;
  /** 이번 수의 손동작에 쓸 시간(ms) */
  private handMs = 0;

  constructor(
    private engine: Engine,
    private hands: Hands,
  ) {}

  get active(): boolean {
    return this.skill !== null;
  }

  get label(): string | null {
    return this.skill?.label ?? null;
  }

  start(skill: Skill): void {
    this.skill = skill;
    this.plan = null;
    this.beginAim();
  }

  stop(): void {
    this.skill = null;
    this.plan = null;
  }

  /** 매 프레임 호출(ms). 게임이 실제로 돌고 있을 때만 불러야 한다. */
  update(dt: number): void {
    if (!this.skill || !this.engine.isPlaying) return;

    // 연쇄가 재생되는 동안에는 사람도 손을 놓고 구경한다.
    // 판이 잠잠해지면 그때부터 다시 시간을 잰다.
    if (this.engine.phase !== 'idle') {
      this.plan = null;
      this.beginAim();
      return;
    }

    this.timer -= dt;
    if (this.timer > 0) return;

    // 1단계 — 어디를 칠지 고른다(선택 표시가 켜진다)
    if (!this.plan) {
      const plan = this.decide();
      if (!plan) {
        this.beginAim();
        return;
      }
      this.plan = plan;
      this.aim(plan);
      this.timer = this.handMs;
      return;
    }

    // 2단계 — 실제로 민다
    const plan = this.plan;
    this.plan = null;
    this.act(plan);
    this.beginAim();
  }

  /** 다음 수를 고르기까지의 뜸을 새로 뽑는다 */
  private beginAim(): void {
    const total = rand(this.skill!.delay);
    const distract = Math.random() < DISTRACT_CHANCE ? rand(DISTRACT_MS) : 0;
    this.timer = total * AIM_SHARE + distract;
    this.handMs = total * (1 - AIM_SHARE);
  }

  /**
   * 무엇을 할지 정한다.
   *
   * 사람이 판을 보는 순서 그대로다 — 폭탄이 먼저 눈에 띄고, 쟁여둔
   * 아이템이 생각나고, 그다음에야 맞출 자리를 찾는다.
   */
  private decide(): Plan | null {
    const engine = this.engine;
    const bombs = findBombs(engine);

    // 붙어 있는 폭탄 두 개는 누가 봐도 맞부딪힐 자리다
    const pair = findBombPair(bombs);
    if (pair) return { kind: 'swap', a: pair[0], b: pair[1] };

    if (bombs.length > 0 && Math.random() < BOMB_TAP_CHANCE) {
      return { kind: 'bomb', cell: pick(bombs) };
    }

    if (engine.canUseErase && Math.random() < ERASE_CHANCE) {
      const fat = fattestKind(engine);
      if (fat && fat.count >= ERASE_MIN_CELLS) {
        return { kind: 'erase', target: fat.kind, cell: fat.cell };
      }
    }

    // 아껴두기만 하면 쓸 일이 없다 — 가끔 섞어본다
    if (engine.canUseChance && Math.random() < CHANCE_USE_CHANCE) {
      return { kind: 'chance' };
    }

    // 늘 최선의 수를 찾아내지는 못한다. 가끔은 눈에 먼저 띈 수를 둔다.
    const move = Math.random() < SLOPPY_CHANCE ? null : findBestMove(engine.grid);
    if (move) return { kind: 'swap', a: move.swap[0], b: move.swap[1] };

    const any = findHint(engine.grid);
    if (any) return { kind: 'swap', a: any[0], b: any[1] };

    // 둘 곳이 없다 — 섞기가 있으면 쓴다(없으면 엔진이 알아서 섞어준다)
    return engine.canUseChance ? { kind: 'chance' } : null;
  }

  /** 손이 가기 전, 칠 자리를 눈으로 짚는다 */
  private aim(plan: Plan): void {
    switch (plan.kind) {
      case 'swap':
        this.hands.select(plan.a);
        break;
      case 'bomb':
        this.hands.select(plan.cell);
        break;
      case 'erase':
        // 버튼을 먼저 누르고 지울 동물을 고른다 — 사람이 하는 순서 그대로
        this.hands.armErase();
        this.hands.select(plan.cell);
        break;
      case 'chance':
        this.hands.select(null);
        break;
    }
  }

  private act(plan: Plan): void {
    switch (plan.kind) {
      case 'swap':
        this.hands.select(null);
        this.hands.swap(plan.a, plan.b);
        break;
      case 'bomb':
        this.hands.select(null);
        this.hands.detonate(plan.cell);
        break;
      case 'erase':
        // 일시정지 등으로 준비가 풀렸을 수 있다
        if (!this.engine.eraseArmed) this.hands.armErase();
        this.hands.select(null);
        this.hands.erase(plan.target);
        break;
      case 'chance':
        this.hands.chance();
        break;
    }
  }
}
