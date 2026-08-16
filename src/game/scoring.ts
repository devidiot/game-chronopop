import {
  CHAIN_MULT,
  COMBO_MAX_STACK,
  COMBO_STEP,
  TIME_DECAY_FLOOR,
  TIME_SOFT_CAP,
  baseScore,
  baseTime,
} from './config';

/**
 * 연쇄 배수. chain은 1부터 시작한다(첫 매치 = 1연타).
 * 한 번의 조작으로 연쇄가 이어질수록 급격히 커진다.
 */
export function chainMultiplier(chain: number): number {
  const idx = Math.min(Math.max(chain, 1) - 1, CHAIN_MULT.length - 1);
  return CHAIN_MULT[idx];
}

/**
 * 콤보 보너스 배수.
 * 손을 멈추지 않고 연달아 터뜨리면 최대 2배까지 붙는다.
 */
export function comboMultiplier(combo: number): number {
  const stacks = Math.min(Math.max(combo - 1, 0), COMBO_MAX_STACK);
  return 1 + stacks * COMBO_STEP;
}

/**
 * 시간 보상 감쇠율.
 * 총점이 오를수록 1 → 0으로 줄어들되 TIME_DECAY_FLOOR 아래로는 안 내려간다.
 * 덕분에 초반엔 시간이 쭉쭉 늘고 후반엔 늘리기가 점점 빡세진다.
 */
export function timeDecay(totalScore: number): number {
  const raw = TIME_SOFT_CAP / (TIME_SOFT_CAP + Math.max(0, totalScore));
  return Math.max(TIME_DECAY_FLOOR, raw);
}

export interface Gain {
  score: number;
  time: number;
  /** 점수에 적용된 총 배수 (팝업 표시용) */
  multiplier: number;
}

/**
 * 한 덩어리를 터뜨렸을 때의 점수/시간 보상.
 *
 * 점수 = 크기별 기본점 × 연쇄배수 × 콤보배수
 * 시간 = 크기별 기본시간 × 연쇄배수 × 감쇠율
 *
 * 시간에는 콤보배수를 곱하지 않는다. 점수와 시간 양쪽에 모두 곱하면
 * 잘하는 플레이어의 시간이 사실상 무한히 늘어나기 때문이다.
 */
export function computeGain(
  size: number,
  chain: number,
  combo: number,
  totalScore: number,
): Gain {
  const chainMul = chainMultiplier(chain);
  const comboMul = comboMultiplier(combo);
  const score = Math.round(baseScore(size) * chainMul * comboMul);
  const time = baseTime(size) * chainMul * timeDecay(totalScore);
  return { score, time, multiplier: chainMul * comboMul };
}
