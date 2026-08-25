/**
 * 구경 모드의 손가락 커서.
 *
 * 봇이 두는 걸 보면 젬이 저 혼자 움직이는 것처럼 보인다. 누가 만지고 있는지
 * 보여야 "사람이 하는 걸 구경한다"는 느낌이 나므로, 실제로 손이 돌아다니며
 * 젬을 짚고 끌어당기는 모습을 그린다.
 *
 * 그림은 캔버스 안(보드와 같은 좌표계)에 그린다. 그래야 화면이 흔들리거나
 * 줌 펀치가 들어가도 손과 젬이 따로 놀지 않는다.
 */

/** 손 그림 색 — 젬(원숭이)과 같은 계열이라 판 위에서 겉돌지 않는다 */
const SKIN_LIGHT = '#ffe7cb';
const SKIN_BASE = '#f0bc8d';
const SKIN_DARK = '#a8703f';
const OUTLINE = 'rgba(48, 24, 8, 0.62)';

/** 끄는 궤적 색 */
const TRAIL = 'rgba(150, 230, 255, 0.42)';

/** 손이 기울어진 각도(라디안) — 주먹이 오른쪽 아래로 간다 */
const TILT = -0.3;

/** 페이드 인/아웃에 걸리는 시간(ms) */
const FADE_MS = 160;

/** 누르고 떼는 데 걸리는 시간(ms) */
const PRESS_MS = 90;
const RELEASE_MS = 120;

/** 파문이 사라지는 데 걸리는 시간(ms) */
const RIPPLE_MS = 420;

const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

type Step =
  | { kind: 'move'; x: number; y: number; ms: number }
  | { kind: 'press'; down: boolean; ms: number };

export class Hand {
  /** 캔버스 로컬 좌표(px). 손끝이 여기에 온다. */
  private x = 0;
  private y = 0;

  private fromX = 0;
  private fromY = 0;

  /** 눌린 정도 0~1 */
  private press = 0;
  private pressFrom = 0;

  /** 누르기 시작한 자리 — 여기서 지금 자리까지 궤적을 그린다 */
  private grabX = 0;
  private grabY = 0;
  private grabbing = false;

  /** 탭 파문 (1에서 0으로 줄어든다) */
  private ripple = 0;

  /**
   * 판 가장자리에서 손이 밖으로 삐져나가지 않도록 뒤집어 그린다.
   * 짚고 있는 동안에는 값을 붙들어 둔다 — 끌고 가다 갑자기 손이
   * 홱 뒤집히면 보기 흉하다.
   */
  private flipX = false;
  private flipY = false;

  private alpha = 0;
  private wantAlpha = 0;

  private queue: Step[] = [];
  private step: Step | null = null;
  private t = 0;

  /** 대기 중 살짝 떠다니게 하는 내부 시계(ms) */
  private clock = 0;

  /** 손이 화면에 남아 있는가 — 프레임 루프가 계속 그려야 할지 판단한다 */
  get busy(): boolean {
    return this.alpha > 0.01 || this.wantAlpha > 0;
  }

  /** 아무 데나 손을 얹어 둔다 — 판이 시작될 때 손이 이미 있어야 자연스럽다 */
  appear(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.queue = [];
    this.step = null;
    this.press = 0;
    this.grabbing = false;
    this.wantAlpha = 1;
  }

  /** 그 자리로 손을 옮겨 짚는다 */
  reach(x: number, y: number, travelMs: number): void {
    this.wantAlpha = 1;
    // 손이 처음 나타날 때는 목표 옆에서 스르르 들어오게 한다
    if (this.alpha <= 0.01) {
      this.x = x + (this.flipX ? -34 : 34);
      this.y = y + (this.flipY ? -46 : 46);
    }
    // 손이 빠른 실력일수록 짚는 동작도 짧아야 한다.
    // 누르다 마는 사이에 다음 동작이 오면 짚은 티가 안 난다.
    const press = Math.max(40, Math.min(PRESS_MS, travelMs * 0.4));
    this.run([
      { kind: 'move', x, y, ms: Math.max(50, travelMs - press) },
      { kind: 'press', down: true, ms: press },
    ]);
  }

  /** 짚은 채로 끌고 가서 놓는다 */
  drag(x: number, y: number, ms: number): void {
    this.wantAlpha = 1;
    this.run([
      { kind: 'move', x, y, ms: Math.max(70, ms) },
      { kind: 'press', down: false, ms: RELEASE_MS },
    ]);
  }

  /** 제자리에서 손을 뗀다(탭) */
  lift(): void {
    this.run([{ kind: 'press', down: false, ms: RELEASE_MS }]);
  }

  /** 손을 치운다 */
  park(): void {
    this.queue = [];
    this.step = null;
    this.press = 0;
    this.grabbing = false;
    this.wantAlpha = 0;
  }

  /** 흔적도 없이 지운다(모드를 빠져나갈 때) */
  reset(): void {
    this.park();
    this.alpha = 0;
    this.ripple = 0;
  }

  update(dt: number): void {
    this.clock += dt;

    const fade = dt / FADE_MS;
    this.alpha =
      this.wantAlpha > this.alpha
        ? Math.min(this.wantAlpha, this.alpha + fade)
        : Math.max(this.wantAlpha, this.alpha - fade);

    if (this.ripple > 0) this.ripple = Math.max(0, this.ripple - dt / RIPPLE_MS);

    // 한 프레임에 여러 동작이 끝날 수 있다(짧은 누르기 등)
    let budget = dt;
    let guard = 0;
    while (budget > 0 && guard++ < 8) {
      if (!this.step) {
        const next = this.queue.shift();
        if (!next) break;
        this.step = next;
        this.t = 0;
        this.begin(next);
      }

      const dur = Math.max(1, this.step.ms);
      const used = Math.min(budget, dur - this.t);
      this.t += used;
      budget -= used;
      this.apply(this.step, Math.min(1, this.t / dur));

      if (this.t >= dur) this.step = null;
      else break;
    }
  }

  /** 새 명령이 오면 하던 건 버린다 — 봇의 박자를 그대로 따라간다 */
  private run(steps: Step[]): void {
    this.queue = steps;
    this.step = null;
  }

  private begin(step: Step): void {
    if (step.kind === 'move') {
      this.fromX = this.x;
      this.fromY = this.y;
      return;
    }

    this.pressFrom = this.press;
    if (step.down) {
      this.grabX = this.x;
      this.grabY = this.y;
      this.grabbing = true;
      this.ripple = 1;
    }
  }

  private apply(step: Step, p: number): void {
    if (step.kind === 'move') {
      const e = easeInOutCubic(p);
      this.x = this.fromX + (step.x - this.fromX) * e;
      this.y = this.fromY + (step.y - this.fromY) * e;
      return;
    }

    const target = step.down ? 1 : 0;
    this.press = this.pressFrom + (target - this.pressFrom) * p;
    if (!step.down && p >= 1) this.grabbing = false;
  }

  // ------------------------------------------------------------ 그리기

  /**
   * @param boardSize 판 한 변 길이(px). 오른쪽 끝에서는 손을 뒤집어
   *   주먹이 판 밖으로 나가지 않게 한다.
   */
  draw(ctx: CanvasRenderingContext2D, cell: number, boardSize: number): void {
    if (this.alpha <= 0.01) return;

    if (!this.grabbing) {
      this.flipX = this.x > boardSize * 0.62;
      this.flipY = this.y > boardSize * 0.6;
    }

    // 다음 수를 기다리는 동안에도 손은 가만히 굳어 있지 않는다.
    // 멈춰 있으면 판에 그려 넣은 그림처럼 보여서 눈에서 놓치게 된다.
    const resting = !this.step && this.queue.length === 0 && !this.grabbing;
    const bob = resting ? Math.sin(this.clock / 540) * cell * 0.06 : 0;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(0, bob);

    if (this.grabbing) this.drawTrail(ctx, cell);
    if (this.ripple > 0) this.drawRipple(ctx, cell);
    this.drawTarget(ctx, cell);
    this.drawHand(ctx, cell * 1.34);

    ctx.restore();
  }

  /** 짚은 자리에서 지금 자리까지 — 끌고 있다는 걸 보여준다 */
  private drawTrail(ctx: CanvasRenderingContext2D, cell: number): void {
    const dx = this.x - this.grabX;
    const dy = this.y - this.grabY;
    if (dx * dx + dy * dy < 16) return;

    ctx.save();
    ctx.strokeStyle = TRAIL;
    ctx.lineWidth = cell * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.grabX, this.grabY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 손끝에 늘 깔아두는 표적.
   *
   * 손 그림만으로는 어느 칸을 짚었는지 헷갈리고, 판이 화려하게 터지는
   * 동안에는 손 자체를 놓치기 쉽다. 밝은 고리 하나면 눈이 따라간다.
   */
  private drawTarget(ctx: CanvasRenderingContext2D, cell: number): void {
    ctx.save();
    ctx.globalAlpha = this.alpha * (0.35 + this.press * 0.45);
    ctx.fillStyle = 'rgba(190, 245, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, cell * (0.34 - this.press * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = this.alpha * (0.6 + this.press * 0.4);
    ctx.strokeStyle = '#d8f7ff';
    ctx.lineWidth = cell * 0.055;
    ctx.stroke();
    ctx.restore();
  }

  /** 짚는 순간 퍼지는 파문 */
  private drawRipple(ctx: CanvasRenderingContext2D, cell: number): void {
    const p = 1 - this.ripple;
    ctx.save();
    ctx.globalAlpha = this.alpha * this.ripple * 0.75;
    ctx.strokeStyle = '#bff2ff';
    ctx.lineWidth = cell * (0.09 - p * 0.05);
    ctx.beginPath();
    ctx.arc(this.grabX, this.grabY, cell * (0.16 + p * 0.42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 손 그림.
   *
   * 손가락·주먹·엄지를 한 경로에 담아 **먼저 굵게 긋고 그 위에 채운다.**
   * 그러면 바깥쪽만 테두리로 남고 겹친 자리의 선은 채우기에 덮여 사라진다.
   * 도형마다 따로 테두리를 그리면 손 한가운데에 선이 지나간다.
   */
  private drawHand(ctx: CanvasRenderingContext2D, s: number): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    // 아래쪽 줄에서는 위에서 내려오는 손, 오른쪽 끝에서는 왼쪽에서 오는 손이 된다
    ctx.scale(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
    ctx.rotate(TILT);

    // 누르면 살짝 움츠러든다
    const k = 1 - this.press * 0.1;
    ctx.scale(k, k);

    // 손가락·주먹·엄지를 한 경로에 담는다.
    // Path2D 대신 컨텍스트 경로를 쓴다 — 판 배경에서 이미 쓰고 있는 API 라
    // 기기마다 되고 안 되고가 갈릴 일이 없다.
    ctx.beginPath();
    // 검지 — 손끝이 원점이다. 길어야 어디를 짚었는지 또렷하다.
    ctx.roundRect(-0.12 * s, 0, 0.24 * s, 0.8 * s, 0.12 * s);
    // 주먹
    ctx.roundRect(-0.22 * s, 0.56 * s, 0.72 * s, 0.58 * s, 0.24 * s);
    // 엄지
    ctx.roundRect(-0.4 * s, 0.68 * s, 0.3 * s, 0.21 * s, 0.105 * s);

    // 판이 터지는 와중에도 손이 묻히지 않도록 어두운 후광을 깐다
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = s * 0.3;
    ctx.shadowOffsetY = s * 0.06;

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = s * 0.1;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.stroke(); // 두 번 그어 그림자를 짙게 — 어떤 배경에서도 떠 보인다

    ctx.shadowColor = 'transparent';

    const grad = ctx.createLinearGradient(-0.3 * s, -0.1 * s, 0.6 * s, 1.2 * s);
    grad.addColorStop(0, SKIN_LIGHT);
    grad.addColorStop(0.5, SKIN_BASE);
    grad.addColorStop(1, SKIN_DARK);
    ctx.fillStyle = grad;
    ctx.fill();

    // 손톱 — 이게 있어야 손끝이 어디인지 한눈에 보인다
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0.14 * s, 0.07 * s, 0.1 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
