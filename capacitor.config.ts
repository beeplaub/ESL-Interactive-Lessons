import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brenup.app',
  appName: 'BrenUp',
  webDir: 'public',
  server: {
    // In production, the WebView navigates directly to the authoritative Vercel deployment.
    // This satisfies the requirement that approved web UI and content changes deployed to Vercel
    // are reflected in the installed app without requiring a Google Play release.
    url: 'https://www.brenup.com',
    cleartext: false,
    allowNavigation: [
      'www.brenup.com',
      'brenup.com',
      '*.supabase.co'
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
