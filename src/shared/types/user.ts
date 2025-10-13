/**
 * User Model
 * Represents a user with all standard attributes
 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isVerified: boolean;

  createdAt: number;
  verifiedAt?: number;
  lastLoginAt?: number;
  
  subscription: Subscription;
  preferences: UserPreferences;
  metadata?: Record<string, unknown>;
}

/**
 * Session Model
 * Represents an active user session
 */
export interface Session {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  deviceInfo?: {
    platform: string;
    version: string;
  };
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum SubscriptionPlan {
  FREE = 'free',
  PREMIUM = 'premium',
}

export interface Subscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  startnumber?: number;
  endnumber?: number;
  trialEndsAt?: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
}