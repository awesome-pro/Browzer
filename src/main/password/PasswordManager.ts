import { safeStorage } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'crypto';

/**
 * Saved credential interface
 */
export interface SavedCredential {
  id: string;
  origin: string;
  username: string;
  encryptedPassword: Buffer;
  lastUsed: number;
  timesUsed: number;
  createdAt: number;
}

/**
 * Credential info for IPC (without encrypted buffer)
 */
export interface CredentialInfo {
  id: string;
  origin: string;
  username: string;
  lastUsed: number;
  timesUsed: number;
}

/**
 * Password manager schema
 */
interface PasswordStore {
  credentials: SavedCredential[];
  blacklistedSites: string[];
}

/**
 * PasswordManager - Secure password storage using Electron's safeStorage
 * Follows the same pattern as SettingsStore using electron-store
 */
export class PasswordManager {
  private store: Store<PasswordStore>;

  constructor() {
    this.store = new Store<PasswordStore>({
      name: 'passwords',
      defaults: {
        credentials: [],
        blacklistedSites: []
      },
      // Store in encrypted format
      serialize: (value) => {
        // Convert Buffer objects to serializable format
        const serializable = {
          ...value,
          credentials: value.credentials.map(cred => ({
            ...cred,
            encryptedPassword: Array.from(cred.encryptedPassword)
          }))
        };
        return JSON.stringify(serializable);
      },
      deserialize: (value) => {
        const parsed = JSON.parse(value);
        // Convert arrays back to Buffer objects
        return {
          ...parsed,
          credentials: parsed.credentials.map((cred: any) => ({
            ...cred,
            encryptedPassword: Buffer.from(cred.encryptedPassword)
          }))
        };
      }
    });

    console.log('[PasswordManager] Initialized with store at:', this.store.path);
  }

  /**
   * Save a new credential
   */
  public async saveCredential(origin: string, username: string, password: string): Promise<boolean> {
    try {
      const credentials = this.store.get('credentials');
      
      // Check if credential already exists
      const existingIndex = credentials.findIndex(
        c => c.origin === origin && c.username === username
      );

      if (existingIndex !== -1) {
        // Update existing credential
        const encrypted = safeStorage.encryptString(password);
        credentials[existingIndex] = {
          ...credentials[existingIndex],
          encryptedPassword: encrypted,
          lastUsed: Date.now(),
          timesUsed: credentials[existingIndex].timesUsed + 1
        };
      } else {
        // Create new credential
        const encrypted = safeStorage.encryptString(password);
        const credential: SavedCredential = {
          id: randomUUID(),
          origin,
          username,
          encryptedPassword: encrypted,
          lastUsed: Date.now(),
          timesUsed: 1,
          createdAt: Date.now()
        };
        
        credentials.push(credential);
      }

      this.store.set('credentials', credentials);
      console.log(`[PasswordManager] Saved credential for ${username} at ${origin}`);
      return true;
    } catch (error) {
      console.error('[PasswordManager] Failed to save credential:', error);
      return false;
    }
  }

  /**
   * Get credentials for a specific origin
   */
  public getCredentialsForOrigin(origin: string): CredentialInfo[] {
    const credentials = this.store.get('credentials');
    
    return credentials
      .filter(c => c.origin === origin)
      .sort((a, b) => b.lastUsed - a.lastUsed) // Most recently used first
      .map(c => ({
        id: c.id,
        origin: c.origin,
        username: c.username,
        lastUsed: c.lastUsed,
        timesUsed: c.timesUsed
      }));
  }

  /**
   * Get decrypted password for a credential
   */
  public getPassword(credentialId: string): string | null {
    try {
      const credentials = this.store.get('credentials');
      const credential = credentials.find(c => c.id === credentialId);
      
      if (!credential) {
        return null;
      }

      const decrypted = safeStorage.decryptString(credential.encryptedPassword);
      
      // Update usage stats
      const updatedCredentials = credentials.map(c => 
        c.id === credentialId 
          ? { ...c, lastUsed: Date.now(), timesUsed: c.timesUsed + 1 }
          : c
      );
      this.store.set('credentials', updatedCredentials);
      
      return decrypted;
    } catch (error) {
      console.error('[PasswordManager] Failed to decrypt password:', error);
      return null;
    }
  }

  /**
   * Delete a credential
   */
  public deleteCredential(credentialId: string): boolean {
    try {
      const credentials = this.store.get('credentials');
      const filteredCredentials = credentials.filter(c => c.id !== credentialId);
      
      if (filteredCredentials.length < credentials.length) {
        this.store.set('credentials', filteredCredentials);
        console.log(`[PasswordManager] Deleted credential ${credentialId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[PasswordManager] Failed to delete credential:', error);
      return false;
    }
  }

  /**
   * Add origin to blacklist (user clicked "Never")
   */
  public addToBlacklist(origin: string): void {
    const blacklistedSites = this.store.get('blacklistedSites');
    if (!blacklistedSites.includes(origin)) {
      blacklistedSites.push(origin);
      this.store.set('blacklistedSites', blacklistedSites);
      console.log(`[PasswordManager] Added ${origin} to blacklist`);
    }
  }

  /**
   * Check if origin is blacklisted
   */
  public isBlacklisted(origin: string): boolean {
    const blacklistedSites = this.store.get('blacklistedSites');
    return blacklistedSites.includes(origin);
  }

  /**
   * Get all credentials (for management UI)
   */
  public getAllCredentials(): CredentialInfo[] {
    const credentials = this.store.get('credentials');
    return credentials.map(c => ({
      id: c.id,
      origin: c.origin,
      username: c.username,
      lastUsed: c.lastUsed,
      timesUsed: c.timesUsed
    }));
  }

  /**
   * Get storage path for debugging
   */
  public getStorePath(): string {
    return this.store.path;
  }
}
