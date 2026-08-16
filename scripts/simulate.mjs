/**
 * test/sim.ts 를 esbuild로 번들해서 Node에서 실행한다.
 * (esbuild는 vite가 이미 들고 있어 추가 설치가 필요 없다)
 *
 *   npm run sim
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, '.tmp');
const OUT = join(TMP, 'sim.mjs');

mkdirSync(TMP, { recursive: true });

await build({
  entryPoints: [join(ROOT, 'test', 'sim.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: OUT,
  logLevel: 'warning',
});

const mod = await import(pathToFileURL(OUT).href);
mod.main();

rmSync(TMP, { recursive: true, force: true });
