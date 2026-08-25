import { MAX_TIME } from '../game/config';
import type { GameResult } from '../game/types';
import { getRecords } from '../game/storage';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el as T;
}

/** HUD와 오버레이 화면들을 다루는 얇은 래퍼 */
export class UI {
  readonly canvas = must<HTMLCanvasElement>('board');
  readonly stage = must<HTMLElement>('stage');

  private timeFill = must('time-fill');
  private timeText = must('time-text');
  private scoreEl = must('score');
  private bestEl = must('best');
  private chainBadge = must('chain-badge');
  private streakText = must('streak-text');
  private comboBadge = must('combo-badge');
  private chanceBtn = must<HTMLButtonElement>('btn-chance');
  private chanceCount = must('chance-count');
  private eraseBtn = must<HTMLButtonElement>('btn-erase');
  private eraseCount = must('erase-count');

  private titleScreen = must('title-screen');
  private resultScreen = must('result-screen');
  private recordsScreen = must('records-screen');
  private helpScreen = must('help-screen');
  private pauseScreen = must('pause-screen');
  private gameOverScreen = must('gameover-screen');
  private watchScreen = must('watch-screen');
  private watchTag = must('watch-tag');
  private pauseBtn = must<HTMLButtonElement>('btn-pause');
  private countdownEl = must('countdown');

  private feverFill = must('fever-fill');
  private flashEl = must('flash');
  private feverBanner = must('fever-banner');
  private recordsSize = must('records-size');

  private chainTimer = 0;
  private gainTimer = 0;

  /** 피버 게이지 갱신 (0~1) */
  setFeverGauge(ratio: number): void {
    this.feverFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  setFever(on: boolean): void {
    document.body.classList.toggle('fever', on);
    if (on) {
      this.feverBanner.textContent = 'FEVER!';
      this.feverBanner.classList.remove('show');
      void this.feverBanner.offsetWidth; // 애니메이션 재시작 트릭
      this.feverBanner.classList.add('show');
    }
  }

  /**
   * 화면 전체를 한 번 번쩍인다.
   * transition 을 껐다 켜서 즉시 밝아졌다가 부드럽게 사라지게 한다.
   */
  flashScreen(strength: number): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(Math.min(0.85, strength));
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity 220ms ease-out';
      this.flashEl.style.opacity = '0';
    });
  }

  // ------------------------------------------------------------ HUD

  setScore(score: number, bump = false): void {
    this.scoreEl.textContent = score.toLocaleString('ko-KR');
    if (bump) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth; // 애니메이션 재시작 트릭
      this.scoreEl.classList.add('bump');
    }
  }

  setBest(best: number): void {
    this.bestEl.textContent = best.toLocaleString('ko-KR');
  }

  /** 기록은 보드 크기별로 따로 쌓이므로 어느 판의 기록인지 밝혀준다 */
  setBoardSize(size: number): void {
    this.recordsSize.textContent = `${size} × ${size}`;
  }

  setTime(seconds: number): void {
    this.timeText.textContent = seconds.toFixed(1);
    const ratio = Math.max(0, Math.min(1, seconds / MAX_TIME));
    this.timeFill.style.width = `${ratio * 100}%`;

    this.timeFill.classList.toggle('danger', seconds <= 10);
    this.timeFill.classList.toggle('warn', seconds > 10 && seconds <= 20);
  }

  /** 시간을 벌었을 때 숫자를 잠깐 초록으로 */
  flashTimeGain(): void {
    this.timeText.classList.add('gain');
    window.clearTimeout(this.gainTimer);
    this.gainTimer = window.setTimeout(() => {
      this.timeText.classList.remove('gain');
    }, 320);
  }

  showChain(chain: number): void {
    this.chainBadge.textContent = `${chain} CHAIN!`;
    this.chainBadge.classList.add('show');
    window.clearTimeout(this.chainTimer);
    this.chainTimer = window.setTimeout(() => {
      this.chainBadge.classList.remove('show');
    }, 900);
  }

  /** 판 한가운데에 "N COMBO" 를 꽂는다. 셀수록 색이 뜨거워진다. */
  showCombo(combo: number): void {
    const level = combo >= 7 ? 3 : combo >= 5 ? 2 : 1;
    this.comboBadge.textContent = `${combo} COMBO`;
    this.comboBadge.classList.remove('show', 'lv1', 'lv2', 'lv3');
    void this.comboBadge.offsetWidth; // 애니메이션 재시작 트릭
    this.comboBadge.classList.add('show', `lv${level}`);
  }

  /**
   * 남은 찬스 표시.
   * @param gained 새로 얻은 경우 버튼을 한 번 반짝인다
   */
  setChances(left: number, gained = false): void {
    this.chanceCount.textContent = `${left}`;
    this.chanceBtn.disabled = left <= 0;
    if (gained && left > 0) {
      this.chanceBtn.classList.remove('gained');
      void this.chanceBtn.offsetWidth; // 애니메이션 재시작 트릭
      this.chanceBtn.classList.add('gained');
    }
  }

  /** 남은 지우기 표시 */
  setErases(left: number, gained = false): void {
    this.eraseCount.textContent = `${left}`;
    this.eraseBtn.disabled = left <= 0;
    if (gained && left > 0) {
      this.eraseBtn.classList.remove('gained');
      void this.eraseBtn.offsetWidth;
      this.eraseBtn.classList.add('gained');
    }
  }

  /** 지울 젬을 고르는 중임을 알린다 */
  setEraseArmed(on: boolean): void {
    this.eraseBtn.classList.toggle('armed', on);
    if (on) this.showToast('🧹 지울 동물을 고르세요');
    else this.streakText.textContent = '';
  }

  showToast(text: string): void {
    this.streakText.textContent = text;
  }

  // ------------------------------------------------------------ 화면 전환

  showTitle(): void {
    this.titleScreen.classList.remove('hidden');
    this.resultScreen.classList.add('hidden');
    this.recordsScreen.classList.add('hidden');
    this.helpScreen.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.watchScreen.classList.add('hidden');
    this.setPauseAvailable(false);
  }

  hideAll(): void {
    this.titleScreen.classList.add('hidden');
    this.resultScreen.classList.add('hidden');
    this.recordsScreen.classList.add('hidden');
    this.helpScreen.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.watchScreen.classList.add('hidden');
  }

  showWatch(): void {
    this.watchScreen.classList.remove('hidden');
  }

  hideWatch(): void {
    this.watchScreen.classList.add('hidden');
  }

  /**
   * 구경 중임을 화면에 알린다.
   * null 이면 사람이 직접 하는 중 — 표시를 지우고 손도 다시 풀어준다.
   */
  setWatching(label: string | null): void {
    document.body.classList.toggle('watching', label !== null);
    this.watchTag.classList.toggle('hidden', label === null);
    if (label) this.watchTag.textContent = `👀 구경 · ${label}`;
  }

  showHelp(): void {
    this.helpScreen.classList.remove('hidden');
  }

  hideHelp(): void {
    this.helpScreen.classList.add('hidden');
  }

  /** 끝난 판을 잠깐 보여주는 모달 */
  showGameOver(): void {
    this.gameOverScreen.classList.remove('hidden');
  }

  hideGameOver(): void {
    this.gameOverScreen.classList.add('hidden');
  }

  /** 게임이 돌고 있을 때만 일시정지 버튼을 쓸 수 있다 */
  setPauseAvailable(on: boolean): void {
    this.pauseBtn.disabled = !on;
  }

  showPause(score: number): void {
    must('pause-score').textContent = score.toLocaleString('ko-KR');
    this.pauseScreen.classList.remove('hidden');
  }

  hidePause(): void {
    this.pauseScreen.classList.add('hidden');
  }

  /**
   * @param watchLabel 구경 모드였다면 실력 이름 — 기록에 남지 않았음을 알린다
   */
  showResult(result: GameResult, isNewBest: boolean, watchLabel: string | null = null): void {
    must('final-score').textContent = result.score.toLocaleString('ko-KR');
    must('final-combo').textContent = `${result.maxCombo}`;
    must('final-chain').textContent = `${result.maxChain}`;
    must('final-biggest').textContent = `${result.biggestMatch}`;
    must('final-time').textContent = `${result.survived.toFixed(1)}s`;
    must('final-earned').textContent = `+${result.earnedTime.toFixed(1)}s`;
    must('new-record').classList.toggle('hidden', !isNewBest);

    const watchBadge = must('result-watch');
    watchBadge.classList.toggle('hidden', !watchLabel);
    if (watchLabel) watchBadge.textContent = `👀 구경 · ${watchLabel} — 기록에 남지 않습니다`;
    must('result-title').textContent = watchLabel ? '구경 끝' : 'TIME UP';
    must('btn-retry').textContent = watchLabel ? '다시 구경하기' : '다시 하기';

    this.resultScreen.classList.remove('hidden');
  }

  showRecords(): void {
    const list = must<HTMLOListElement>('record-list');
    const records = getRecords();
    if (records.length === 0) {
      list.innerHTML = '<li class="empty">아직 기록이 없습니다</li>';
    } else {
      list.innerHTML = records
        .map((r) => {
          const date = new Date(r.at);
          const when = `${date.getMonth() + 1}/${date.getDate()}`;
          return `<li><b>${r.score.toLocaleString('ko-KR')}</b><span class="meta">${r.maxChain}체인 · ${when}</span></li>`;
        })
        .join('');
    }
    this.recordsScreen.classList.remove('hidden');
  }

  hideRecords(): void {
    this.recordsScreen.classList.add('hidden');
  }

  /** 3 → 2 → 1 → GO! 카운트다운 후 콜백 */
  countdown(onTick: (label: string) => void, onDone: () => void): void {
    const labels = ['3', '2', '1', 'GO!'];
    let i = 0;

    const step = (): void => {
      if (i >= labels.length) {
        this.countdownEl.classList.add('hidden');
        onDone();
        return;
      }
      const label = labels[i++];
      onTick(label);
      this.countdownEl.classList.remove('hidden');
      this.countdownEl.innerHTML = `<span>${label}</span>`;
      window.setTimeout(step, 700);
    };

    step();
  }
}
