import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

export class PythonDependencyManager {
  private static instance: PythonDependencyManager;
  private appSupportPath: string;
  private pythonEnvPath: string;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    // Use Application Support directory for user-specific data
    this.appSupportPath = path.join(app.getPath('userData'), 'PythonEnvironment');
    this.pythonEnvPath = path.join(this.appSupportPath, 'venv');
  }

  public static getInstance(): PythonDependencyManager {
    if (!PythonDependencyManager.instance) {
      PythonDependencyManager.instance = new PythonDependencyManager();
    }
    return PythonDependencyManager.instance;
  }

  /**
   * Initialize Python environment - called on app startup
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    await this.initializationPromise;
    this.isInitialized = true;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Check if environment already exists
      const envExists = await this.checkEnvironmentExists();
      
      if (!envExists) {
        console.log('Python environment not found. Setting up...');
        await this.setupEnvironment();
      } else {
        console.log('Python environment found at:', this.pythonEnvPath);
        // Verify the environment is still valid
        const isValid = await this.verifyEnvironment();
        if (!isValid) {
          console.log('Python environment is corrupted. Rebuilding...');
          await this.cleanEnvironment();
          await this.setupEnvironment();
        }
      }
    } catch (error) {
      console.error('Failed to initialize Python environment:', error);
      throw error;
    }
  }

  private async checkEnvironmentExists(): Promise<boolean> {
    try {
      await access(this.pythonEnvPath);
      const pythonPath = this.getPythonExecutable();
      await access(pythonPath);
      return true;
    } catch {
      return false;
    }
  }

  private async verifyEnvironment(): Promise<boolean> {
    return new Promise((resolve) => {
      const pythonPath = this.getPythonExecutable();
      const checkScript = `
import sys
try:
    import requests
    import beautifulsoup4
    import nltk
    import openai
    import anthropic
    print("OK")
except ImportError as e:
    print(f"MISSING: {e}")
    sys.exit(1)
`;
      
      const child = spawn(pythonPath, ['-c', checkScript]);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        resolve(code === 0 && output.includes('OK'));
      });
    });
  }

  private async setupEnvironment(): Promise<void> {
    // Create directory structure
    await mkdir(this.appSupportPath, { recursive: true });

    // Show progress dialog
    const progressWindow = await this.showProgressDialog('Setting up Python environment...');

    try {
      // Step 1: Create virtual environment
      await this.updateProgress(progressWindow, 'Creating Python environment...', 10);
      await this.createVirtualEnvironment();

      // Step 2: Install dependencies
      await this.updateProgress(progressWindow, 'Installing dependencies...', 30);
      await this.installDependencies();

      // Step 3: Download NLTK data
      await this.updateProgress(progressWindow, 'Downloading language data...', 80);
      await this.downloadNLTKData();

      await this.updateProgress(progressWindow, 'Complete!', 100);
      
      // Close progress window after a short delay
      setTimeout(() => {
        if (progressWindow && !progressWindow.isDestroyed()) {
          progressWindow.close();
        }
      }, 1000);

    } catch (error) {
      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.close();
      }
      throw error;
    }
  }

  private async createVirtualEnvironment(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use system Python to create venv
      const child = spawn('python3', ['-m', 'venv', this.pythonEnvPath], {
        cwd: this.appSupportPath
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create virtual environment. Exit code: ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to create virtual environment: ${error.message}`));
      });
    });
  }

  private async installDependencies(): Promise<void> {
    const pipPath = path.join(this.pythonEnvPath, 'bin', 'pip');
    
    // Essential dependencies for agents
    const dependencies = [
      'requests==2.32.3',
      'beautifulsoup4==4.12.3',
      'nltk==3.8.1',
      'openai==1.35.3',
      'anthropic==0.52.0',
      'python-dotenv==1.0.1',
      'urllib3==2.2.2',
      'certifi',
      'charset-normalizer',
      'idna'
    ];

    // Install each dependency
    for (const dep of dependencies) {
      await this.installPackage(pipPath, dep);
    }
  }

  private async installPackage(pipPath: string, packageSpec: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Installing ${packageSpec}...`);
      
      const child = spawn(pipPath, ['install', packageSpec, '--no-cache-dir'], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      child.stdout.on('data', (data) => {
        console.log(`pip: ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        console.error(`pip error: ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to install ${packageSpec}`));
        }
      });
    });
  }

  private async downloadNLTKData(): Promise<void> {
    const pythonPath = this.getPythonExecutable();
    
    return new Promise((resolve, reject) => {
      const script = `
import nltk
import os
import ssl

# Handle SSL certificate issues
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

# Download required NLTK data
nltk_data_path = os.path.expanduser('~/nltk_data')
os.makedirs(nltk_data_path, exist_ok=True)

try:
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)
    print("NLTK data downloaded successfully")
except Exception as e:
    print(f"Error downloading NLTK data: {e}")
    raise
`;

      const child = spawn(pythonPath, ['-c', script]);
      
      child.stdout.on('data', (data) => {
        console.log(`NLTK: ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to download NLTK data'));
        }
      });
    });
  }

  private async cleanEnvironment(): Promise<void> {
    const { promisify } = require('util');
    const rimraf = promisify(require('rimraf'));
    
    try {
      await rimraf(this.pythonEnvPath);
      console.log('Cleaned existing Python environment');
    } catch (error) {
      console.error('Error cleaning environment:', error);
    }
  }

  private async showProgressDialog(message: string): Promise<any> {
    // This would ideally show a proper progress window
    // For now, we'll just log the message
    console.log(message);
    return null;
  }

  private async updateProgress(window: any, message: string, percentage: number): Promise<void> {
    console.log(`[${percentage}%] ${message}`);
    // In a real implementation, update the progress window
  }

  /**
   * Get the Python executable path
   */
  public getPythonExecutable(): string {
    if (process.platform === 'win32') {
      return path.join(this.pythonEnvPath, 'Scripts', 'python.exe');
    } else {
      return path.join(this.pythonEnvPath, 'bin', 'python');
    }
  }

  /**
   * Get the site-packages path
   */
  public getSitePackagesPath(): string {
    // This will be determined at runtime based on the actual Python version
    const pythonPath = this.getPythonExecutable();
    const libPath = path.join(this.pythonEnvPath, 'lib');
    
    // Find the python version directory
    try {
      const dirs = fs.readdirSync(libPath);
      const pythonDir = dirs.find(d => d.startsWith('python'));
      if (pythonDir) {
        return path.join(libPath, pythonDir, 'site-packages');
      }
    } catch (error) {
      console.error('Could not find site-packages:', error);
    }
    
    // Fallback
    return path.join(libPath, 'python3.11', 'site-packages');
  }

  /**
   * Get environment variables for Python processes
   */
  public getEnvironmentVariables(): NodeJS.ProcessEnv {
    const sitePackages = this.getSitePackagesPath();
    
    return {
      ...process.env,
      PYTHONPATH: sitePackages,
      VIRTUAL_ENV: this.pythonEnvPath,
      PATH: `${path.join(this.pythonEnvPath, 'bin')}:${process.env.PATH}`
    };
  }

  /**
   * Check if we should use system Python (for development)
   */
  public shouldUseSystemPython(): boolean {
    return !app.isPackaged && fs.existsSync(path.join(process.cwd(), 'agents', 'venv'));
  }
}
