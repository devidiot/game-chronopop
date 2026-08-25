import {
  cellsOfKind,
  isAdjacent,
  listMoves,
  pickBestMove,
  pickBiggestMove,
  type ScoredMove,
} from './board';
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
 * 실력 차이는 두 가지다.
 *   - **눈**: 4개 이상 터지는 자리를 알아보는 확률(`sharp`).
 *     못 알아보면 눈에 먼저 띈 아무 수나 둔다.
 *   - **손**: 한 수와 다음 수 사이의 간격(`delay`).
 *
 * 알아보지 못하고 아무 수나 둬도 그게 우연히 4매치일 수 있다. 그래서 초보도
 * 어쩌다 큰 걸 터뜨리고, 판이 안 풀리면 고수도 초보만 한 점수로 끝난다.
 */

export type SkillId = 'rookie' | 'skilled' | 'master' | 'grandmaster';

export interface Skill {
  id: SkillId;
  label: string;
  /** 고르기 버튼에 붙는 얼굴 */
  emoji: string;
  /** 버튼에 적는 짧은 설명 */
  note: string;
  /**
   * 판이 잠잠해진 뒤 다음 수를 두기까지 걸리는 시간(ms) 범위.
   * 매번 이 안에서 새로 뽑으므로 박자가 기계처럼 고르지 않다.
   */
  delay: [number, number];
  /**
   * 판에서 **가장 큰 덩어리가 터지는 자리**를 알아볼 확률.
   * 못 알아보면 둘 수 있는 수 중 눈에 먼저 띈 것을 집는다.
   */
  sharp: number;
  /**
   * 4개 이상만 노린다.
   *
   * 큰 자리가 있으면 무조건 그것부터 치고, 없으면 폭탄·지우기·섞기로
   * 판을 흔들어 만들어낸다. 그래도 없을 때만 마지못해 3매치를 둔다 —
   * 이 게임에서 판을 바꾸는 방법은 젬을 터뜨리는 것뿐이라, 아예 안 두면
   * 판이 그대로 굳어 제한시간만 흘러간다.
   */
  bigOnly?: boolean;
}

export const SKILLS: Skill[] = [
  {
    id: 'rookie',
    label: '초보',
    emoji: '🐣',
    note: '어쩌다 운 좋게 큰 걸 터뜨린다',
    delay: [900, 1400],
    sharp: 0.12,
  },
  {
    id: 'skilled',
    label: '중수',
    emoji: '🙂',
    note: '4개짜리를 종종 놓친다',
    delay: [550, 850],
    sharp: 0.5,
  },
  {
    id: 'master',
    label: '고수',
    emoji: '😎',
    note: '4개 이상을 귀신같이 찾아낸다',
    delay: [280, 450],
    sharp: 0.97,
  },
  {
    id: 'grandmaster',
    label: '초고수',
    emoji: '⚡',
    note: '뜸 들이지 않고 4개 이상만 노린다',
    delay: [0, 0],
    sharp: 1,
    bigOnly: true,
  },
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
  /**
   * 젬 하나를 고른다(선택 표시가 켜진다).
   * @param travelMs 손가락 커서가 그 자리까지 가는 데 쓸 시간
   */
  select: (cell: Cell | null, travelMs: number) => void;
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

  /**
   * 실력 차이를 확인하는 계수기(시뮬레이터 전용).
   * 게임 진행에는 쓰이지 않는다.
   */
  readonly stats = { moves: 0, bigAvailable: 0, bigTaken: 0 };

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
        // 둘 것이 아무것도 없다 — 판이 바뀌기를 기다린다.
        // 뜸이 없는 실력이라고 곧바로 다시 훑으면 매 프레임 판 전체를
        // 뒤지게 되므로 최소한의 간격은 둔다.
        this.beginAim();
        this.timer = Math.max(this.timer, 150);
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
    // 뜸을 들이지 않는 실력은 한눈도 팔지 않는다
    const distract =
      this.skill!.delay[1] > 0 && Math.random() < DISTRACT_CHANCE ? rand(DISTRACT_MS) : 0;
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
    const skill = this.skill!;
    const bombs = findBombs(engine);

    // 붙어 있는 폭탄 두 개는 누가 봐도 맞부딪힐 자리다
    const pair = findBombPair(bombs);
    if (pair) return { kind: 'swap', a: pair[0], b: pair[1] };

    const moves = listMoves(engine.grid);

    if (skill.bigOnly) return this.decideBigOnly(moves, bombs);

    if (bombs.length > 0 && Math.random() < BOMB_TAP_CHANCE) {
      return { kind: 'bomb', cell: pick(bombs) };
    }

    if (engine.canUseErase && Math.random() < ERASE_CHANCE) {
      const erase = this.eraseePlan();
      if (erase) return erase;
    }

    // 아껴두기만 하면 쓸 일이 없다 — 가끔 섞어본다
    if (engine.canUseChance && Math.random() < CHANCE_USE_CHANCE) {
      return { kind: 'chance' };
    }

    // 실력만큼만 알아본다. 눈이 밝으면 제일 큰 덩어리가 터지는 자리를,
    // 아니면 눈에 먼저 띈 아무 수나 집는다.
    if (moves.length > 0) {
      const move = Math.random() < skill.sharp ? pickBiggestMove(moves) : pick(moves);
      this.tally(moves, move);
      if (move) return { kind: 'swap', a: move.swap[0], b: move.swap[1] };
    }

    // 둘 곳이 없다 — 섞기가 있으면 쓴다(없으면 엔진이 알아서 섞어준다)
    return engine.canUseChance ? { kind: 'chance' } : null;
  }

  /**
   * 4개 이상만 노리는 실력.
   *
   * 큰 자리가 하나라도 있으면 반드시 그것을 친다. 없으면 손에 쥔 것부터
   * 털어 판을 흔든다 — 폭탄, 지우기, 섞기 순이다. 그마저 없으면 어쩔 수
   * 없이 3매치를 둔다. 이 게임에서 판을 바꾸는 방법은 젬을 터뜨리는 것뿐이라,
   * 여기서 손을 놓으면 판이 굳은 채 제한시간만 흘러간다.
   */
  private decideBigOnly(moves: ScoredMove[], bombs: Cell[]): Plan | null {
    const engine = this.engine;
    const big = moves.filter((move) => move.biggest >= 4);

    if (big.length > 0) {
      const move = pickBiggestMove(big);
      this.tally(moves, move);
      if (move) return { kind: 'swap', a: move.swap[0], b: move.swap[1] };
    }

    // 큰 자리가 없다 — 만들어낸다
    if (bombs.length > 0) return { kind: 'bomb', cell: pick(bombs) };

    if (engine.canUseErase) {
      const erase = this.eraseePlan();
      if (erase) return erase;
    }

    if (engine.canUseChance) return { kind: 'chance' };

    if (moves.length > 0) {
      // 3매치라도 둬서 판을 흔든다. 가장 크게 흔드는 쪽으로.
      const move = pickBestMove(moves);
      this.tally(moves, move);
      if (move) return { kind: 'swap', a: move.swap[0], b: move.swap[1] };
    }

    return null;
  }

  /** 판에 가장 많이 깔린 동물을 통째로 지우는 수 */
  private eraseePlan(): Plan | null {
    const fat = fattestKind(this.engine);
    if (!fat || fat.count < ERASE_MIN_CELLS) return null;
    return { kind: 'erase', target: fat.kind, cell: fat.cell };
  }

  /** 실력의 눈이 얼마나 밝은지 세어 둔다(시뮬레이터 전용) */
  private tally(moves: ScoredMove[], chosen: ScoredMove | null): void {
    this.stats.moves += 1;
    if (moves.some((move) => move.biggest >= 4)) this.stats.bigAvailable += 1;
    if (chosen && chosen.biggest >= 4) this.stats.bigTaken += 1;
  }

  /** 손이 가기 전, 칠 자리를 눈으로 짚는다 */
  private aim(plan: Plan): void {
    switch (plan.kind) {
      case 'swap':
        this.hands.select(plan.a, this.handMs);
        break;
      case 'bomb':
        this.hands.select(plan.cell, this.handMs);
        break;
      case 'erase':
        // 버튼을 먼저 누르고 지울 동물을 고른다 — 사람이 하는 순서 그대로
        this.hands.armErase();
        this.hands.select(plan.cell, this.handMs);
        break;
      case 'chance':
        this.hands.select(null, 0);
        break;
    }
  }

  private act(plan: Plan): void {
    switch (plan.kind) {
      case 'swap':
        this.hands.select(null, 0);
        this.hands.swap(plan.a, plan.b);
        break;
      case 'bomb':
        this.hands.select(null, 0);
        this.hands.detonate(plan.cell);
        break;
      case 'erase':
        // 일시정지 등으로 준비가 풀렸을 수 있다
        if (!this.engine.eraseArmed) this.hands.armErase();
        this.hands.select(null, 0);
        this.hands.erase(plan.target);
        break;
      case 'chance':
        this.hands.chance();
        break;
    }
  }
}
