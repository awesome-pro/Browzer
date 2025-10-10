import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { BrowserWindow } from './main/BrowserWindow';

if (started) {
  app.quit();
}

let mainBrowserWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainBrowserWindow = new BrowserWindow();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainBrowserWindow === null) {
    createWindow();
  }
});