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
  type: 'click' | 'input' | 'navigate' | 'keypress' | 'submit' | 'select' | 'checkbox' | 'radio' | 'toggle' | 'file-upload';
  timestamp: number;
  target?: ElementTarget;
  value?: string | string[] | boolean;
  url?: string;
  position?: { x: number; y: number };
  metadata?: Record<string, any>;

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
  
  // Video recording metadata
  video?: VideoRecordingMetadata;
}

/**
 * Video Recording Metadata
 * Contains information about the screen recording
 */
export interface VideoRecordingMetadata {
  // File information
  filePath: string;           // Absolute path to video file
  fileName: string;           // Video file name
  fileSize: number;           // Size in bytes
  
  // Video properties
  format: 'webm' | 'mp4';     // Video format
  codec: string;              // Video codec (e.g., 'vp8', 'vp9', 'h264')
  duration: number;           // Video duration in milliseconds
  fps: number;                // Frames per second
  
  // Recording metadata
  startTimestamp: number;     // When recording started (Unix timestamp)
  endTimestamp: number;       // When recording ended (Unix timestamp)
  
  // Display information
  displayInfo: {
    width: number;            // Video width
    height: number;           // Video height
    scaleFactor: number;      // Display scale factor
  };
  
  // Status
  status: 'recording' | 'completed' | 'failed' | 'processing';
  error?: string;             // Error message if failed
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