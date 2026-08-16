import { COMBO_MIN_SHOW } from './config';
import { getSoundEnabled, setSoundEnabled } from './storage';

/**
 * 오디오 파일 없이 WebAudio로 즉석 합성하는 효과음.
 *
 * "팡" 하는 소리는 세 겹으로 만든다.
 *   1) 밴드패스 노이즈  — 터지는 질감
 *   2) 하강하는 사인파  — 몸통(붐)
 *   3) 짧은 배음        — 경쾌함
 * 매치가 클수록 노이즈가 두꺼워지고 저음이 깊어지며,
 * 연쇄가 깊을수록 전체 음정이 반음씩 올라간다.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = getSoundEnabled();

  /**
   * iOS는 사용자 제스처 안에서 한 번 깨워줘야 소리가 난다.
   * 버튼 클릭과 보드 첫 터치에서 호출한다.
   */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoiseBuffer(this.ctx);

      // 오디오 세션 종류 선택. Safari 16.4+ 에만 있다.
      //
      //   playback  — 무음 스위치 무시. 대신 재생 중이던 음악을 끊는다
      //   ambient   — 음악과 섞인다. 대신 무음 스위치가 켜지면 아무 소리도 안 난다
      //   transient — 짧은 알림음용. 음악을 끊지 않고 잠깐 줄였다가 되돌리며,
      //               재생 카테고리라 무음 스위치에 막히지 않는다
      //
      // 게임 효과음은 짧게 튀는 소리라 transient 가 가장 알맞다.
      // 지원하지 않는 브라우저에서는 조용히 무시된다.
      const session = (
        navigator as unknown as { audioSession?: { type: string } }
      ).audioSession;
      if (session) {
        try {
          session.type = 'transient';
        } catch {
          /* 지원하지 않는 브라우저 — 무시 */
        }
      }

      // 길이 1짜리 무음 버퍼를 재생해 오디오 세션을 실제로 연다
      const primer = this.ctx.createBufferSource();
      primer.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      primer.connect(this.ctx.destination);
      primer.start(0);
    }

    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    setSoundEnabled(this.enabled);
    if (this.enabled) {
      this.unlock();
      // 켠 즉시 들려줘서 소리가 나오는지 바로 확인할 수 있게 한다
      this.pop(1, 4);
    }
    return this.enabled;
  }

  // ------------------------------------------------------------ 내부

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * 재생 가능한 컨텍스트를 돌려준다.
   * suspended 상태라면 재개를 시도하되 재생 자체는 막지 않는다.
   * (엄격하게 막으면 iOS에서 첫 몇 개 소리가 통째로 사라진다)
   */
  private ready(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private envelope(ctx: AudioContext, gain: number, duration: number): GainNode {
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    return amp;
  }

  /** 밴드패스를 통과시킨 노이즈 — 터지는 질감 */
  private noise(duration: number, gain: number, freq: number, q = 1): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuf || !this.master) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, freq * 0.35),
      ctx.currentTime + duration,
    );
    filter.Q.value = q;

    const amp = this.envelope(ctx, gain, duration);
    src.connect(filter).connect(amp).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  /** 아래로 떨어지는 저음 — 폭발의 몸통 */
  private boom(freq: number, duration: number, gain: number): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq * 0.35),
      ctx.currentTime + duration,
    );

    const amp = this.envelope(ctx, gain, duration);
    osc.connect(amp).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        ctx.currentTime + duration,
      );
    }

    const amp = this.envelope(ctx, gain, duration);
    osc.connect(amp).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  // ------------------------------------------------------------ 효과음

  /**
   * 젬이 터지는 소리.
   * @param chain 연쇄 단계(1부터) — 깊을수록 음정이 올라간다
   * @param size  매치 크기 — 클수록 두껍고 묵직해진다
   */
  pop(chain: number, size: number): void {
    const pitch = Math.pow(2, Math.min(chain - 1, 10) / 12);
    const big = Math.min(Math.max(size - 3, 0), 3); // 0(3매치) ~ 3(6매치 이상)

    this.noise(0.09 + big * 0.035, 0.3 + big * 0.12, (1900 - big * 380) * pitch, 1.1);
    this.boom(160 * pitch, 0.17 + big * 0.07, 0.2 + big * 0.09);
    this.tone(640 * pitch, 0.11, 'triangle', 0.12 + big * 0.03);

    if (big >= 2) this.tone(980 * pitch, 0.2, 'sine', 0.11);
    if (big >= 3) this.tone(1320 * pitch, 0.26, 'sine', 0.09);
  }

  /** 주변까지 함께 날아가는 폭발 */
  blast(chain: number): void {
    const pitch = Math.pow(2, Math.min(chain - 1, 8) / 24);
    this.noise(0.3, 0.34, 620 * pitch, 0.7);
    this.boom(95 * pitch, 0.34, 0.32);
    window.setTimeout(() => this.noise(0.18, 0.16, 1400 * pitch, 1.4), 45);
  }

  /** 찬스로 보드를 다시 섞을 때 — 반짝이며 올라가는 소리 */
  chance(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.17, 'triangle', 0.12), i * 55);
    });
    this.noise(0.34, 0.14, 2600, 2.4);
  }

  /** 폭탄 — 가장 크고 낮게 */
  bomb(): void {
    this.noise(0.42, 0.42, 420, 0.6);
    this.boom(70, 0.5, 0.4);
    window.setTimeout(() => this.noise(0.26, 0.22, 950, 1.0), 60);
    window.setTimeout(() => this.boom(55, 0.4, 0.22), 120);
  }

  /** 피버 진입 — 치솟는 팡파르 */
  feverStart(): void {
    const notes = [523, 659, 784, 1046, 1319];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.24, 'triangle', 0.15), i * 60);
    });
    this.boom(110, 0.5, 0.3);
    this.noise(0.4, 0.2, 1800, 1.2);
  }

  /** 피버 종료 — 힘이 빠지는 하강음 */
  feverEnd(): void {
    const notes = [880, 660, 523];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.2, 'sine', 0.1), i * 80);
    });
  }

  /** 지우기 — 한 종류를 쓸어 담는 소리 */
  erase(): void {
    this.noise(0.45, 0.26, 900, 0.9);
    const notes = [392, 523, 659, 880];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.16, 'triangle', 0.12), i * 50);
    });
    this.boom(120, 0.35, 0.22);
  }

  /**
   * 콤보 알림음.
   * 콤보가 쌓일수록 커지고 높아지되, 세 단계 위부터는 최대치로 고정된다.
   */
  combo(n: number): void {
    const step = Math.min(Math.max(n - COMBO_MIN_SHOW, 0), 3);
    const pitch = Math.pow(2, (step * 2) / 12);
    const gain = 0.13 + step * 0.055;

    this.tone(660 * pitch, 0.18, 'triangle', gain);
    window.setTimeout(() => this.tone(990 * pitch, 0.2, 'sine', gain * 0.85), 45);
    if (step >= 2) this.boom(150, 0.3, 0.18);
    if (step >= 3) {
      window.setTimeout(() => this.tone(1320 * pitch, 0.24, 'sine', gain * 0.7), 95);
    }
  }

  swap(): void {
    this.tone(340, 0.06, 'sine', 0.09);
  }

  fail(): void {
    this.tone(190, 0.12, 'sawtooth', 0.07, 120);
  }

  /** 5매치 이상으로 시간을 크게 벌었을 때 얹는 팡파르 */
  bonus(): void {
    this.tone(880, 0.1, 'triangle', 0.12);
    window.setTimeout(() => this.tone(1320, 0.16, 'sine', 0.11), 70);
  }

  /** 남은 시간 경고 */
  tick(urgent: boolean): void {
    this.tone(urgent ? 1180 : 880, 0.06, 'square', urgent ? 0.11 : 0.07);
  }

  countdown(final: boolean): void {
    if (final) {
      this.tone(880, 0.28, 'triangle', 0.16);
      this.boom(220, 0.3, 0.14);
    } else {
      this.tone(520, 0.12, 'square', 0.1);
    }
  }

  gameOver(): void {
    const notes = [660, 550, 440, 330];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.3, 'triangle', 0.14), i * 120);
    });
    window.setTimeout(() => this.boom(120, 0.6, 0.2), 360);
  }
}

export const sfx = new Sfx();
