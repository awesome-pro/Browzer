import { app, ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export function registerPythonSetupHandlers(): void {
  ipcMain.handle('setup-python', async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      await setupPythonBundle(window);
      return { success: true };
    } catch (error) {
      console.error('Python setup failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

export async function setupPythonBundle(window?: BrowserWindow | null): Promise<void> {
  const appSupportPath = app.getPath('userData'); // This gives us ~/Library/Application Support/Browzer
  const pythonBundlePath = path.join(appSupportPath, 'python-bundle');
  const setupMarkerPath = path.join(pythonBundlePath, '.setup-complete');
  
  // Check if Python bundle is already set up
  if (fs.existsSync(setupMarkerPath)) {
    console.log('[Python Setup] Python bundle already exists at:', pythonBundlePath);
    return;
  }
  
  console.log('[Python Setup] Setting up Python bundle for first time...');
  console.log('[Python Setup] Target directory:', pythonBundlePath);
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(pythonBundlePath)) {
    fs.mkdirSync(pythonBundlePath, { recursive: true });
  }
  
  // Get the path to the setup script
  let setupScriptPath: string;
  if (app.isPackaged) {
    // In packaged app, the script is in Resources/app.asar.unpacked
    setupScriptPath = path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'scripts', 'prepare-python-bundle.sh');
  } else {
    // In development
    setupScriptPath = path.join(process.cwd(), 'scripts', 'prepare-python-bundle.sh');
  }
  
  if (!fs.existsSync(setupScriptPath)) {
    console.error('[Python Setup] Setup script not found at:', setupScriptPath);
    throw new Error('Python setup script not found');
  }
  
  return new Promise((resolve, reject) => {
    console.log('[Python Setup] Running setup script...');
    
    const sendProgress = (progress: number, message: string, step?: number) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('python-setup-progress', { progress, message, step });
      }
    };
    
    // Send initial progress
    sendProgress(5, 'Starting Python setup...', 0);
    
    // Run the setup script with the Application Support path as an argument
    const setupProcess = spawn('bash', [setupScriptPath, pythonBundlePath], {
      env: {
        ...process.env,
        PYTHON_BUNDLE_DIR: pythonBundlePath
      }
    });
    
    let output = '';
    let currentProgress = 10;
    
    // Parse output to send progress updates
    setupProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[Python Setup]', text);
      
      // Parse progress from script output
      if (text.includes('Installing required packages')) {
        sendProgress(30, 'Installing AI models...', 1);
        currentProgress = 30;
      } else if (text.includes('Installing NLTK')) {
        sendProgress(50, 'Configuring language processing...', 2);
        currentProgress = 50;
      } else if (text.includes('Downloading NLTK data')) {
        sendProgress(70, 'Downloading language data...', 2);
        currentProgress = 70;
      } else if (text.includes('Testing the Python bundle')) {
        sendProgress(90, 'Optimizing performance...', 3);
        currentProgress = 90;
      } else if (text.includes('Python bundle prepared successfully')) {
        sendProgress(95, 'Finalizing setup...', 3);
        currentProgress = 95;
      }
    });
    
    setupProcess.stderr?.on('data', (data) => {
      console.error('[Python Setup Error]', data.toString());
    });
    
    setupProcess.on('close', (code) => {
      if (code === 0) {
        // Create marker file to indicate setup is complete
        fs.writeFileSync(setupMarkerPath, new Date().toISOString());
        console.log('[Python Setup] Python bundle setup completed successfully');
        sendProgress(100, 'Setup complete!', 3);
        resolve();
      } else {
        console.error('[Python Setup] Setup script failed with code:', code);
        reject(new Error(`Python setup failed with code ${code}`));
      }
    });
    
    setupProcess.on('error', (error) => {
      console.error('[Python Setup] Failed to run setup script:', error);
      reject(error);
    });
  });
}

/**
 * Get the path to the Python executable in Application Support
 */
export function getPythonPath(): string {
  const appSupportPath = app.getPath('userData');
  return path.join(appSupportPath, 'python-bundle', 'python-runtime', 'bin', 'python');
}

/**
 * Get the path to the Python site-packages in Application Support
 */
export function getPythonSitePackagesPath(): string {
  const appSupportPath = app.getPath('userData');
  return path.join(appSupportPath, 'python-bundle', 'python-runtime', 'lib', 'python3.13', 'site-packages');
}
