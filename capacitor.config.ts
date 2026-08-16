import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ryan.chronopop',
  appName: 'ChronoPop',
  webDir: 'dist',
  // 웹뷰가 뜨기 전 잠깐 보이는 배경을 게임 배경색과 맞춘다
  backgroundColor: '#070b14',
  android: {
    backgroundColor: '#070b14',
    // 당겨서 새로고침이 게임 조작을 방해하지 않도록 끈다
    allowMixedContent: false,
  },
};

export default config;
