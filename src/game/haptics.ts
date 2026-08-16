import { getVibrationEnabled, setVibrationEnabled } from './storage';

/**
 * 진동 피드백.
 *
 * 안드로이드(크롬·APK)에서는 동작하지만 **아이폰에서는 나지 않는다.**
 * iOS 사파리가 Vibration API를 지원하지 않기 때문이고, 웹에서 우회할 방법도 없다.
 * 지원하지 않는 기기에서는 조용히 아무 일도 하지 않는다.
 */
class Haptics {
  enabled = getVibrationEnabled();

  readonly supported =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  toggle(): boolean {
    this.enabled = !this.enabled;
    setVibrationEnabled(this.enabled);
    if (this.enabled) this.buzz(18);
    return this.enabled;
  }

  private buzz(pattern: number | number[]): void {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* 일부 브라우저는 사용자 제스처 밖에서 거부한다 — 무시 */
    }
  }

  /** 젬이 터질 때 — 클수록 길게 */
  pop(size: number, chain: number): void {
    if (size >= 6 || chain >= 4) this.buzz([14, 24, 18]);
    else if (size >= 5) this.buzz(24);
    else if (size >= 4) this.buzz(14);
    else this.buzz(7);
  }

  /** 주변까지 날아가는 폭발 */
  blast(): void {
    this.buzz([16, 26, 22]);
  }

  /** 폭탄 — 가장 세게 */
  bomb(): void {
    this.buzz([26, 40, 34, 40, 28]);
  }

  /** 헛스왑 */
  fail(): void {
    this.buzz(26);
  }

  /** 섞기 */
  chance(): void {
    this.buzz([10, 20, 10, 20, 14]);
  }

  gameOver(): void {
    this.buzz([40, 70, 40, 70, 90]);
  }
}

export const haptics = new Haptics();
