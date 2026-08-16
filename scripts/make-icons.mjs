/**
 * 앱 아이콘 PNG 생성기.
 *
 * 외부 이미지 라이브러리 없이 픽셀을 직접 계산해 PNG로 인코딩한다.
 * 게임 안의 젬과 같은 색을 써서 아이콘과 화면의 인상을 맞췄다.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---------------------------------------------------------------- PNG 인코딩

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** RGBA 픽셀 배열(Uint8Array)을 PNG 버퍼로 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 각 행 앞에 필터 바이트(0 = None)를 붙인다
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 그리기 도구

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (edge, width, d) => clamp01(0.5 - (d - edge) / width);
const mix = (a, b, t) => a + (b - a) * t;
const mixColor = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function hex(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/** 정규화 좌표(-1..1)에서의 도형까지의 거리. 음수면 내부. */
const sdf = {
  circle: (x, y, r) => Math.hypot(x, y) - r,
  diamond: (x, y, r) => (Math.abs(x) + Math.abs(y)) * 0.72 - r,
  star: (x, y, r) => {
    const a = Math.atan2(y, x);
    const wave = 0.74 + 0.26 * Math.cos(5 * (a + Math.PI / 2));
    return Math.hypot(x, y) - r * wave;
  },
};

/**
 * 아이콘 한 장을 그린다.
 * @param {number} size 픽셀 크기
 * @param {number} contentScale 1이면 꽉 차게, 작을수록 여백이 커진다(maskable용)
 * @param {boolean} transparent 배경 없이 젬만 그린다(안드로이드 adaptive icon 전경용)
 */
function renderIcon(size, contentScale = 1, transparent = false) {
  const rgba = new Uint8Array(size * size * 4);

  const bgTop = hex('#16224a');
  const bgBottom = hex('#2b1444');
  const gems = [
    // [x, y, 반지름, 모양, 밝은색, 기본색, 어두운색]
    [0.0, -0.12, 0.4, 'diamond', hex('#cdefff'), hex('#45c8ff'), hex('#0a5e94')],
    [-0.44, 0.44, 0.24, 'circle', hex('#ffd0dc'), hex('#ff4d6d'), hex('#a31236')],
    [0.46, 0.46, 0.27, 'star', hex('#fff2c2'), hex('#ffc93c'), hex('#a86b06')],
  ];

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // -1 ~ 1 좌표계
      const nx = ((px + 0.5) / size) * 2 - 1;
      const ny = ((py + 0.5) / size) * 2 - 1;

      // 배경: 대각 그라디언트 + 중앙 발광 + 가장자리 비네팅
      // 투명 모드에서는 배경을 그리지 않고 젬만 남긴다
      let color = [8, 12, 26];
      if (!transparent) {
        const g = clamp01((nx * 0.35 + ny * 0.65 + 1) / 2);
        color = mixColor(bgTop, bgBottom, g);
        const centerGlow = clamp01(1 - Math.hypot(nx, ny) / 1.15);
        color = mixColor(color, hex('#3d6cff'), centerGlow * 0.22);
        color = mixColor(
          color,
          [0, 0, 0],
          Math.pow(clamp01(Math.hypot(nx, ny) / 1.5), 3) * 0.5,
        );
      }

      /** 젬이 이 픽셀을 덮은 정도 — 투명 모드의 알파값이 된다 */
      let coverage = 0;

      // 젬들
      for (const [gx, gy, gr, shape, light, base, dark] of gems) {
        const x = (nx - gx) / contentScale;
        const y = (ny - gy) / contentScale;
        const d = sdf[shape](x, y, gr);
        const aa = (2 / size / contentScale) * 1.6; // 안티앨리어싱 폭

        // 외곽 글로우
        if (d > 0 && d < 0.26) {
          const glow = Math.pow(1 - d / 0.26, 2.4) * 0.5;
          color = mixColor(color, base, glow);
          coverage = Math.max(coverage, glow);
        }

        // 바디 — 위쪽이 밝고 아래쪽이 어두운 그라디언트
        const inside = smooth(0, aa, d);
        if (inside > 0) {
          const shade = clamp01((y + gr) / (gr * 2));
          let body = mixColor(light, base, clamp01(shade * 1.4));
          body = mixColor(body, dark, clamp01((shade - 0.6) * 2.2));

          // 상단 광택
          const spec = clamp01(
            1 - Math.hypot((x + gr * 0.24) / (gr * 0.52), (y + gr * 0.44) / (gr * 0.34)),
          );
          body = mixColor(body, [255, 255, 255], Math.pow(spec, 1.4) * 0.9);

          // 아래쪽 반사광
          const rim = clamp01(1 - Math.hypot(x / (gr * 0.5), (y - gr * 0.74) / (gr * 0.18)));
          body = mixColor(body, [255, 255, 255], Math.pow(rim, 1.6) * 0.28);

          // 서로 겹쳐도 형태가 구분되도록 경계에 진한 테두리
          const edge = inside * (1 - smooth(-gr * 0.1, aa, d));
          body = mixColor(body, dark, edge * 0.85);

          color = mixColor(color, body, inside);
          coverage = Math.max(coverage, inside);
        }
      }

      const i = (py * size + px) * 4;
      rgba[i] = Math.round(clamp01(color[0] / 255) * 255);
      rgba[i + 1] = Math.round(clamp01(color[1] / 255) * 255);
      rgba[i + 2] = Math.round(clamp01(color[2] / 255) * 255);
      rgba[i + 3] = transparent ? Math.round(clamp01(coverage) * 255) : 255;
    }
  }

  return encodePng(size, size, rgba);
}

// ---------------------------------------------------------------- 실행

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-180.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // maskable은 안전 영역(중앙 80%) 안에 내용이 들어가야 한다
  ['icon-512-maskable.png', 512, 0.72],
];

for (const [name, size, scale] of targets) {
  const png = renderIcon(size, scale);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name} (${size}px, ${png.length.toLocaleString()} bytes)`);
}

console.log('PWA 아이콘 →', OUT_DIR);

// ---------------------------------------------------------------- 안드로이드

const RES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');

if (existsSync(RES_DIR)) {
  // [폴더, 런처 아이콘 크기, adaptive icon 전경 크기]
  const densities = [
    ['mipmap-mdpi', 48, 108],
    ['mipmap-hdpi', 72, 162],
    ['mipmap-xhdpi', 96, 216],
    ['mipmap-xxhdpi', 144, 324],
    ['mipmap-xxxhdpi', 192, 432],
  ];

  for (const [dir, launcherSize, fgSize] of densities) {
    const target = join(RES_DIR, dir);
    if (!existsSync(target)) continue;

    const launcher = renderIcon(launcherSize, 1);
    writeFileSync(join(target, 'ic_launcher.png'), launcher);
    writeFileSync(join(target, 'ic_launcher_round.png'), launcher);

    // adaptive icon 전경은 바깥 1/3이 잘릴 수 있어 안전 영역(가운데 66%) 안에 그린다
    writeFileSync(join(target, 'ic_launcher_foreground.png'), renderIcon(fgSize, 0.64, true));
  }

  // adaptive icon 배경색을 게임 배경과 맞춘다
  const bgXml = join(RES_DIR, 'values', 'ic_launcher_background.xml');
  if (existsSync(bgXml)) {
    writeFileSync(
      bgXml,
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#131E3C</color>\n</resources>\n',
    );
  }

  console.log('안드로이드 런처 아이콘 →', RES_DIR);
} else {
  console.log('(android 폴더가 없어 런처 아이콘은 건너뜀)');
}
