/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Shared types for recording functionality
 * Used across main process, preload, and renderer
 */

/**
 * Selector strategy with confidence score
 */
export interface SelectorStrategy {
  strategy: 'id' | 'data-testid' | 'data-cy' | 'aria-label' | 'role' | 'text' | 'css' | 'xpath';
  selector: string;
  score: number; // 0-100, higher is more reliable
  description?: string;
}

/**
 * Enhanced target information with multiple selector strategies
 */
export interface ElementTarget {
  // Primary selector (best one)
  selector: string;
  
  // Multiple selector strategies for fallback
  selectors?: SelectorStrategy[];
  
  // Element identification
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  type?: string; // input type, button type, etc.
  
  // Semantic attributes
  role?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  title?: string;
  placeholder?: string;
  
  // Content
  text?: string;
  value?: string;
  href?: string; // for links
  
  // Data attributes (for testing)
  dataTestId?: string;
  dataCy?: string;
  
  // Visual properties
  boundingRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  isVisible?: boolean;
  
  // Computed properties
  isInteractive?: boolean; // Is this element clickable/interactive?
  interactiveParent?: ElementTarget; // If clicked element is non-interactive, this is the interactive parent
}

export interface RecordedAction {
  type: 'click' | 'input' | 'navigate' | 'keypress' | 'submit' | 'select' | 'checkbox' | 'radio' | 'toggle' | 'file-upload' | 'tab-switch';
  timestamp: number;
  target?: ElementTarget;
  value?: string | string[] | boolean;
  url?: string;
  position?: { x: number; y: number };
  metadata?: Record<string, any>;

  // Tab context - which tab this action occurred in
  tabId?: string;
  tabTitle?: string;
  tabUrl?: string;

  // Verification metadata (added by ActionRecorder)
  verified?: boolean;
  verificationTime?: number;
  effects?: ClickEffects;
}

/**
 * Comprehensive click effect tracking
 */
export interface ClickEffects {
  // Navigation effects
  navigation?: {
    occurred: boolean;
    url?: string;
    type?: 'full' | 'spa' | 'hash'; // Full page reload, SPA navigation, or hash change
    timing?: number; // ms after click
  };
  
  // Network activity
  network?: {
    requestCount: number;
    requests?: Array<{
      url: string;
      method: string;
      status?: number;
      type?: string; // xhr, fetch, document, etc.
      timing: number; // ms after click
    }>;
  };
  
  // DOM changes
  dom?: {
    mutationCount: number;
    addedNodes?: number;
    removedNodes?: number;
    attributeChanges?: number;
    significantChanges?: boolean; // Large structural changes
  };
  
  // Modal/Overlay/Dialog detection
  modal?: {
    appeared: boolean;
    type?: 'modal' | 'dialog' | 'dropdown' | 'popover' | 'sheet' | 'toast';
    selector?: string;
    role?: string;
    ariaLabel?: string;
    timing?: number;
  };
  
  // Form submission
  formSubmit?: {
    occurred: boolean;
    formSelector?: string;
    method?: string;
    action?: string;
    timing?: number;
  };
  
  // Element state changes
  stateChange?: {
    occurred: boolean;
    type?: 'toggle' | 'expand' | 'collapse' | 'select' | 'activate' | 'disable';
    targetChanged?: boolean; // Did the clicked element itself change?
    ariaExpanded?: boolean;
    ariaSelected?: boolean;
    ariaChecked?: boolean;
    classChanges?: string[]; // Classes added/removed
  };
  
  // Focus changes
  focus?: {
    changed: boolean;
    newFocusSelector?: string;
    newFocusTagName?: string;
  };
  
  // Scroll behavior
  scroll?: {
    occurred: boolean;
    direction?: 'vertical' | 'horizontal' | 'both';
    distance?: number;
  };
  
  // Download triggered
  download?: {
    occurred: boolean;
    filename?: string;
  };
  
  // New window/tab
  newWindow?: {
    occurred: boolean;
    url?: string;
  };
  
  // Summary
  summary?: string; // Human-readable effect description for LLM
}

export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  createdAt: number;
  duration: number; // in milliseconds
  actionCount: number;
  url?: string; // Starting URL
  
  // Multi-tab context
  tabs?: TabContext[]; // All tabs that were active during recording
  startTabId?: string; // Tab where recording started
  
  // Video recording metadata
  videoPath?: string; // Absolute path to the video file
  videoSize?: number; // Video file size in bytes
  videoFormat?: string; // Video format (e.g., 'webm')
  videoDuration?: number; // Actual video duration in milliseconds
}

/**
 * Tab context during recording
 * Tracks which tabs were used during the recording session
 */
export interface TabContext {
  tabId: string;
  title: string;
  url: string;
  firstAccessTime: number; // When this tab was first accessed during recording
  lastAccessTime: number; // When this tab was last accessed during recording
  actionCount: number; // Number of actions performed in this tab
}

// -------- USER MODEL --------

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

// -------- HISTORY MODEL --------

/**
 * History Entry
 * Represents a single browsing history entry
 */
export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitTime: number;
  visitCount: number;
  lastVisitTime: number;
  favicon?: string;
  typedCount: number; // How many times user typed this URL
  transition: HistoryTransition;
}

/**
 * History Transition Types
 * Similar to Chrome's transition types
 */
export enum HistoryTransition {
  LINK = 'link',           // User clicked a link
  TYPED = 'typed',         // User typed URL in address bar
  AUTO_BOOKMARK = 'auto_bookmark', // Auto-generated bookmark
  AUTO_SUBFRAME = 'auto_subframe', // Subframe navigation
  MANUAL_SUBFRAME = 'manual_subframe', // Manual subframe navigation
  GENERATED = 'generated', // Generated by browser
  RELOAD = 'reload',       // Page reload
  KEYWORD = 'keyword',     // Keyword search
  FORM_SUBMIT = 'form_submit', // Form submission
}

/**
 * History Query Options
 */
export interface HistoryQuery {
  text?: string;           // Search text
  startTime?: number;      // Start timestamp
  endTime?: number;        // End timestamp
  maxResults?: number;     // Maximum results to return
}

/**
 * History Stats
 */
export interface HistoryStats {
  totalEntries: number;
  totalVisits: number;
  topDomains: Array<{ domain: string; count: number }>;
  todayVisits: number;
  weekVisits: number;
}