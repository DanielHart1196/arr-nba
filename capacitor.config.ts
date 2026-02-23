import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.arrnba.app',
  appName: 'arr-nba',
  webDir: 'www',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl
        }
      }
    : {})
};

export default config;
