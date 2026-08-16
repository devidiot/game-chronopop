/**
 * 디버그 APK를 만든다.
 *
 * Android Studio 없이 command line tools만으로 빌드하며,
 * SDK 위치를 찾아 android/local.properties 를 자동으로 써준다.
 *
 *   npm run android:apk
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'android');

if (!existsSync(ANDROID)) {
  console.error('android 폴더가 없습니다. 먼저 npx cap add android 를 실행하세요.');
  process.exit(1);
}

/** 흔한 위치들에서 안드로이드 SDK를 찾는다 */
function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools',
    join(homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(join(dir, 'platforms')) || existsSync(join(dir, 'cmdline-tools'))) {
      return dir;
    }
  }
  return null;
}

/**
 * Capacitor 8은 Java 21 이상을 요구한다.
 * 기본 java가 그보다 낮을 수 있으니 쓸 수 있는 JDK를 직접 찾는다.
 */
function findJdk() {
  const candidates = [
    process.env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].filter(Boolean);

  for (const home of candidates) {
    const javac = join(home, 'bin', 'javac');
    if (!existsSync(javac)) continue;
    try {
      const out = execFileSync(javac, ['-version'], { encoding: 'utf8' }).trim();
      const major = Number(out.replace(/^javac /, '').split('.')[0]);
      if (major >= 21) return { home, version: out };
    } catch {
      /* 이 후보는 건너뛴다 */
    }
  }
  return null;
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    'Java 21 이상을 찾지 못했습니다.\n' +
      '  brew install openjdk@21\n' +
      '설치 후 다시 시도하거나 JAVA_HOME 환경변수를 지정하세요.',
  );
  process.exit(1);
}
console.log(`JDK: ${jdk.home} (${jdk.version})`);

const sdk = findSdk();
if (!sdk) {
  console.error(
    'Android SDK를 찾지 못했습니다.\n' +
      '  brew install --cask android-commandlinetools\n' +
      '  sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"\n' +
      '설치 후 다시 시도하거나 ANDROID_HOME 환경변수를 지정하세요.',
  );
  process.exit(1);
}

console.log(`Android SDK: ${sdk}`);
writeFileSync(join(ANDROID, 'local.properties'), `sdk.dir=${sdk}\n`);

console.log('Gradle 빌드 시작 (처음 한 번은 의존성을 받느라 몇 분 걸립니다)…\n');

execFileSync('./gradlew', ['assembleDebug', '--no-daemon'], {
  cwd: ANDROID,
  stdio: 'inherit',
  env: {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    JAVA_HOME: jdk.home,
    PATH: `${join(jdk.home, 'bin')}:${process.env.PATH ?? ''}`,
  },
});

const apk = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) {
  console.error('\nAPK를 찾을 수 없습니다. 위 Gradle 로그를 확인하세요.');
  process.exit(1);
}

const outDir = join(ROOT, 'build');
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, 'chronopop.apk');
copyFileSync(apk, dest);

console.log(`\n완성 → ${dest}`);
console.log('설치: adb install -r build/chronopop.apk  (또는 파일을 폰으로 옮겨 실행)');
