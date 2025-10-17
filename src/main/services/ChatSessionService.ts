/**
 * ChatSessionService - Persistent storage for automation chat sessions
 * 
 * Uses SQLite for robust, scalable storage of conversation history
 * Similar to Cursor/Windsurf chat session management
 * 
 * Features:
 * - Full conversation history with timestamps
 * - Tool execution logs with inputs/outputs
 * - Token usage and cost tracking per iteration
 * - Powerful querying and filtering
 * - Handles thousands of sessions efficiently
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  ChatSession,
  ChatMessage,
  ToolExecution,
  SessionStats,
} from '@/shared/types';

// ============================================================================
// ChatSessionService
// ============================================================================

export class ChatSessionService {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    // Store in userData directory
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'chat-sessions');
    
    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.dbPath = path.join(dbDir, 'sessions.db');
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    this.initializeDatabase();
    console.log(`📦 ChatSessionService initialized: ${this.dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    // Chat sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        recording_session_id TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration INTEGER,
        iterations INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        summary TEXT,
        error TEXT
      )
    `);

    // Chat messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    // Tool executions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_executions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT,
        error TEXT,
        success INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON chat_sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON chat_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_tools_session_id ON tool_executions(session_id, iteration);
    `);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new chat session
   */
  public createSession(data: {
    id: string;
    title: string;
    recordingSessionId: string;
    userPrompt: string;
  }): ChatSession {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (
        id, title, recording_session_id, user_prompt, 
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'running', ?, ?)
    `);

    stmt.run(
      data.id,
      data.title,
      data.recordingSessionId,
      data.userPrompt,
      now,
      now
    );

    return this.getSession(data.id);
  }

  /**
   * Get session by ID
   */
  public getSession(id: string): ChatSession | null {
    const stmt = this.db.prepare(`
      SELECT 
        id, title, recording_session_id as recordingSessionId,
        user_prompt as userPrompt, status, created_at as createdAt,
        updated_at as updatedAt, completed_at as completedAt,
        duration, iterations, total_tokens as totalTokens,
        total_cost as totalCost, summary, error
      FROM chat_sessions
      WHERE id = ?
    `);

    return stmt.get(id) as ChatSession | null;
  }

  /**
   * Get all sessions (sorted by most recent)
   */
  public getAllSessions(limit = 100): ChatSession[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, title, recording_session_id as recordingSessionId,
        user_prompt as userPrompt, status, created_at as createdAt,
        updated_at as updatedAt, completed_at as completedAt,
        duration, iterations, total_tokens as totalTokens,
        total_cost as totalCost, summary, error
      FROM chat_sessions
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as ChatSession[];
  }

  /**
   * Get sessions by status
   */
  public getSessionsByStatus(status: ChatSession['status'], limit = 100): ChatSession[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, title, recording_session_id as recordingSessionId,
        user_prompt as userPrompt, status, created_at as createdAt,
        updated_at as updatedAt, completed_at as completedAt,
        duration, iterations, total_tokens as totalTokens,
        total_cost as totalCost, summary, error
      FROM chat_sessions
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(status, limit) as ChatSession[];
  }

  /**
   * Update session status and metadata
   */
  public updateSession(id: string, updates: Partial<ChatSession>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (updates.duration !== undefined) {
      fields.push('duration = ?');
      values.push(updates.duration);
    }
    if (updates.iterations !== undefined) {
      fields.push('iterations = ?');
      values.push(updates.iterations);
    }
    if (updates.totalTokens !== undefined) {
      fields.push('total_tokens = ?');
      values.push(updates.totalTokens);
    }
    if (updates.totalCost !== undefined) {
      fields.push('total_cost = ?');
      values.push(updates.totalCost);
    }
    if (updates.summary !== undefined) {
      fields.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE chat_sessions
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Delete session and all related data
   */
  public deleteSession(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get session statistics
   */
  public getStats(): SessionStats {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalSessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedSessions,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedSessions,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost
      FROM chat_sessions
    `);

    return stmt.get() as SessionStats;
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  /**
   * Add a message to session
   */
  public addMessage(data: {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: any;  // Will be JSON stringified
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, role, content, timestamp,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.sessionId,
      data.role,
      JSON.stringify(data.content),
      Date.now(),
      data.inputTokens || null,
      data.outputTokens || null,
      data.cacheCreationTokens || null,
      data.cacheReadTokens || null
    );
  }

  /**
   * Get all messages for a session
   */
  public getMessages(sessionId: string): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, session_id as sessionId, role, content, timestamp,
        input_tokens as inputTokens, output_tokens as outputTokens,
        cache_creation_tokens as cacheCreationTokens,
        cache_read_tokens as cacheReadTokens
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(sessionId) as ChatMessage[];
  }

  // ============================================================================
  // Tool Execution Management
  // ============================================================================

  /**
   * Add a tool execution record
   */
  public addToolExecution(data: {
    id: string;
    sessionId: string;
    iteration: number;
    toolName: string;
    input: any;  // Will be JSON stringified
    output?: any;  // Will be JSON stringified
    error?: string;
    success: boolean;
    duration?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (
        id, session_id, iteration, tool_name, input, output, error,
        success, timestamp, duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.sessionId,
      data.iteration,
      data.toolName,
      JSON.stringify(data.input),
      data.output ? JSON.stringify(data.output) : null,
      data.error || null,
      data.success ? 1 : 0,
      Date.now(),
      data.duration || null
    );
  }

  /**
   * Get all tool executions for a session
   */
  public getToolExecutions(sessionId: string): ToolExecution[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, session_id as sessionId, iteration, tool_name as toolName,
        input, output, error, success, timestamp, duration
      FROM tool_executions
      WHERE session_id = ?
      ORDER BY iteration ASC, timestamp ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    return rows.map(row => ({
      ...row,
      success: row.success === 1
    }));
  }

  /**
   * Get tool executions for a specific iteration
   */
  public getToolExecutionsByIteration(sessionId: string, iteration: number): ToolExecution[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, session_id as sessionId, iteration, tool_name as toolName,
        input, output, error, success, timestamp, duration
      FROM tool_executions
      WHERE session_id = ? AND iteration = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(sessionId, iteration) as any[];
    return rows.map(row => ({
      ...row,
      success: row.success === 1
    }));
  }

  // ============================================================================
  // Complete Session Data
  // ============================================================================

  /**
   * Get complete session data (session + messages + tool executions)
   */
  public getCompleteSession(sessionId: string): {
    session: ChatSession | null;
    messages: ChatMessage[];
    toolExecutions: ToolExecution[];
  } {
    return {
      session: this.getSession(sessionId),
      messages: this.getMessages(sessionId),
      toolExecutions: this.getToolExecutions(sessionId)
    };
  }

  /**
   * Export session to JSON (for backup/analysis)
   */
  public exportSession(sessionId: string): any {
    const data = this.getCompleteSession(sessionId);
    
    if (!data.session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      session: data.session,
      messages: data.messages.map(m => ({
        ...m,
        content: JSON.parse(m.content)
      })),
      toolExecutions: data.toolExecutions.map(t => ({
        ...t,
        input: JSON.parse(t.input),
        output: t.output ? JSON.parse(t.output) : null
      }))
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Delete old sessions (keep last N days)
   */
  public deleteOldSessions(daysToKeep: number): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      DELETE FROM chat_sessions
      WHERE created_at < ?
    `);

    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}
