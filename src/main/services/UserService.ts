import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

export interface User {
  id: string;
  email: string;
  isVerified: boolean;
  createdAt: number;
  verifiedAt?: number;
  lastLoginAt?: number;
  preferences: {
    sidebar: boolean;
    adblock: boolean;
    theme: 'dark' | 'light';
    apiKeys: Record<string, string>;
    importedBrowsers: string[];
  };
  profile: {
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
}

export interface UserSession {
  userId: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
}

export class UserService {
  private readonly usersPath: string;
  private readonly sessionsPath: string;
  private users: Map<string, User> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private currentUserId: string | null = null;

  constructor() {
    this.usersPath = path.join(app.getPath('userData'), 'users.json');
    this.sessionsPath = path.join(app.getPath('userData'), 'sessions.json');
    this.loadUsers();
    this.loadSessions();
    this.setupCleanupInterval();
  }

  private async loadUsers(): Promise<void> {
    try {
      if (fs.existsSync(this.usersPath)) {
        const usersData = await fs.promises.readFile(this.usersPath, 'utf8');
        const usersArray: User[] = JSON.parse(usersData);
        this.users = new Map(usersArray.map(user => [user.id, user]));
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      if (fs.existsSync(this.sessionsPath)) {
        const sessionsData = await fs.promises.readFile(this.sessionsPath, 'utf8');
        const sessionsArray: UserSession[] = JSON.parse(sessionsData);
        this.sessions = new Map(sessionsArray.map(session => [session.sessionId, session]));
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  private async saveUsers(): Promise<void> {
    try {
      const usersArray = Array.from(this.users.values());
      await fs.promises.writeFile(this.usersPath, JSON.stringify(usersArray, null, 2));
    } catch (error) {
      console.error('Failed to save users:', error);
    }
  }

  private async saveSessions(): Promise<void> {
    try {
      const sessionsArray = Array.from(this.sessions.values());
      await fs.promises.writeFile(this.sessionsPath, JSON.stringify(sessionsArray, null, 2));
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  public async createUser(email: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      // Check if user already exists
      const existingUser = this.findUserByEmail(email);
      if (existingUser) {
        return { success: false, message: 'User already exists with this email' };
      }

      // Create new user
      const user: User = {
        id: this.generateUserId(),
        email: email.toLowerCase().trim(),
        isVerified: false,
        createdAt: Date.now(),
        preferences: {
          sidebar: true,
          adblock: true,
          theme: 'dark',
          apiKeys: {},
          importedBrowsers: [],
        },
        profile: {},
      };

      this.users.set(user.id, user);
      await this.saveUsers();

      return { success: true, user, message: 'User created successfully' };

    } catch (error) {
      console.error('Failed to create user:', error);
      return { success: false, message: 'Failed to create user' };
    }
  }

  public async verifyUser(email: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      const user = this.findUserByEmail(email);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.isVerified = true;
      user.verifiedAt = Date.now();
      
      this.users.set(user.id, user);
      await this.saveUsers();

      return { success: true, user, message: 'User verified successfully' };

    } catch (error) {
      console.error('Failed to verify user:', error);
      return { success: false, message: 'Failed to verify user' };
    }
  }

  public async loginUser(email: string): Promise<{ success: boolean; sessionId?: string; user?: User; message: string }> {
    try {
      const user = this.findUserByEmail(email);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (!user.isVerified) {
        return { success: false, message: 'Email not verified' };
      }

      // Create session
      const sessionId = this.generateSessionId();
      const session: UserSession = {
        userId: user.id,
        sessionId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        lastActivity: Date.now(),
      };

      this.sessions.set(sessionId, session);
      await this.saveSessions();

      // Update user last login
      user.lastLoginAt = Date.now();
      this.users.set(user.id, user);
      await this.saveUsers();

      this.currentUserId = user.id;

      return { success: true, sessionId, user, message: 'Login successful' };

    } catch (error) {
      console.error('Failed to login user:', error);
      return { success: false, message: 'Login failed' };
    }
  }

  public async validateSession(sessionId: string): Promise<{ valid: boolean; user?: User; message: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { valid: false, message: 'Session not found' };
      }

      if (Date.now() > session.expiresAt) {
        this.sessions.delete(sessionId);
        await this.saveSessions();
        return { valid: false, message: 'Session expired' };
      }

      const user = this.users.get(session.userId);
      if (!user) {
        return { valid: false, message: 'User not found' };
      }

      // Update last activity
      session.lastActivity = Date.now();
      this.sessions.set(sessionId, session);
      await this.saveSessions();

      this.currentUserId = user.id;

      return { valid: true, user, message: 'Session valid' };

    } catch (error) {
      console.error('Failed to validate session:', error);
      return { valid: false, message: 'Session validation failed' };
    }
  }

  public async updateUserPreferences(userId: string, preferences: Partial<User['preferences']>): Promise<{ success: boolean; message: string }> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.preferences = { ...user.preferences, ...preferences };
      this.users.set(userId, user);
      await this.saveUsers();

      return { success: true, message: 'Preferences updated successfully' };

    } catch (error) {
      console.error('Failed to update preferences:', error);
      return { success: false, message: 'Failed to update preferences' };
    }
  }

  public async updateUserProfile(userId: string, profile: Partial<User['profile']>): Promise<{ success: boolean; message: string }> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.profile = { ...user.profile, ...profile };
      this.users.set(userId, user);
      await this.saveUsers();

      return { success: true, message: 'Profile updated successfully' };

    } catch (error) {
      console.error('Failed to update profile:', error);
      return { success: false, message: 'Failed to update profile' };
    }
  }

  public getCurrentUser(): User | null {
    if (!this.currentUserId) return null;
    return this.users.get(this.currentUserId) || null;
  }

  public async logout(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.sessions.delete(sessionId);
      await this.saveSessions();
      this.currentUserId = null;
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      console.error('Failed to logout:', error);
      return { success: false, message: 'Logout failed' };
    }
  }

  public async deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Delete user
      this.users.delete(userId);
      await this.saveUsers();

      // Delete user sessions
      const userSessions = Array.from(this.sessions.entries())
        .filter(([_, session]) => session.userId === userId);
      
      for (const [sessionId] of userSessions) {
        this.sessions.delete(sessionId);
      }
      await this.saveSessions();

      if (this.currentUserId === userId) {
        this.currentUserId = null;
      }

      return { success: true, message: 'User deleted successfully' };

    } catch (error) {
      console.error('Failed to delete user:', error);
      return { success: false, message: 'Failed to delete user' };
    }
  }

  private findUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(user => user.email === email.toLowerCase().trim());
  }

  private generateUserId(): string {
    return 'user_' + crypto.randomUUID();
  }

  private generateSessionId(): string {
    return 'session_' + crypto.randomUUID();
  }

  private setupCleanupInterval(): void {
    // Clean up expired sessions every hour
    setInterval(async () => {
      const now = Date.now();
      let hasChanges = false;

      for (const [sessionId, session] of this.sessions.entries()) {
        if (now > session.expiresAt) {
          this.sessions.delete(sessionId);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await this.saveSessions();
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  public async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  public async getUserStats(): Promise<{
    totalUsers: number;
    verifiedUsers: number;
    activeSessions: number;
    newUsersToday: number;
  }> {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const users = Array.from(this.users.values());
    const sessions = Array.from(this.sessions.values());

    return {
      totalUsers: users.length,
      verifiedUsers: users.filter(user => user.isVerified).length,
      activeSessions: sessions.filter(session => now < session.expiresAt).length,
      newUsersToday: users.filter(user => user.createdAt > oneDayAgo).length,
    };
  }
}
