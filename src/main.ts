import { app, protocol } from 'electron';
import started from 'electron-squirrel-startup';
import { BrowserWindow } from './main/BrowserWindow';

if (started) {
  app.quit();
}

// Register custom protocol for video files before app is ready
app.whenReady().then(() => {
  // Register video protocol to serve local video files
  protocol.registerFileProtocol('video-file', (request, callback) => {
    const url = request.url.replace('video-file://', '');
    const decodedPath = decodeURIComponent(url);
    callback({ path: decodedPath });
  });
  
  createWindow();
});

let mainBrowserWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainBrowserWindow = new BrowserWindow();
};

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