/**
 * 밸런스 검증용 시뮬레이터.
 *
 * 렌더링 없이 엔진만 돌려서 "실력에 따라 1분이 얼마나 늘어나는지"를 측정한다.
 * 숫자를 만질 때마다 이걸 돌려보면 감으로 튜닝하지 않아도 된다.
 *
 *   npm run sim
 */
import { findBestMove, findHint } from '../src/game/board';
import { BOMB_SPAWN_CHANCE, MAX_TIME, START_TIME } from '../src/game/config';
import { Engine } from '../src/game/engine';
import type { Cell, GameResult } from '../src/game/types';

type Skill = 'random' | 'greedy';

export interface SimOptions {
  skill: Skill;
  /** 한 수를 두기까지 걸리는 생각 시간(ms) */
  thinkMs: number;
  /** 찬스가 생기는 대로 바로 쓴다 (찬스가 밸런스에 주는 상한을 보려는 용도) */
  useChance?: boolean;
}

/** 게임 결과에 시뮬레이션에서만 세는 값을 얹은 것 */
export interface SimResult extends GameResult {
  /** 폭발로 함께 날아간 젬 수 */
  blasted: number;
  /** 한 판에서 사라진 젬 총수 — 폭탄이 얼마나 생길지 가늠하는 데 쓴다 */
  cleared: number;
  /** 터진 폭탄 수 */
  bombsBlown: number;
  /** 피버 발동 횟수 */
  fevers: number;
  /** 둘 곳이 없어 보드를 섞은 횟수 */
  shuffles: number;
}

export function simulate(opts: SimOptions): SimResult {
  let result: GameResult | null = null;
  let blasted = 0;
  let cleared = 0;
  let bombsBlown = 0;
  let fevers = 0;
  let shuffles = 0;

  const engine = new Engine({
    onPop: (group) => {
      cleared += group.size;
    },
    onBlast: (cells) => {
      blasted += cells.length;
      cleared += cells.length;
    },
    onBomb: (origins, cells) => {
      bombsBlown += origins.length;
      cleared += cells.length;
    },
    onChain: () => {},
    onSwapFail: () => {},
    onShuffle: () => {
      shuffles += 1;
    },
    onChance: () => {},
    onChanceGained: () => {},
    onCombo: () => {},
    onComboEnd: () => {},
    onErase: () => {},
    onEraseGained: () => {},
    onFeverStart: () => {
      fevers += 1;
    },
    onFeverEnd: () => {},
    onScoreChange: () => {},
    onGameOver: (r) => {
      result = r;
    },
  });

  engine.start();

  const DT = 1000 / 60;
  let thinkLeft = opts.thinkMs;
  let guard = 0;

  while (!result && guard++ < 200_000) {
    engine.update(DT);
    if (result) break;

    if (engine.phase === 'idle') {
      if (opts.useChance && engine.canUseChance) {
        engine.useChance();
        continue;
      }
      thinkLeft -= DT;
      if (thinkLeft <= 0) {
        const move =
          opts.skill === 'greedy'
            ? findBestMove(engine.grid)?.swap
            : randomMove(engine);
        if (move) engine.trySwap(move[0], move[1]);
        thinkLeft = opts.thinkMs;
      }
    }
  }

  return {
    ...(result ?? {
      score: engine.score,
      maxChain: 0,
      maxCombo: 0,
      biggestMatch: 0,
      survived: 0,
      earnedTime: 0,
    }),
    blasted,
    cleared,
    bombsBlown,
    fevers,
    shuffles,
  };
}

function randomMove(engine: Engine): [Cell, Cell] | null {
  const hint = findHint(engine.grid);
  if (!hint) return null;
  return [hint[0], hint[1]];
}

function stats(values: number[]): { avg: number; min: number; max: number } {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg, min: Math.min(...values), max: Math.max(...values) };
}

export function main(): void {
  const RUNS = 30;

  const profiles: Array<{ label: string; opts: SimOptions }> = [
    { label: '초보  (아무 수나, 2.0초 고민)', opts: { skill: 'random', thinkMs: 2000 } },
    { label: '보통  (아무 수나, 1.1초 고민)', opts: { skill: 'random', thinkMs: 1100 } },
    { label: '숙련  (최선 수,  0.9초 고민)', opts: { skill: 'greedy', thinkMs: 900 } },
    { label: '고수  (최선 수,  0.45초 고민)', opts: { skill: 'greedy', thinkMs: 450 } },
    {
      label: '고수+찬스 (생기는 대로 사용)',
      opts: { skill: 'greedy', thinkMs: 450, useChance: true },
    },
  ];

  console.log(`\n제한시간 ${START_TIME}초 시작 / 상한 ${MAX_TIME}초 · 각 ${RUNS}판\n`);
  console.log(
    '실력'.padEnd(30),
    '평균점수'.padStart(10),
    '최고점'.padStart(9),
    '생존(초)'.padStart(9),
    '번시간'.padStart(8),
    '최대체인'.padStart(8),
    '폭발'.padStart(7),
    '피버'.padStart(6),
    '막힘'.padStart(6),
    '제거젬'.padStart(7),
    '폭탄'.padStart(6),
  );
  console.log('-'.repeat(96));

  for (const { label, opts } of profiles) {
    const results = Array.from({ length: RUNS }, () => simulate(opts));
    const score = stats(results.map((r) => r.score));
    const survived = stats(results.map((r) => r.survived));
    const earned = stats(results.map((r) => r.earnedTime));
    const chain = stats(results.map((r) => r.maxChain));
    const blasted = stats(results.map((r) => r.blasted));
    const fevers = stats(results.map((r) => r.fevers));
    const shuffles = stats(results.map((r) => r.shuffles));
    const cleared = stats(results.map((r) => r.cleared));

    console.log(
      label.padEnd(28),
      Math.round(score.avg).toLocaleString().padStart(11),
      Math.round(score.max).toLocaleString().padStart(10),
      survived.avg.toFixed(1).padStart(9),
      earned.avg.toFixed(1).padStart(9),
      chain.max.toFixed(0).padStart(8),
      blasted.avg.toFixed(1).padStart(8),
      fevers.avg.toFixed(1).padStart(7),
      shuffles.avg.toFixed(1).padStart(7),
      Math.round(cleared.avg).toString().padStart(8),
      (cleared.avg * BOMB_SPAWN_CHANCE).toFixed(2).padStart(7),
    );
  }

  console.log(
    '\n생존 시간이 실력에 따라 늘어나되 상한 근처에서 완만해지면 밸런스가 맞는 것이다.\n',
  );
}
