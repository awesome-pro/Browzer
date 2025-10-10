import type { BrowserAPI } from './preload';

declare global {
  interface Window {
    browserAPI: BrowserAPI;
  }

  // Vite Electron Forge globals
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};
