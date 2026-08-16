import { GEM_STYLES } from '../game/config';
import type { GemStyle } from '../game/config';

/**
 * 동물 얼굴 그리기.
 *
 * 얼굴 하나에는 그라디언트, 그림자, 눈·귀·볼터치까지 열 몇 번의 그리기가 들어간다.
 * 이걸 매 프레임 64번 반복하면 휴대폰이 뜨거워지므로, 종류별로 **한 번만**
 * 오프스크린 캔버스에 그려두고 매 프레임에는 복사만 한다.
 */

/**
 * 스프라이트 여백 배수 — 글로우·귀·폭탄 심지가 잘리지 않도록 셀보다 크게 잡는다.
 * 토끼 귀가 반지름의 1.7배까지, 폭탄 불꽃이 1.5배까지 올라간다.
 */
const PAD_RATIO = 1.62;

const cache = new Map<string, HTMLCanvasElement>();

/** 셀 크기나 화면 배율이 바뀌면 캐시를 버린다 */
export function clearGemCache(): void {
  cache.clear();
}

const CHEEK = 'rgba(255,120,150,0.55)';
const EAR_INNER = '#ff9db5';
const LINE = 'rgba(60,50,70,0.85)';

/** 몸통 — 세로로 살짝 긴 둥근 사각형 */
function bodyPath(ctx: CanvasRenderingContext2D, r: number): void {
  const w = r * 0.9;
  const h = r * 0.86;
  ctx.beginPath();
  ctx.roundRect(-w, -h, w * 2, h * 2, w * 0.66);
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** 몸통 뒤에 깔리는 귀 */
function drawEarsBehind(
  ctx: CanvasRenderingContext2D,
  style: GemStyle,
  r: number,
): void {
  ctx.fillStyle = style.base;

  switch (style.animal) {
    case 'rabbit': {
      // 위로 쭉 뻗은 긴 귀
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * r * 0.36, -r * 0.72);
        ctx.rotate(side * 0.16);
        ctx.fillStyle = style.base;
        ellipse(ctx, 0, -r * 0.42, r * 0.23, r * 0.55);
        ctx.fillStyle = EAR_INNER;
        ellipse(ctx, 0, -r * 0.42, r * 0.11, r * 0.36);
        ctx.restore();
      }
      break;
    }

    case 'frog': {
      // 머리 위로 볼록 솟은 눈두덩
      for (const side of [-1, 1]) {
        ctx.fillStyle = style.light;
        ellipse(ctx, side * r * 0.56, -r * 0.7, r * 0.36, r * 0.34);
        ctx.strokeStyle = style.dark;
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath();
        ctx.ellipse(side * r * 0.56, -r * 0.7, r * 0.36, r * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case 'dog': {
      // 옆으로 늘어진 귀
      for (const side of [-1, 1]) {
        ctx.save();
        // 아래로 축 늘어뜨려야 원숭이의 동그란 귀와 헷갈리지 않는다
        ctx.translate(side * r * 0.86, r * 0.16);
        ctx.rotate(side * 0.36);
        ctx.fillStyle = style.dark;
        ellipse(ctx, 0, 0, r * 0.33, r * 0.62);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ellipse(ctx, 0, -r * 0.04, r * 0.18, r * 0.36);
        ctx.restore();
      }
      break;
    }

    case 'pig': {
      // 앞으로 접힌 작은 세모 귀
      for (const side of [-1, 1]) {
        ctx.fillStyle = style.dark;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.28, -r * 0.82);
        ctx.lineTo(side * r * 0.72, -r * 0.98);
        ctx.lineTo(side * r * 0.66, -r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'cat': {
      // 뾰족한 세모 귀
      for (const side of [-1, 1]) {
        ctx.fillStyle = style.base;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.22, -r * 0.74);
        ctx.lineTo(side * r * 0.58, -r * 1.36);
        ctx.lineTo(side * r * 0.86, -r * 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = EAR_INNER;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.38, -r * 0.74);
        ctx.lineTo(side * r * 0.55, -r * 1.04);
        ctx.lineTo(side * r * 0.68, -r * 0.68);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'monkey': {
      // 양옆에 붙은 동그란 귀
      for (const side of [-1, 1]) {
        ctx.fillStyle = style.base;
        ellipse(ctx, side * r * 0.88, -r * 0.02, r * 0.3, r * 0.32);
        ctx.fillStyle = style.light;
        ellipse(ctx, side * r * 0.88, -r * 0.02, r * 0.17, r * 0.19);
      }
      break;
    }
  }
}

/** 눈 — 큰 검은 눈에 하이라이트 두 점 */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  rx: number,
  ry: number,
): void {
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#2e2838';
    ellipse(ctx, side * dx, dy, rx, ry);
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, side * dx - rx * 0.3, dy - ry * 0.35, rx * 0.35, ry * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ellipse(ctx, side * dx + rx * 0.32, dy + ry * 0.34, rx * 0.16, ry * 0.15);
  }
}

function drawCheeks(
  ctx: CanvasRenderingContext2D,
  r: number,
  dx: number,
  dy: number,
): void {
  ctx.fillStyle = CHEEK;
  for (const side of [-1, 1]) {
    ellipse(ctx, side * dx, dy, r * 0.19, r * 0.12);
  }
}

/** 동물별 얼굴 */
function drawFace(ctx: CanvasRenderingContext2D, style: GemStyle, r: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1, r * 0.07);

  switch (style.animal) {
    case 'rabbit': {
      drawEyes(ctx, r * 0.33, -r * 0.02, r * 0.14, r * 0.18);
      drawCheeks(ctx, r, r * 0.58, r * 0.26);
      // 작은 코와 Y자 입
      ctx.fillStyle = '#ff8fa8';
      ellipse(ctx, 0, r * 0.28, r * 0.09, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.34);
      ctx.lineTo(0, r * 0.44);
      ctx.moveTo(0, r * 0.44);
      ctx.lineTo(-r * 0.13, r * 0.52);
      ctx.moveTo(0, r * 0.44);
      ctx.lineTo(r * 0.13, r * 0.52);
      ctx.stroke();
      break;
    }

    case 'frog': {
      // 눈두덩 위에 올라앉은 눈
      drawEyes(ctx, r * 0.56, -r * 0.72, r * 0.16, r * 0.18);
      drawCheeks(ctx, r, r * 0.6, r * 0.22);
      // 활짝 웃는 입
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.14);
      ctx.quadraticCurveTo(0, r * 0.56, r * 0.42, r * 0.14);
      ctx.stroke();
      ctx.fillStyle = '#2e2838';
      ellipse(ctx, -r * 0.12, -r * 0.02, r * 0.05, r * 0.04);
      ellipse(ctx, r * 0.12, -r * 0.02, r * 0.05, r * 0.04);
      break;
    }

    case 'dog': {
      drawEyes(ctx, r * 0.31, -r * 0.06, r * 0.14, r * 0.17);
      drawCheeks(ctx, r, r * 0.55, r * 0.28);
      // 코와 웃는 입
      ctx.fillStyle = '#2e2838';
      ellipse(ctx, 0, r * 0.24, r * 0.13, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.32);
      ctx.lineTo(0, r * 0.42);
      ctx.moveTo(-r * 0.2, r * 0.4);
      ctx.quadraticCurveTo(0, r * 0.58, r * 0.2, r * 0.4);
      ctx.stroke();
      break;
    }

    case 'pig': {
      drawEyes(ctx, r * 0.34, -r * 0.14, r * 0.13, r * 0.16);
      drawCheeks(ctx, r, r * 0.6, r * 0.18);
      // 커다란 코
      ctx.fillStyle = style.light;
      ellipse(ctx, 0, r * 0.3, r * 0.3, r * 0.22);
      ctx.strokeStyle = 'rgba(150,60,90,0.5)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#b84a6d';
      ellipse(ctx, -r * 0.12, r * 0.3, r * 0.055, r * 0.08);
      ellipse(ctx, r * 0.12, r * 0.3, r * 0.055, r * 0.08);
      break;
    }

    case 'cat': {
      drawEyes(ctx, r * 0.33, -r * 0.04, r * 0.14, r * 0.18);
      drawCheeks(ctx, r, r * 0.6, r * 0.26);
      // 삼각 코 + w 입 + 수염
      ctx.fillStyle = '#ff8fa8';
      ctx.beginPath();
      ctx.moveTo(-r * 0.08, r * 0.24);
      ctx.lineTo(r * 0.08, r * 0.24);
      ctx.lineTo(0, r * 0.33);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-r * 0.18, r * 0.44);
      ctx.quadraticCurveTo(-r * 0.09, r * 0.52, 0, r * 0.38);
      ctx.quadraticCurveTo(r * 0.09, r * 0.52, r * 0.18, r * 0.44);
      ctx.stroke();

      ctx.lineWidth = Math.max(1, r * 0.045);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.42, r * 0.2);
        ctx.lineTo(side * r * 0.78, r * 0.12);
        ctx.moveTo(side * r * 0.42, r * 0.3);
        ctx.lineTo(side * r * 0.78, r * 0.34);
        ctx.stroke();
      }
      break;
    }

    case 'monkey': {
      // 밝은 얼굴판
      ctx.fillStyle = style.light;
      ellipse(ctx, 0, r * 0.06, r * 0.66, r * 0.6);
      drawEyes(ctx, r * 0.28, -r * 0.16, r * 0.13, r * 0.16);
      drawCheeks(ctx, r, r * 0.52, r * 0.24);
      // 콧구멍과 웃는 입
      ctx.fillStyle = '#8d5c2c';
      ellipse(ctx, -r * 0.09, r * 0.2, r * 0.045, r * 0.035);
      ellipse(ctx, r * 0.09, r * 0.2, r * 0.045, r * 0.035);
      ctx.strokeStyle = 'rgba(90,60,30,0.8)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, r * 0.36);
      ctx.quadraticCurveTo(0, r * 0.56, r * 0.22, r * 0.36);
      ctx.stroke();
      break;
    }
  }
}

/**
 * 폭탄 표식.
 *
 * 얼굴을 덮어버리면 무슨 동물인지 알 수 없어 매치에 쓸 수가 없다.
 * 그래서 얼굴은 손대지 않고 **심지에 불이 붙은 상태**로 표현한다.
 */
function drawBombMark(ctx: CanvasRenderingContext2D, r: number): void {
  // 몸통을 따라가는 붉은 경고 띠
  ctx.strokeStyle = 'rgba(255,72,72,0.95)';
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  bodyPath(ctx, r);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  bodyPath(ctx, r * 0.9);
  ctx.stroke();

  // 심지
  ctx.strokeStyle = '#c49a63';
  ctx.lineWidth = Math.max(2, r * 0.17);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.5, -r * 0.72);
  ctx.quadraticCurveTo(r * 0.98, -r * 0.92, r * 0.78, -r * 1.06);
  ctx.stroke();

  // 불꽃
  ctx.shadowColor = 'rgba(255,160,50,1)';
  ctx.shadowBlur = r * 0.7;
  ctx.fillStyle = '#ff5f1f';
  ellipse(ctx, r * 0.78, -r * 1.18, r * 0.28, r * 0.28);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffc93c';
  ellipse(ctx, r * 0.78, -r * 1.2, r * 0.18, r * 0.18);
  ctx.fillStyle = '#fffaf0';
  ellipse(ctx, r * 0.78, -r * 1.22, r * 0.09, r * 0.09);
}

/** 동물 한 종류를 오프스크린 캔버스에 그려 캐시한다 */
function buildSprite(
  kind: number,
  bomb: boolean,
  cell: number,
  dpr: number,
): HTMLCanvasElement {
  const style = GEM_STYLES[kind % GEM_STYLES.length];
  const side = Math.max(8, Math.round(cell * PAD_RATIO));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(side * dpr);
  canvas.height = Math.round(side * dpr);

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(side / 2, side / 2);

  const r = (cell / 2) * 0.84;

  // 바닥 그림자
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ellipse(ctx, 0, r * 0.9, r * 0.6, r * 0.18);
  ctx.restore();

  drawEarsBehind(ctx, style, r);

  // 몸통 — 외곽 글로우와 함께
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetY = r * 0.05;

  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, style.light);
  body.addColorStop(0.55, style.base);
  body.addColorStop(1, style.dark);
  bodyPath(ctx, r);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 아래쪽 그늘로 입체감
  ctx.save();
  bodyPath(ctx, r);
  ctx.clip();
  const depth = ctx.createRadialGradient(0, -r * 0.45, r * 0.1, 0, r * 0.3, r * 1.2);
  depth.addColorStop(0, 'rgba(255,255,255,0.5)');
  depth.addColorStop(0.5, 'rgba(255,255,255,0)');
  depth.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = depth;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  ctx.restore();

  // 테두리
  ctx.strokeStyle = style.dark;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, r * 0.07);
  bodyPath(ctx, r);
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawFace(ctx, style, r);

  if (bomb) drawBombMark(ctx, r);

  return canvas;
}

function getSprite(
  kind: number,
  bomb: boolean,
  cell: number,
  dpr: number,
): HTMLCanvasElement {
  const key = `${kind}|${bomb ? 'b' : 'g'}|${Math.round(cell)}|${dpr}`;
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = buildSprite(kind, bomb, cell, dpr);
    cache.set(key, sprite);
  }
  return sprite;
}

export interface GemOptions {
  scale?: number;
  alpha?: number;
  /** 선택/힌트 강조 0~1 */
  highlight?: number;
  /** 터질 때 번쩍임 0~1 */
  flash?: number;
  /** 폭탄이면 강조 링을 붉게 그린다 */
  bomb?: boolean;
}

/**
 * 동물 하나를 그린다. 실제로는 미리 만들어둔 스프라이트를 복사할 뿐이다.
 */
export function drawGem(
  ctx: CanvasRenderingContext2D,
  kind: number,
  cx: number,
  cy: number,
  cell: number,
  dpr: number,
  opts: GemOptions = {},
): void {
  const scale = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  const highlight = opts.highlight ?? 0;
  const flash = opts.flash ?? 0;
  const bomb = opts.bomb ?? false;

  if (alpha <= 0.01 || scale <= 0.01) return;

  const sprite = getSprite(kind, bomb, cell, dpr);
  const side = cell * PAD_RATIO * scale;
  const x = cx - side / 2;
  const y = cy - side / 2;

  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x, y, side, side);

  // 번쩍임은 같은 그림을 덧그려 밝기를 올리는 것으로 대신한다
  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * flash * 0.7;
    ctx.drawImage(sprite, x, y, side, side);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (highlight > 0.01) {
    ctx.globalAlpha = alpha * highlight;
    ctx.strokeStyle = bomb ? '#ff8080' : '#ffffff';
    ctx.lineWidth = Math.max(1.5, cell * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.46 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/** 파티클 등에서 쓰는 동물 색 */
export function gemColor(kind: number): GemStyle {
  return GEM_STYLES[kind % GEM_STYLES.length];
}

/**
 * 캔버스 하나를 동물 얼굴 하나로 꽉 채운다. 타이틀 장식용.
 *
 * 보드와 같은 그리기 코드를 쓰므로 장식과 실제 젬이 어긋날 일이 없다.
 * 얼굴 그림은 한 변의 PAD_RATIO 배 영역에 그려지므로 역으로 나눠 셀 크기를 구한다.
 */
export function drawFaceInto(
  canvas: HTMLCanvasElement,
  kind: number,
  sizePx: number,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGem(ctx, kind, sizePx / 2, sizePx / 2, sizePx / PAD_RATIO, dpr);
}
