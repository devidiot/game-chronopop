/**
 * dist 빌드 결과를 파일 하나짜리 HTML로 합친다.
 *
 * AirDrop이나 iCloud Drive로 옮겨 파일 앱에서 바로 열 수 있고,
 * 어떤 정적 호스팅에 올려도 경로 문제가 없다.
 *
 *   node scripts/inline-single.mjs   (npm run build:single 이 대신 호출)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'chronopop-single.html');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 이 없습니다. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/** dist 기준 상대 경로의 파일을 읽는다 */
function readAsset(src) {
  const rel = src.replace(/^\.?\//, '');
  const path = join(DIST, rel);
  if (!existsSync(path)) {
    console.warn(`  건너뜀(파일 없음): ${src}`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

// <script type="module" src="..."> → 인라인
html = html.replace(
  /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g,
  (match, src) => {
    const code = readAsset(src);
    if (code === null) return match;
    console.log(`  스크립트 인라인: ${src} (${code.length.toLocaleString()} chars)`);
    // </script> 문자열이 코드 안에 있으면 HTML 파싱이 깨지므로 이스케이프
    return `<script type="module">\n${code.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
  },
);

// <link rel="stylesheet" href="..."> → 인라인
html = html.replace(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g,
  (match, href) => {
    const css = readAsset(href);
    if (css === null) return match;
    console.log(`  스타일 인라인: ${href} (${css.length.toLocaleString()} chars)`);
    return `<style>\n${css}\n</style>`;
  },
);

// 단일 파일에는 서비스 워커/매니페스트를 쓸 수 없다(같은 폴더에 파일이 없으므로)
html = html.replace(/<link\b[^>]*\brel="manifest"[^>]*>/g, '');

writeFileSync(OUT, html, 'utf8');
console.log(`\n완성 → ${OUT}`);
console.log(`크기: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
