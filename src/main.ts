import './style.css';

import { findHint } from './game/board';
import {
  BOARD_SIZES,
  GEM_STYLES,
  HITSTOP_BLAST,
  HITSTOP_BOMB,
  HITSTOP_CHAIN,
  HITSTOP_FEVER,
  HITSTOP_MATCH4,
  HITSTOP_MATCH5,
  getBoardSize,
  setBoardSize,
  type BoardSize,
} from './game/config';
import { Engine } from './game/engine';
import { sfx } from './game/audio';
import { haptics } from './game/haptics';
import {
  addRecord,
  clearRecords,
  getBest,
  getSavedBoardSize,
  setSavedBoardSize,
} from './game/storage';
import type { GameResult, MatchGroup } from './game/types';
import { attachPointer } from './input/pointer';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { UI } from './ui/screens';

const ui = new UI();
const renderer = new Renderer(ui.canvas);
const effects = new Effects();

/** 카운트다운 중이거나 게임이 끝나면 false — 이때는 시간이 흐르지 않는다 */
let running = false;
/** 일시정지 중인가 */
let paused = false;
/** 남은 히트스톱(ms) — 0보다 크면 게임과 연출이 통째로 멈춘다 */
let hitStop = 0;
/** 줌 펀치 세기 0~1 */
let punch = 0;
/** HUD 갱신 주기를 재는 타이머 */
let hudTimer = 0;
/** 큰 연쇄에서 화면을 살짝 흔든다 */
let shake = 0;
let lastTickSecond = -1;

/** 게임 오버 모달에서 확인을 누를 때까지 들고 있는 결과 */
let pendingResult: { result: GameResult; isNewBest: boolean } | null = null;

/** 큰 매치가 터진 순간 화면을 잠깐 얼린다 */
function impact(stopMs: number, punchPower: number, flash: number): void {
  hitStop = Math.max(hitStop, stopMs);
  punch = Math.min(1, punch + punchPower);
  if (flash > 0) ui.flashScreen(flash);
}

const engine = new Engine({
  onPop: (group: MatchGroup, score: number, time: number, chain: number) => {
    const style = GEM_STYLES[group.kind % GEM_STYLES.length];
    const power = group.size >= 5 ? 1.5 : group.size === 4 ? 1.2 : 1;

    for (const cell of group.cells) {
      const p = renderer.cellCenter(cell.row, cell.col);
      effects.burst(p.x, p.y, group.kind, renderer.cell, power);
    }

    const center = renderer.cellCenter(group.centerRow, group.centerCol);
    // 가장자리에서 터지면 글자가 캔버스 밖으로 나가므로 안쪽으로 밀어준다
    const margin = renderer.cell * 1.6;
    const textY = Math.max(center.y, margin);
    const textX = Math.min(Math.max(center.x, margin), renderer.size - margin);
    effects.float(textX, textY, `+${score}`, style.light, renderer.cell * 0.44);

    // 시간 상한에 걸려 실제로 늘어난 게 없으면 굳이 띄우지 않는다
    if (time >= 0.05) {
      effects.float(
        center.x,
        textY - renderer.cell * 0.62,
        `+${time.toFixed(1)}s`,
        '#5cf0b0',
        renderer.cell * 0.34,
      );
      ui.flashTimeGain();
    }

    sfx.pop(chain, group.size);
    haptics.pop(group.size, chain);
    if (group.size >= 5) sfx.bonus();
    if (chain >= 3 || group.size >= 5) shake = Math.min(1, shake + 0.35);

    // 클수록·깊을수록 세게 때린다
    if (group.size >= 5) impact(HITSTOP_MATCH5, 0.6, 0.28);
    else if (group.size === 4) impact(HITSTOP_MATCH4, 0.35, 0.12);
    else if (chain >= 3) impact(HITSTOP_CHAIN, 0.3, 0.1);
  },

  onBlast: (cells, bonus, chain) => {
    let sumX = 0;
    let sumY = 0;

    for (const cell of cells) {
      const p = renderer.cellCenter(cell.row, cell.col);
      // 아직 제거 전이라 젬 종류를 그대로 읽을 수 있다
      const kind = engine.grid[cell.row][cell.col]?.kind ?? 0;
      effects.blast(p.x, p.y, kind, renderer.cell);
      sumX += p.x;
      sumY += p.y;
    }

    const margin = renderer.cell * 1.6;
    effects.float(
      Math.min(Math.max(sumX / cells.length, margin), renderer.size - margin),
      Math.max(sumY / cells.length, margin),
      `+${bonus}`,
      '#ffe08a',
      renderer.cell * 0.38,
    );

    sfx.blast(chain);
    haptics.blast();
    shake = Math.min(1, shake + 0.45);
    impact(HITSTOP_BLAST, 0.5, 0.22);
  },

  onBomb: (origins, cells, bonus, chain) => {
    for (const cell of cells) {
      const p = renderer.cellCenter(cell.row, cell.col);
      const kind = engine.grid[cell.row][cell.col]?.kind ?? 0;
      effects.blast(p.x, p.y, kind, renderer.cell);
    }

    // 폭탄이 있던 자리는 한 번 더 크게
    let sumX = 0;
    let sumY = 0;
    for (const origin of origins) {
      const p = renderer.cellCenter(origin.row, origin.col);
      effects.blast(p.x, p.y, 5, renderer.cell * 1.5);
      sumX += p.x;
      sumY += p.y;
    }

    const margin = renderer.cell * 1.6;
    effects.float(
      Math.min(Math.max(sumX / origins.length, margin), renderer.size - margin),
      Math.max(sumY / origins.length, margin),
      `💣 +${bonus}`,
      '#ffb347',
      renderer.cell * 0.42,
    );

    sfx.bomb();
    haptics.bomb();
    shake = 1;
    impact(HITSTOP_BOMB, 1, 0.5);
    if (chain >= 2) ui.showChain(chain);
  },

  onChain: (chain: number) => {
    ui.showChain(chain);
  },

  onSwapFail: () => {
    sfx.fail();
    haptics.fail();
    shake = Math.min(1, shake + 0.15);
  },

  onShuffle: () => {
    ui.showToast('🔀 섞는 중…');
  },

  onChance: (cells, left) => {
    for (const cell of cells) {
      const p = renderer.cellCenter(cell.row, cell.col);
      // 재배치 직후라 새로 들어온 젬의 색이 그대로 읽힌다
      const kind = engine.grid[cell.row][cell.col]?.kind ?? 0;
      effects.burst(p.x, p.y, kind, renderer.cell, 0.7);
    }
    ui.setChances(left);
    sfx.chance();
    haptics.chance();
  },

  onChanceGained: (total) => {
    ui.setChances(total, true);
  },

  onErase: (cells, _kind, bonus, left) => {
    let sumX = 0;
    let sumY = 0;

    for (const cell of cells) {
      const p = renderer.cellCenter(cell.row, cell.col);
      const kind = engine.grid[cell.row][cell.col]?.kind ?? 0;
      effects.blast(p.x, p.y, kind, renderer.cell);
      sumX += p.x;
      sumY += p.y;
    }

    const margin = renderer.cell * 1.6;
    effects.float(
      Math.min(Math.max(sumX / cells.length, margin), renderer.size - margin),
      Math.max(sumY / cells.length, margin),
      `🧹 +${bonus}`,
      '#9fe8ff',
      renderer.cell * 0.42,
    );

    ui.setErases(left);
    ui.setEraseArmed(false);
    sfx.erase();
    haptics.blast();
    impact(HITSTOP_BLAST, 0.8, 0.35);
    shake = 1;
  },

  onEraseGained: (total) => {
    ui.setErases(total, true);
  },

  onCombo: (combo) => {
    ui.showCombo(combo);
    sfx.combo(combo);
    haptics.pop(3, combo);
    punch = Math.min(1, punch + 0.25);
  },

  onComboEnd: () => {
    // 조용히 사라진다 — 배지는 알아서 페이드아웃된다
  },

  onFeverStart: () => {
    ui.setFever(true);
    sfx.feverStart();
    haptics.blast();
    impact(HITSTOP_FEVER, 1, 0.6);
    shake = 1;
  },

  onFeverEnd: () => {
    ui.setFever(false);
    sfx.feverEnd();
  },

  onScoreChange: (score: number) => {
    ui.setScore(score, true);
  },

  onGameOver: (result: GameResult) => {
    running = false;
    paused = false;
    ui.setPauseAvailable(false);
    const isNewBest = addRecord({
      score: result.score,
      maxChain: result.maxChain,
      biggestMatch: result.biggestMatch,
      at: new Date().toISOString(),
    });
    ui.setBest(getBest());
    ui.setTime(0);
    sfx.gameOver();
    haptics.gameOver();

    // 곧바로 결과표로 넘기지 않고, 끝난 판을 잠깐 보여준다
    pendingResult = { result, isNewBest };
    window.setTimeout(() => ui.showGameOver(), 700);
  },
});

// ------------------------------------------------------------------ 레이아웃

function layout(): void {
  // 캔버스가 흐름에서 빠져 있으므로 stage의 clientWidth/Height는
  // 캔버스 크기와 무관하게 "쓸 수 있는 공간"만 나타낸다
  const size = Math.floor(Math.min(ui.stage.clientWidth, ui.stage.clientHeight));
  renderer.resize(Math.max(160, size));
}

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => window.setTimeout(layout, 250));
window.visualViewport?.addEventListener('resize', layout);

// ------------------------------------------------------------------ 루프

let last = performance.now();
/** 대기 중일 때의 최소 렌더 간격 — 초당 20장 */
const IDLE_FRAME_MS = 1000 / 20;
let lastDraw = 0;

function frame(now: number): void {
  // 화면이 잠깐 멈췄다 돌아와도 시간이 한꺼번에 깎이지 않도록 상한을 둔다
  const dt = Math.min(50, now - last);
  last = now;

  // 히트스톱 중에는 게임도 연출도 통째로 멈춘다. 그래야 타격이 묵직해진다.
  if (hitStop > 0) {
    hitStop -= dt;
  } else {
    if (running) {
      engine.update(dt);

      // HUD는 0.1초에 한 번만 갱신한다.
      // 매 프레임 DOM을 만지면 그만큼 배터리를 더 쓴다.
      hudTimer += dt;
      if (hudTimer >= 100) {
        hudTimer = 0;
        ui.setTime(engine.timeLeft);
        ui.setFeverGauge(engine.feverRatio);
      }

      // 남은 10초부터 1초에 한 번씩 재촉한다
      const sec = Math.ceil(engine.timeLeft);
      if (engine.timeLeft <= 10 && sec !== lastTickSecond) {
        lastTickSecond = sec;
        if (sec > 0) sfx.tick(sec <= 3);
      }
    }

    effects.update(dt);
  }

  // 움직일 게 없으면 초당 20장만 그린다.
  // 대기 중에도 60fps로 다시 그리면 휴대폰이 더워지기만 한다.
  const animating =
    (engine.isPlaying && engine.phase !== 'idle') ||
    effects.busy ||
    shake > 0.01 ||
    punch > 0.002 ||
    hitStop > 0;

  if (shake > 0.01 || punch > 0.002) {
    shake *= 0.88;
    punch *= 0.85;
    const amp = shake * renderer.cell * 0.18;
    const zoom = 1 + punch * 0.055;
    ui.canvas.style.transform =
      `translate(${(Math.random() - 0.5) * amp}px, ${(Math.random() - 0.5) * amp}px)` +
      ` scale(${zoom.toFixed(4)})`;
  } else if (shake !== 0 || punch !== 0) {
    shake = 0;
    punch = 0;
    ui.canvas.style.transform = '';
  }

  if (animating || now - lastDraw >= IDLE_FRAME_MS) {
    lastDraw = now;
    renderer.draw(engine, effects, now);
  }

  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ 게임 흐름

function startGame(): void {
  ui.hideAll();
  effects.clear();
  engine.start();
  running = false;
  lastTickSecond = -1;
  hitStop = 0;
  punch = 0;
  hudTimer = 0;
  pendingResult = null;
  ui.setFever(false);
  ui.setFeverGauge(0);
  ui.setChances(engine.chances);
  ui.setErases(engine.erases);
  ui.setEraseArmed(false);
  ui.setTime(engine.timeLeft);

  ui.countdown(
    (label) => sfx.countdown(label === 'GO!'),
    () => {
      running = true;
      paused = false;
      ui.setPauseAvailable(true);
      last = performance.now();
    },
  );
}

/** 게임을 멈춘다. 시간도 함께 멈춘다. */
function pauseGame(): void {
  if (!running || !engine.isPlaying) return;
  running = false;
  paused = true;
  if (engine.eraseArmed) ui.setEraseArmed(engine.toggleErase());
  ui.showPause(engine.score);
}

function resumeGame(): void {
  if (!paused) return;
  paused = false;
  ui.hidePause();
  running = true;
  // 멈춰 있던 동안의 시간이 한꺼번에 흐르지 않도록 기준을 다시 잡는다
  last = performance.now();
}

/** 중도 포기 — 기록은 남기지 않는다 */
function giveUp(): void {
  paused = false;
  running = false;
  ui.hidePause();
  ui.setPauseAvailable(false);
  engine.phase = 'over';
  ui.showTitle();
}

function bind(id: string, fn: () => void): void {
  document.getElementById(id)?.addEventListener('click', () => {
    sfx.unlock();
    fn();
  });
}

bind('btn-chance', () => {
  // 지우기를 준비 중이었다면 취소하고 섞는다
  if (engine.eraseArmed) ui.setEraseArmed(engine.toggleErase());
  engine.useChance();
});
bind('btn-erase', () => {
  ui.setEraseArmed(engine.toggleErase());
});
bind('btn-gameover-ok', () => {
  ui.hideGameOver();
  if (pendingResult) {
    ui.showResult(pendingResult.result, pendingResult.isNewBest);
    pendingResult = null;
  }
});
bind('btn-pause', pauseGame);
bind('btn-resume', resumeGame);
bind('btn-give-up', giveUp);
bind('btn-start', startGame);
bind('btn-retry', startGame);
bind('btn-home', () => ui.showTitle());
bind('btn-records', () => ui.showRecords());
bind('btn-records-close', () => ui.hideRecords());
bind('btn-records-clear', () => {
  clearRecords();
  ui.setBest(0);
  ui.showRecords();
});
bind('btn-sound', () => {
  const on = sfx.toggle();
  const btn = document.getElementById('btn-sound');
  if (btn) btn.textContent = on ? '🔊 소리 켬' : '🔇 소리 끔';
});

// ------------------------------------------------------------------ 보드 크기

const sizeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#size-row .size-btn'),
);

/**
 * 보드 크기를 바꾼다.
 *
 * 기록은 크기마다 따로 쌓이므로 BEST 표시도 함께 갈아준다.
 * 타이틀 뒤로 비치는 보드도 새 크기로 다시 깔아 고른 결과가 바로 보이게 한다.
 */
function applyBoardSize(size: BoardSize): void {
  setBoardSize(size);
  setSavedBoardSize(size);

  for (const btn of sizeButtons) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === size));
  }

  engine.reset();
  layout(); // 칸 크기가 바뀌었으니 캔버스와 젬 캐시를 다시 만든다
  ui.setBest(getBest());
  ui.setBoardSize(size);
}

for (const btn of sizeButtons) {
  btn.addEventListener('click', () => {
    const size = BOARD_SIZES.find((s) => s === Number(btn.dataset.size));
    if (!size || size === getBoardSize()) return;
    applyBoardSize(size);
    sfx.swap();
  });
}
bind('btn-vibrate', () => {
  const on = haptics.toggle();
  const btn = document.getElementById('btn-vibrate');
  if (btn) btn.textContent = on ? '📳 진동 켬' : '📴 진동 끔';
});

// 다른 앱으로 나가거나 화면이 꺼지면 알아서 멈춘다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

attachPointer(ui.canvas, engine, renderer, () => sfx.swap());

// 보드를 만지는 것도 사용자 제스처다. iOS에서 소리가 잠겨 있으면 여기서 풀린다.
ui.canvas.addEventListener('pointerdown', () => sfx.unlock());

// iOS 사파리의 핀치 확대 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------------ 시작

applyBoardSize(getSavedBoardSize());
ui.setScore(0);
ui.setTime(60);
ui.setChances(0); // 타이틀에서는 비활성
ui.setErases(0);
ui.showTitle();

const soundBtn = document.getElementById('btn-sound');
if (soundBtn) soundBtn.textContent = sfx.enabled ? '🔊 소리 켬' : '🔇 소리 끔';

const vibrateBtn = document.getElementById('btn-vibrate') as HTMLButtonElement | null;
if (vibrateBtn) {
  if (!haptics.supported) {
    // 아이폰 사파리는 Vibration API 자체가 없다
    vibrateBtn.disabled = true;
    vibrateBtn.textContent = '📴 진동 미지원';
  } else {
    vibrateBtn.textContent = haptics.enabled ? '📳 진동 켬' : '📴 진동 끔';
  }
}

layout();
requestAnimationFrame(() => layout());
requestAnimationFrame(frame);

// ?autostart 로 열면 카운트다운 없이 바로 시작한다(스크린샷·디버그용)
const params = new URLSearchParams(location.search);

// ?size=8 — 저장된 값 대신 이 크기로 연다
const askedSize = BOARD_SIZES.find((s) => s === Number(params.get('size')));
if (askedSize) applyBoardSize(askedSize);

if (params.has('autostart')) {
  ui.hideAll();
  effects.clear();
  engine.start();
  ui.setChances(engine.chances);
  ui.setErases(engine.erases);
  ui.setTime(engine.timeLeft);
  ui.setPauseAvailable(true);
  running = true;
  last = performance.now();
}

// ?fever 는 피버를 즉시 켠다(연출 확인용)
if (params.has('fever')) {
  engine.feverLeft = 8;
  ui.setFever(true);
  ui.setFeverGauge(1);
}

// ?combo=N 은 콤보 배지만 띄운다(레이아웃 확인용)
const comboDemo = params.get('combo');
if (comboDemo) ui.showCombo(Number(comboDemo) || 5);

// ?gameover 는 게임 오버 모달만 띄운다(레이아웃 확인용)
if (params.has('gameover')) {
  pendingResult = {
    result: {
      score: 24680,
      maxChain: 6,
      maxCombo: 11,
      biggestMatch: 5,
      survived: 78.3,
      earnedTime: 18.3,
    },
    isNewBest: true,
  };
  ui.showGameOver();
}

// ?result 는 결과 화면만 띄운다(레이아웃 확인용)
if (params.has('result')) {
  ui.showResult(
    {
      score: 12345,
      maxChain: 4,
      maxCombo: 9,
      biggestMatch: 5,
      survived: 78.3,
      earnedTime: 18.3,
    },
    true,
  );
}

// ?bot 을 붙이면 알아서 둔다. 연출 확인용 데모 모드.
if (params.has('bot')) {
  window.setInterval(() => {
    if (!running || engine.phase !== 'idle') return;
    // 가끔 찬스도 써본다
    if (engine.canUseChance && Math.random() < 0.2) {
      engine.useChance();
      return;
    }
    const move = findHint(engine.grid);
    if (move) engine.trySwap(move[0], move[1]);
  }, 260);
}

// 오프라인 실행을 위한 서비스 워커 (개발 중에는 캐시가 방해되므로 제외)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* file:// 등 등록이 불가능한 환경 — 게임 자체에는 영향 없다 */
    });
  });
}
