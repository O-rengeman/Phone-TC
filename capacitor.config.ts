import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.phone.tc',
  appName: 'Phone TC',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
