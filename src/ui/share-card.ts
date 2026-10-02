import { Capacitor } from '@capacitor/core';

import { GEM_STYLES } from '../game/config';
import type { GameResult } from '../game/types';
import { drawGem } from '../render/gems';

/** 공유 이미지와 글에 함께 적는 게임 주소 */
export const GAME_URL = 'https://devidiot.github.io/game-chronopop/';

/** 공유 버튼이 뜨는 순위 — 이 등수 안에 들어야 자랑할 만하다 */
export const SHARE_RANK_LIMIT = 5;

/** 결과 카드 한 장을 그리는 데 필요한 것 */
export interface ShareCardData {
  result: GameResult;
  /** 기록표에서의 등수(1부터) */
  rank: number;
  isNewBest: boolean;
  boardSize: number;
  at: Date;
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

/* 카드는 세로 4:5 — 메신저와 SNS 어디에 올려도 잘리지 않는 비율 */
const CARD_W = 1080;
const CARD_H = 1350;

/* style.css 의 색을 그대로 옮겼다. 화면과 카드가 다른 게임처럼 보이면 안 된다. */
const COLOR = {
  bg: '#070b14',
  panel: 'rgba(18, 26, 45, 0.96)',
  line: 'rgba(255, 255, 255, 0.12)',
  text: '#eaf0ff',
  muted: '#8ea0c4',
  accent: '#4dd8ff',
  accent2: '#ff5fa2',
  good: '#46e6a0',
  warn: '#ffd166',
  warn2: '#ff8a4d',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif";

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 글자에 그라디언트를 입혀 가운데 정렬로 쓴다 */
function gradientText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  from: string,
  to: string,
): void {
  const w = ctx.measureText(text).width;
  const g = ctx.createLinearGradient(cx - w / 2, y - 40, cx + w / 2, y + 40);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillText(text, cx, y);
}

/** 알약 모양 배지. 글자 폭에 맞춰 늘어난다. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fill: string | CanvasGradient,
  color: string,
  size: number,
): void {
  ctx.font = font(800, size);
  const w = ctx.measureText(text).width + size * 1.6;
  const h = size * 1.9;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.04);
}

/** 타이틀처럼 동물 여섯을 어긋나게 늘어놓는다 */
const FACE_LOOKS = [
  { size: 118, tilt: -10, lift: 10 },
  { size: 142, tilt: 5, lift: -8 },
  { size: 110, tilt: -5, lift: 16 },
  { size: 138, tilt: 9, lift: -4 },
  { size: 122, tilt: -7, lift: 12 },
  { size: 130, tilt: 4, lift: 0 },
];

function drawFaces(ctx: CanvasRenderingContext2D, cy: number): void {
  const overlap = 22;
  const total =
    FACE_LOOKS.reduce((sum, l) => sum + l.size, 0) - overlap * (FACE_LOOKS.length - 1);
  let x = (CARD_W - total) / 2;
  FACE_LOOKS.forEach((look, kind) => {
    const cx = x + look.size / 2;
    ctx.save();
    ctx.translate(cx, cy + look.lift);
    ctx.rotate((look.tilt * Math.PI) / 180);
    // 스프라이트는 셀의 PAD_RATIO 배로 그려지므로 역으로 나눠 셀 크기를 준다
    drawGem(ctx, kind % GEM_STYLES.length, 0, 0, look.size / 1.62, 1);
    ctx.restore();
    x += look.size - overlap;
  });
}

/**
 * 결과 화면을 본뜬 카드를 캔버스에 그린다.
 *
 * DOM 을 그대로 찍는 대신 직접 그리는 이유: 오버레이의 블러와 글자 그라디언트는
 * 화면 캡처 라이브러리가 제대로 못 옮기고, 라이브러리 없이도 어느 기기에서나
 * 같은 그림이 나와야 공유 결과를 믿을 수 있다.
 */
export function renderShareCard(data: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 배경 — body 의 그라디언트
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const top = ctx.createRadialGradient(CARD_W / 2, -100, 0, CARD_W / 2, -100, 900);
  top.addColorStop(0, '#1b2b4d');
  top.addColorStop(1, 'rgba(27,43,77,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const corner = ctx.createRadialGradient(CARD_W, CARD_H, 0, CARD_W, CARD_H, 800);
  corner.addColorStop(0, '#2a1740');
  corner.addColorStop(1, 'rgba(42,23,64,0)');
  ctx.fillStyle = corner;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 패널
  const px = 60;
  const py = 230;
  const pw = CARD_W - px * 2;
  const ph = CARD_H - py - 50;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, px, py, pw, ph, 44);
  ctx.fillStyle = COLOR.panel;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, px, py, pw, ph, 44);
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 동물들은 패널 윗선에 걸터앉는다
  drawFaces(ctx, py);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고
  ctx.font = font(900, 92);
  gradientText(ctx, 'Crush Pang', CARD_W / 2, 380, COLOR.accent, COLOR.accent2);

  ctx.font = font(700, 30);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText('T I M E   U P', CARD_W / 2, 448);

  // 등수 배지
  const badge = ctx.createLinearGradient(0, 0, CARD_W, 0);
  badge.addColorStop(0, COLOR.warn);
  badge.addColorStop(1, COLOR.warn2);
  const rankText = data.isNewBest ? `🏆 ${data.rank}위 · 신기록!` : `🏆 ${data.rank}위`;
  pill(ctx, rankText, CARD_W / 2, 522, badge, '#2a1600', 34);

  // 점수
  ctx.font = font(700, 26);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText('S C O R E', CARD_W / 2, 592);
  ctx.font = font(900, 150);
  gradientText(
    ctx,
    data.result.score.toLocaleString('ko-KR'),
    CARD_W / 2,
    686,
    COLOR.accent,
    COLOR.good,
  );

  // 보드 크기 꼬리표
  pill(
    ctx,
    `${data.boardSize} × ${data.boardSize} 보드`,
    CARD_W / 2,
    792,
    'rgba(255,255,255,0.08)',
    COLOR.muted,
    24,
  );

  // 세부 기록 — 결과 화면의 2열 격자. 마지막 칸은 한 줄을 다 쓴다.
  const stats: [string, string][] = [
    ['최대 콤보', `${data.result.maxCombo}`],
    ['최대 체인', `${data.result.maxChain}`],
    ['최대 매치', `${data.result.biggestMatch}`],
    ['생존 시간', `${data.result.survived.toFixed(1)}s`],
    ['번 시간', `+${data.result.earnedTime.toFixed(1)}s`],
  ];
  const gap = 16;
  const cellW = (pw - 80 - gap) / 2;
  const cellH = 100;
  const gridX = px + 40;
  const gridY = 846;
  stats.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const wide = i === stats.length - 1 && col === 0;
    const w = wide ? cellW * 2 + gap : cellW;
    const x = gridX + col * (cellW + gap);
    const y = gridY + row * (cellH + gap);
    roundRect(ctx, x, y, w, cellH, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.font = font(600, 24);
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(label, x + w / 2, y + 31);
    ctx.font = font(800, 40);
    ctx.fillStyle = COLOR.text;
    ctx.fillText(value, x + w / 2, y + 68);
  });

  // 날짜와 주소
  const d = data.at;
  ctx.font = font(600, 24);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(
    `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`,
    CARD_W / 2,
    CARD_H - 132,
  );
  ctx.font = font(700, 26);
  ctx.fillStyle = COLOR.accent;
  ctx.fillText(GAME_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), CARD_W / 2, CARD_H - 88);

  return canvas;
}

/** 공유 글 한 줄. 이미지가 빠지는 앱에서도 이 글만으로 뜻이 통해야 한다. */
export function shareText(data: ShareCardData): string {
  const score = data.result.score.toLocaleString('ko-KR');
  return (
    `Crush Pang ${data.boardSize}×${data.boardSize} 보드에서 ${score}점으로 ${data.rank}위에 올랐습니다!\n` +
    GAME_URL
  );
}

/** 캔버스를 PNG 파일로 바꾼다 */
export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], name, { type: 'image/png' }) : null);
    }, 'image/png');
  });
}

function blobToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 안드로이드 앱(Capacitor)에서는 웹뷰에 공유 API 가 없어 네이티브 플러그인을 쓴다.
 * 파일을 캐시 폴더에 쓰고 그 경로를 공유 시트에 넘긴다.
 */
async function shareNative(file: File, text: string, title: string): Promise<ShareOutcome> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const written = await Filesystem.writeFile({
    path: file.name,
    data: await blobToBase64(file),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title, text, files: [written.uri], dialogTitle: title });
    return 'shared';
  } catch (err) {
    // 사용자가 공유 시트를 닫은 것은 실패가 아니다
    if (/cancel/i.test(String((err as Error)?.message ?? err))) return 'cancelled';
    return 'failed';
  }
}

/** 공유 API 가 없는 브라우저에서는 이미지를 내려받게 한다 */
function download(file: File): boolean {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * 결과 이미지를 공유 시트로 넘긴다.
 *
 * 순서: 네이티브 앱 → Web Share(파일) → 내려받기.
 * 사파리는 사용자가 누른 직후에만 공유 시트를 열어 주므로, 파일은 미리 만들어
 * 두고 이 함수는 버튼 핸들러에서 바로 불러야 한다.
 */
export async function shareImage(file: File, text: string): Promise<ShareOutcome> {
  const title = 'Crush Pang';
  if (Capacitor.isNativePlatform()) return shareNative(file, text, title);

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // 공유 시트는 못 열었지만 이미지는 건질 수 있다
    }
  }
  return download(file) ? 'saved' : 'failed';
}
