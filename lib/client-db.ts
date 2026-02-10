'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import {
  createCollection,
  useLiveQuery,
  eq,
} from '@tanstack/react-db';
import type { SyncConfig } from '@tanstack/react-db';
import type { PendingMutation } from '@tanstack/react-db';
import { DEFAULT_AGENTS, getAgentMetadata } from '@/agents';
import type { AgentCategory } from '@/agents';

export interface Member {
  id: string;
  role: string;
  name: string;
  avatar: string | null;
  profile_image: string | null;
  system_prompt: string;
  is_default: number;
  can_generate_images: number;
  can_log_screenshots: number;
  preferred_provider: 'claude' | 'opencode' | 'codex';
  source_market_agent_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface MarketAgent {
  id: string;
  role: string;
  name: string;
  avatar: string;
  profile_image: string | null;
  system_prompt: string;
  description: string;
  category: AgentCategory;
  tags: string[];
  is_builtin: number;
  can_generate_images: number;
  can_log_screenshots: number;
  preferred_provider: 'claude' | 'opencode' | 'codex';
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEED_FIX' | 'COMPLETE' | 'ON_HOLD';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignee_ids: string[];  // Multi-assignee support
  project_id: string | null;
  created_by: string | null;
  order_index: number;
  enable_screenshot: number;  // 0: 비활성화 (기본값), 1: 활성화
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  ticket_id: string;
  member_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  details: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AgentWorkLog {
  id: string;
  ticket_id: string;
  agent_id: string;
  project_id: string;
  command: string;
  prompt: string | null;
  output: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  git_commit_hash: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface Conversation {
  id: string;
  ticket_id: string;
  agent_id: string;
  provider: 'claude' | 'opencode' | 'codex';
  prompt: string | null;
  feedback: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  git_commit_hash: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  content: string;
  message_type: 'log' | 'error' | 'success' | 'system';
  created_at: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
  current_node_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNode {
  id: string;
  workflow_id: string;
  ticket_id: string;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  created_at: string;
}

export interface PmRequest {
  id: string;
  project_id: string;
  request_type: 'breakdown' | 'ask';
  request_content: string;
  response_content: string | null;
  provider: 'claude' | 'opencode' | 'codex';
  tasks_created: number;
  workflow_id: string | null;
  selected_member_ids: string[];
  created_at: string;
}

const DB_NAME = 'olly-molly';
const DB_VERSION = 4;
const DEBUG_STORAGE_KEY = 'olly-molly-debug';

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG SYSTEM
// Toggle with keyboard shortcut: Ctrl+Shift+D (or Cmd+Shift+D on Mac)
// Or in console: window.toggleOllyDebug()
// ═══════════════════════════════════════════════════════════════════════════

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
}

function setDebugEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? 'true' : 'false');
}

function dbDebug(step: string, message: string, data?: unknown) {
  if (!isDebugEnabled()) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[db:${step}]`;
  if (data !== undefined) {
    console.log(`${timestamp} ${prefix} ${message}`, data);
  } else {
    console.log(`${timestamp} ${prefix} ${message}`);
  }
}

// Toggle function exposed to window for console access
function toggleOllyDebug(): boolean {
  const newState = !isDebugEnabled();
  setDebugEnabled(newState);
  const status = newState ? '🟢 ON' : '🔴 OFF';
  console.log(`%c[Olly-Molly Debug] ${status}`, 'font-size: 14px; font-weight: bold;');
  if (newState) {
    console.log('%cDebug logs will appear for DB operations. Press Ctrl+Shift+D to toggle off.', 'color: gray;');
  }
  return newState;
}

// Setup keyboard shortcut and expose toggle function
if (typeof window !== 'undefined') {
  // Expose to window for console access
  (window as unknown as { toggleOllyDebug: typeof toggleOllyDebug }).toggleOllyDebug = toggleOllyDebug;

  // Keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleOllyDebug();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION STATE
// ═══════════════════════════════════════════════════════════════════════════
let isDbInitialized = false;
let initStartTime = 0;

// NOTE: BroadcastChannel (cross-tab sync) has been removed.
// Reason: During workflow execution, frequent updates caused IndexedDB contention,
// blocking new tabs from connecting. Server polling handles data synchronization instead.

const STORE_NAMES = {
  members: 'members',
  marketAgents: 'market_agents',
  tickets: 'tickets',
  activityLogs: 'activity_logs',
  projects: 'projects',
  agentWorkLogs: 'agent_work_logs',
  conversations: 'conversations',
  conversationMessages: 'conversation_messages',
  workflows: 'workflows',
  workflowNodes: 'workflow_nodes',
  workflowEdges: 'workflow_edges',
  pmRequests: 'pm_requests',
  sqliteDump: 'sqlite_dump',
  meta: 'meta',
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

let dbPromise: Promise<IDBPDatabase> | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// LAZY WRITE QUEUE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
// Instead of writing to IndexedDB on every change, we batch writes with debouncing.
// This prevents IndexedDB blocking when multiple tabs are active.
// ═══════════════════════════════════════════════════════════════════════════

const LAZY_WRITE_DEBOUNCE_MS = 3000; // 3 seconds debounce
const LAZY_WRITE_MAX_WAIT_MS = 10000; // Max 10 seconds before forced flush

interface PendingWrite {
  type: 'put' | 'delete';
  storeName: StoreName;
  key: string;
  value?: unknown;
  timestamp: number;
}

// Pending writes queue - keyed by "storeName:key" to dedupe
const pendingWrites = new Map<string, PendingWrite>();
let lazyWriteTimer: number | null = null;
let lazyWriteFirstPending: number | null = null;
let isFlushingWrites = false;

function dbDebugLazy(message: string, data?: unknown) {
  if (!isDebugEnabled()) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  if (data !== undefined) {
    console.log(`${timestamp} [db:lazy-write] ${message}`, data);
  } else {
    console.log(`${timestamp} [db:lazy-write] ${message}`);
  }
}

/**
 * Queue a write operation (debounced)
 */
function queueWrite(storeName: StoreName, key: string, value: unknown, type: 'put' | 'delete' = 'put'): void {
  const writeKey = `${storeName}:${key}`;
  const now = Date.now();

  // Track first pending time for max wait
  if (lazyWriteFirstPending === null) {
    lazyWriteFirstPending = now;
  }

  pendingWrites.set(writeKey, {
    type,
    storeName,
    key,
    value: type === 'put' ? value : undefined,
    timestamp: now,
  });

  // Clear existing timer
  if (lazyWriteTimer !== null) {
    window.clearTimeout(lazyWriteTimer);
  }

  // Check if we've waited too long (max wait exceeded)
  const waitedMs = now - lazyWriteFirstPending;
  if (waitedMs >= LAZY_WRITE_MAX_WAIT_MS) {
    dbDebugLazy(`Max wait exceeded (${waitedMs}ms), flushing ${pendingWrites.size} writes`);
    void flushPendingWrites();
    return;
  }

  // Schedule debounced flush
  lazyWriteTimer = window.setTimeout(() => {
    lazyWriteTimer = null;
    void flushPendingWrites();
  }, LAZY_WRITE_DEBOUNCE_MS);
}

/**
 * Flush all pending writes to IndexedDB
 */
async function flushPendingWrites(): Promise<void> {
  if (pendingWrites.size === 0) return;
  if (isFlushingWrites) {
    dbDebugLazy('Already flushing, skipping');
    return;
  }

  isFlushingWrites = true;
  const startTime = Date.now();
  const writeCount = pendingWrites.size;

  // Copy and clear the queue
  const writes = Array.from(pendingWrites.values());
  pendingWrites.clear();
  lazyWriteFirstPending = null;

  dbDebugLazy(`Flushing ${writeCount} pending writes...`);

  try {
    const db = await getIdb();

    // Group writes by store for efficient transactions
    const byStore = new Map<StoreName, PendingWrite[]>();
    for (const write of writes) {
      const storeWrites = byStore.get(write.storeName) || [];
      storeWrites.push(write);
      byStore.set(write.storeName, storeWrites);
    }

    // Process each store in a single transaction
    for (const [storeName, storeWrites] of byStore) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const write of storeWrites) {
        if (write.type === 'put') {
          store.put(write.value);
        } else {
          store.delete(write.key);
        }
      }

      await tx.done;
    }

    const elapsed = Date.now() - startTime;
    dbDebugLazy(`✓ Flushed ${writeCount} writes in ${elapsed}ms (${byStore.size} stores)`);

  } catch (error) {
    dbDebugLazy(`❌ Flush failed:`, error);
    // Re-queue failed writes for retry
    for (const write of writes) {
      const writeKey = `${write.storeName}:${write.key}`;
      if (!pendingWrites.has(writeKey)) {
        pendingWrites.set(writeKey, write);
      }
    }
  } finally {
    isFlushingWrites = false;
  }
}

/**
 * Force flush all pending writes (sync, for beforeunload)
 */
function flushPendingWritesSync(): void {
  if (pendingWrites.size === 0) return;

  dbDebugLazy(`Sync flush on beforeunload: ${pendingWrites.size} writes`);

  // Use sync IndexedDB API via navigator.sendBeacon workaround
  // Actually, we'll just trigger the async flush and hope it completes
  // For reliability, we also save to localStorage as emergency backup
  try {
    const writes = Array.from(pendingWrites.values());
    const emergencyBackup = JSON.stringify(writes);
    localStorage.setItem('olly-molly-pending-writes', emergencyBackup);
    dbDebugLazy(`Emergency backup saved: ${writes.length} writes`);
  } catch (e) {
    // localStorage might be full, ignore
  }

  // Trigger async flush (may or may not complete before tab closes)
  void flushPendingWrites();
}

/**
 * Restore any emergency backup writes from localStorage
 */
async function restoreEmergencyWrites(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const backup = localStorage.getItem('olly-molly-pending-writes');
    if (!backup) return;

    const writes: PendingWrite[] = JSON.parse(backup);
    if (!Array.isArray(writes) || writes.length === 0) {
      localStorage.removeItem('olly-molly-pending-writes');
      return;
    }

    dbDebugLazy(`Restoring ${writes.length} emergency writes`);

    const db = await getIdb();
    for (const write of writes) {
      if (write.type === 'put' && write.value) {
        await db.put(write.storeName, write.value);
      } else if (write.type === 'delete') {
        await db.delete(write.storeName, write.key);
      }
    }

    localStorage.removeItem('olly-molly-pending-writes');
    dbDebugLazy(`✓ Emergency writes restored`);
  } catch (e) {
    dbDebugLazy(`Emergency restore failed:`, e);
    localStorage.removeItem('olly-molly-pending-writes');
  }
}

/**
 * Get count of pending writes (for debugging/monitoring)
 */
export function getPendingWritesCount(): number {
  return pendingWrites.size;
}

/**
 * Force flush all pending writes immediately
 * Call this before critical operations or when you need writes to be persisted
 */
export async function forceFlushWrites(): Promise<void> {
  dbDebugLazy(`Force flush requested: ${pendingWrites.size} pending writes`);
  await flushPendingWrites();
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as {
    ollyDbStatus: () => { pendingWrites: number; isFlushingWrites: boolean };
    ollyForceFlush: () => Promise<void>;
  }).ollyDbStatus = () => ({
    pendingWrites: pendingWrites.size,
    isFlushingWrites,
  });
  (window as unknown as { ollyForceFlush: () => Promise<void> }).ollyForceFlush = forceFlushWrites;
}

// Setup beforeunload handler
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingWritesSync();
  });

  // Also flush on visibilitychange (tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingWrites.size > 0) {
      dbDebugLazy(`Tab hidden, flushing ${pendingWrites.size} writes`);
      void flushPendingWrites();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════

const DB_BACKUP_VERSION = 1;
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const BACKUP_STORE_NAMES: StoreName[] = [
  STORE_NAMES.members,
  STORE_NAMES.marketAgents,
  STORE_NAMES.tickets,
  STORE_NAMES.activityLogs,
  STORE_NAMES.projects,
  STORE_NAMES.agentWorkLogs,
  STORE_NAMES.conversations,
  STORE_NAMES.conversationMessages,
  STORE_NAMES.workflows,
  STORE_NAMES.workflowNodes,
  STORE_NAMES.workflowEdges,
  STORE_NAMES.pmRequests,
  STORE_NAMES.meta,
];

export type DbBackup = {
  version: number;
  exported_at: string;
  stores: Record<string, unknown[]>;
};

export async function exportDbBackup(): Promise<DbBackup> {
  const db = await getIdb();
  const stores: Record<string, unknown[]> = {};
  await Promise.all(
    BACKUP_STORE_NAMES.map(async (storeName) => {
      stores[storeName] = await db.getAll(storeName);
    }),
  );
  return {
    version: DB_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    stores,
  };
}

export async function importDbBackup(backup: DbBackup): Promise<void> {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup file.');
  }
  if (backup.version !== DB_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  const db = await getIdb();
  const tx = db.transaction(BACKUP_STORE_NAMES, 'readwrite');
  await Promise.all(
    BACKUP_STORE_NAMES.map(async (storeName) => {
      const store = tx.objectStore(storeName);
      await store.clear();
      const rows = Array.isArray(backup.stores?.[storeName]) ? backup.stores[storeName] : [];
      await Promise.all(rows.map((row) => store.put(row)));
    }),
  );
  await tx.done;
}

let autoBackupTimer: number | null = null;

export function startAutoBackup(): void {
  if (typeof window === 'undefined') return;
  if (autoBackupTimer) return;

  const run = async () => {
    try {
      const backup = await exportDbBackup();
      const email = await userSettingsService.getEmail();
      const payload: Record<string, unknown> = { ...backup };
      if (email) {
        payload._email = email;
      }
      await fetch('/api/db/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn('[db] Auto backup failed', error);
    }
  };

  void run();
  autoBackupTimer = window.setInterval(run, AUTO_BACKUP_INTERVAL_MS);
}

function getIdb(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in the browser.'));
  }
  if (!dbPromise) {
    dbDebug('idb', 'Opening IndexedDB connection...');
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        dbDebug('idb', `Upgrading DB from v${oldVersion} to v${newVersion}`);
        if (!db.objectStoreNames.contains(STORE_NAMES.members)) {
          db.createObjectStore(STORE_NAMES.members, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.marketAgents)) {
          db.createObjectStore(STORE_NAMES.marketAgents, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.tickets)) {
          db.createObjectStore(STORE_NAMES.tickets, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.activityLogs)) {
          db.createObjectStore(STORE_NAMES.activityLogs, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.projects)) {
          db.createObjectStore(STORE_NAMES.projects, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.agentWorkLogs)) {
          db.createObjectStore(STORE_NAMES.agentWorkLogs, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.conversations)) {
          db.createObjectStore(STORE_NAMES.conversations, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.conversationMessages)) {
          db.createObjectStore(STORE_NAMES.conversationMessages, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.workflows)) {
          db.createObjectStore(STORE_NAMES.workflows, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.workflowNodes)) {
          db.createObjectStore(STORE_NAMES.workflowNodes, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.workflowEdges)) {
          db.createObjectStore(STORE_NAMES.workflowEdges, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.pmRequests)) {
          db.createObjectStore(STORE_NAMES.pmRequests, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.sqliteDump)) {
          db.createObjectStore(STORE_NAMES.sqliteDump, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.meta)) {
          db.createObjectStore(STORE_NAMES.meta, { keyPath: 'id' });
        }
      },
      blocked(currentVersion, blockedVersion) {
        // Another tab has an older version open and won't close
        dbDebug('idb', `⚠️ BLOCKED! Current: v${currentVersion}, Blocked by: v${blockedVersion}`);
        console.warn('[db] IndexedDB blocked by another tab. Please close other tabs or refresh them.');
      },
      blocking(currentVersion, blockedVersion) {
        // This tab is blocking another tab from upgrading
        dbDebug('idb', `⚠️ BLOCKING another tab! Current: v${currentVersion}, Other wants: v${blockedVersion}`);
        // Close our connection to unblock the other tab
        dbPromise?.then(db => db.close());
        dbPromise = null;
      },
      terminated() {
        dbDebug('idb', '❌ Connection terminated unexpectedly');
        dbPromise = null;
      },
    });
    dbPromise.then(() => {
      dbDebug('idb', '✓ IndexedDB connection established');
    }).catch((err) => {
      dbDebug('idb', '❌ IndexedDB connection failed:', err);
    });
  }
  return dbPromise;
}

type IndexedDbSync<T extends { id: string }> = SyncConfig<T> & {
  confirmOperationsSync: (mutations: Array<PendingMutation<T>>) => void;
};

function createIndexedDbSync<T extends { id: string }>(
  storeName: StoreName,
  options?: { lazySync?: boolean },
): IndexedDbSync<T> {
  let syncParams: Parameters<SyncConfig<T>['sync']>[0] | null = null;
  const lazySync = options?.lazySync ?? false;

  const confirmOperationsSync = (mutations: Array<PendingMutation<T>>) => {
    if (!syncParams) return;
    const { begin, write, commit } = syncParams;
    begin();
    mutations.forEach((mutation) => {
      if (mutation.type === 'delete') {
        write({ type: 'delete', key: mutation.key });
        return;
      }
      write({ type: mutation.type, value: mutation.modified });
    });
    commit();
  };

  return {
    sync: (params) => {
      syncParams = params;
      let cancelled = false;
      dbDebug('sync', `[${storeName}] sync() called${lazySync ? ' (LAZY)' : ''}`);

      // Lazy sync: skip initial data load, just mark ready immediately
      // Data will be loaded on-demand via syncFromServer
      if (lazySync) {
        dbDebug('sync', `[${storeName}] Lazy sync - skipping initial load, markReady()`);
        params.markReady();
        return () => { cancelled = true; };
      }

      void (async () => {
        try {
          dbDebug('sync', `[${storeName}] Opening IndexedDB...`);
          const db = await getIdb();
          dbDebug('sync', `[${storeName}] IndexedDB opened, fetching rows...`);

          const rows = await db.getAll(storeName);
          dbDebug('sync', `[${storeName}] Got ${rows.length} rows`);

          if (cancelled) {
            dbDebug('sync', `[${storeName}] CANCELLED`);
            return;
          }
          if (rows.length === 0) {
            dbDebug('sync', `[${storeName}] Empty, calling markReady()`);
            params.markReady();
            return;
          }
          params.begin();
          rows.forEach((row) => params.write({ type: 'insert', value: row }));
          params.commit();
          dbDebug('sync', `[${storeName}] Data written, calling markReady()`);
          params.markReady();
        } catch (error) {
          console.error(`[db] Failed to load ${storeName} from IndexedDB`, error);
          dbDebug('sync', `[${storeName}] ERROR - calling markReady() anyway`);
          params.markReady();
        }
      })();

      return () => {
        cancelled = true;
      };
    },
    confirmOperationsSync,
  };
}

let sqliteDumpTimer: number | null = null;
let sqliteDumpEnabled = false; // DISABLED by default - causes IndexedDB blocking with multiple tabs

function scheduleSqliteDump() {
  // DISABLED: Multiple tabs writing to sqlite_dump simultaneously causes IndexedDB blocking
  // SQL dump is only needed for data export, not real-time. Use manual backup instead.
  if (!sqliteDumpEnabled) return;

  if (typeof window === 'undefined') return;
  if (sqliteDumpTimer) {
    window.clearTimeout(sqliteDumpTimer);
  }
  // 10 second debounce to prevent frequent writes
  sqliteDumpTimer = window.setTimeout(() => {
    sqliteDumpTimer = null;
    void persistSqliteDump();
  }, 10000);
}

// Enable/disable sqlite dump (for debugging)
export function setSqliteDumpEnabled(enabled: boolean): void {
  sqliteDumpEnabled = enabled;
  dbDebug('sqliteDump', `SQL dump ${enabled ? 'enabled' : 'disabled'}`);
}

// Manual trigger for sqlite dump (for backup export)
export async function triggerSqliteDump(): Promise<void> {
  await persistSqliteDump();
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${sqlEscape(String(value))}'`;
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  profile_image TEXT,
  system_prompt TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  can_generate_images INTEGER DEFAULT 0,
  can_log_screenshots INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'NEED_FIX', 'COMPLETE', 'ON_HOLD')),
  priority TEXT DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  assignee_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  created_by TEXT,
  order_index REAL DEFAULT 0,
  enable_screenshot INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_work_logs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  command TEXT NOT NULL,
  prompt TEXT,
  output TEXT,
  status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  git_commit_hash TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES members(id),
  provider TEXT NOT NULL CHECK(provider IN ('claude', 'opencode', 'codex')),
  prompt TEXT,
  feedback TEXT,
  status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
  git_commit_hash TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'log' CHECK(message_type IN ('log', 'error', 'success', 'system')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`.trim();

async function persistSqliteDump() {
  const startTime = Date.now();
  dbDebug('sqliteDump', 'Starting persistSqliteDump...');
  try {
    const db = await getIdb();
    const members = Array.from(membersCollection.values()) as unknown as Member[];
    const tickets = Array.from(ticketsCollection.values()) as unknown as Ticket[];
    const activityLogs = Array.from(activityLogsCollection.values()) as unknown as ActivityLog[];
    const projects = Array.from(projectsCollection.values()) as unknown as Project[];
    const agentWorkLogs = Array.from(agentWorkLogsCollection.values()) as unknown as AgentWorkLog[];
    const conversations = Array.from(conversationsCollection.values()) as unknown as Conversation[];
    // NOTE: conversation_messages excluded from SQL dump to reduce size and prevent IndexedDB blocking.
    // Messages are already stored in IndexedDB separately and don't need SQL backup.

    dbDebug('sqliteDump', `Data counts: members=${members.length}, tickets=${tickets.length}, logs=${activityLogs.length}, convs=${conversations.length}`);

    const chunks: string[] = ['BEGIN;', SQLITE_SCHEMA];

    const insertRows = <T extends object>(table: string, columns: Array<keyof T>, rows: T[]) => {
      if (rows.length === 0) return;
      const columnList = columns.map((col) => String(col)).join(', ');
      rows.forEach((row) => {
        const values = columns.map((col) => sqlValue((row as Record<string, unknown>)[String(col)]));
        chunks.push(`INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${values.join(', ')});`);
      });
    };

    insertRows<Member>('members', [
      'id',
      'role',
      'name',
      'avatar',
      'profile_image',
      'system_prompt',
      'is_default',
      'can_generate_images',
      'can_log_screenshots',
      'created_at',
      'updated_at',
    ], members);

    insertRows<Project>('projects', [
      'id',
      'name',
      'path',
      'description',
      'is_active',
      'created_at',
      'updated_at',
    ], projects);

    insertRows<Ticket>('tickets', [
      'id',
      'title',
      'description',
      'status',
      'priority',
      'assignee_ids',
      'project_id',
      'created_by',
      'order_index',
      'enable_screenshot',
      'created_at',
      'updated_at',
    ], tickets.map(t => ({
      ...t,
      assignee_ids: JSON.stringify(t.assignee_ids || []),
      enable_screenshot: t.enable_screenshot ?? 0,
    } as any)));

    insertRows<ActivityLog>('activity_logs', [
      'id',
      'ticket_id',
      'member_id',
      'action',
      'old_value',
      'new_value',
      'details',
      'created_at',
    ], activityLogs);

    insertRows<AgentWorkLog>('agent_work_logs', [
      'id',
      'ticket_id',
      'agent_id',
      'project_id',
      'command',
      'prompt',
      'output',
      'status',
      'git_commit_hash',
      'started_at',
      'completed_at',
      'duration_ms',
    ], agentWorkLogs);

    insertRows<Conversation>('conversations', [
      'id',
      'ticket_id',
      'agent_id',
      'provider',
      'prompt',
      'feedback',
      'status',
      'git_commit_hash',
      'started_at',
      'completed_at',
      'created_at',
    ], conversations);

    // conversation_messages intentionally excluded - too large and causes IndexedDB blocking

    chunks.push('COMMIT;');

    const sqlSize = chunks.join('\n').length;
    dbDebug('sqliteDump', `SQL size: ${(sqlSize / 1024).toFixed(1)}KB, writing to IndexedDB...`);

    await db.put(STORE_NAMES.sqliteDump, {
      id: 'main',
      sql: chunks.join('\n'),
      updated_at: new Date().toISOString(),
    });

    const elapsed = Date.now() - startTime;
    dbDebug('sqliteDump', `✓ Completed in ${elapsed}ms`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    dbDebug('sqliteDump', `❌ Failed after ${elapsed}ms:`, error);
  }
}

function createIndexedDbCollection<T extends { id: string }>(storeName: StoreName) {
  const sync = createIndexedDbSync<T>(storeName);
  return createCollection<T>({
    id: storeName,
    getKey: (item) => item.id,
    sync,
    onInsert: async ({ transaction }) => {
      // Use lazy write queue instead of immediate IndexedDB write
      for (const mutation of transaction.mutations) {
        queueWrite(storeName, (mutation.modified as { id: string }).id, mutation.modified, 'put');
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        queueWrite(storeName, (mutation.modified as { id: string }).id, mutation.modified, 'put');
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
    onDelete: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        queueWrite(storeName, mutation.key as string, undefined, 'delete');
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
  });
}

function createIndexedDbCollectionWithOptions<T extends { id: string }>(
  storeName: StoreName,
  options?: { scheduleSqliteDump?: boolean; lazySync?: boolean; lazyWrite?: boolean },
) {
  const shouldScheduleSqliteDump = options?.scheduleSqliteDump ?? true;
  const lazySync = options?.lazySync ?? false;
  const lazyWrite = options?.lazyWrite ?? true; // Default to lazy write for better multi-tab performance
  const sync = createIndexedDbSync<T>(storeName, { lazySync });

  return createCollection<T>({
    id: storeName,
    getKey: (item) => item.id,
    sync,
    onInsert: async ({ transaction }) => {
      if (lazyWrite) {
        // Use lazy write queue (debounced, batched)
        for (const mutation of transaction.mutations) {
          queueWrite(storeName, (mutation.modified as { id: string }).id, mutation.modified, 'put');
        }
      } else {
        // Immediate write (old behavior)
        const db = await getIdb();
        await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
    onUpdate: async ({ transaction }) => {
      if (lazyWrite) {
        for (const mutation of transaction.mutations) {
          queueWrite(storeName, (mutation.modified as { id: string }).id, mutation.modified, 'put');
        }
      } else {
        const db = await getIdb();
        await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
    onDelete: async ({ transaction }) => {
      if (lazyWrite) {
        for (const mutation of transaction.mutations) {
          queueWrite(storeName, mutation.key as string, undefined, 'delete');
        }
      } else {
        const db = await getIdb();
        await Promise.all(transaction.mutations.map((mutation) => db.delete(storeName, mutation.key as string)));
      }
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
  });
}

/**
 * Create a MEMORY-ONLY collection (no IndexedDB persistence).
 * Used for data that is already persisted on the server (conversations, messages).
 * This prevents IndexedDB blocking when workflow is running in another tab.
 */
function createMemoryOnlyCollection<T extends { id: string }>(collectionId: string) {
  // Store syncParams to confirm operations (required for TanStack DB reactivity)
  let syncParams: Parameters<SyncConfig<T>['sync']>[0] | null = null;

  const confirmOperationsSync = (mutations: Array<PendingMutation<T>>) => {
    if (!syncParams) return;
    const { begin, write, commit } = syncParams;
    begin();
    mutations.forEach((mutation) => {
      if (mutation.type === 'delete') {
        write({ type: 'delete', key: mutation.key });
        return;
      }
      write({ type: mutation.type, value: mutation.modified });
    });
    commit();
  };

  const memoryOnlySync: SyncConfig<T> = {
    sync: (params) => {
      syncParams = params;
      // Mark ready immediately - no data to load from IndexedDB
      dbDebug('sync', `[${collectionId}] Memory-only collection - markReady()`);
      params.markReady();
      return () => {}; // cleanup function
    },
  };

  return createCollection<T>({
    id: collectionId,
    getKey: (item) => item.id,
    sync: memoryOnlySync,
    // Confirm operations for TanStack DB reactivity, but DON'T write to IndexedDB
    onInsert: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      // No IndexedDB write
    },
    onUpdate: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      // No IndexedDB write
    },
    onDelete: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      // No IndexedDB write
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL COLLECTIONS USE LAZY SYNC
// ═══════════════════════════════════════════════════════════════════════════
// When multiple tabs are active, new tabs can experience 10+ second delays
// connecting to IndexedDB due to browser-level throttling/queueing.
// Lazy sync skips initial data load, allowing the app to start immediately.
// Data is loaded in the background after initialization.
// ═══════════════════════════════════════════════════════════════════════════
const membersCollection = createIndexedDbCollectionWithOptions<Member>(
  STORE_NAMES.members,
  { lazySync: true },
);
const marketAgentsCollection = createIndexedDbCollectionWithOptions<MarketAgent>(
  STORE_NAMES.marketAgents,
  { lazySync: true },
);
const ticketsCollection = createIndexedDbCollectionWithOptions<Ticket>(
  STORE_NAMES.tickets,
  { lazySync: true },
);
const activityLogsCollection = createIndexedDbCollectionWithOptions<ActivityLog>(
  STORE_NAMES.activityLogs,
  { lazySync: true },
);
const projectsCollection = createIndexedDbCollectionWithOptions<Project>(
  STORE_NAMES.projects,
  { lazySync: true },
);
const agentWorkLogsCollection = createIndexedDbCollectionWithOptions<AgentWorkLog>(
  STORE_NAMES.agentWorkLogs,
  { lazySync: true },
);
// ═══════════════════════════════════════════════════════════════════════════
// MEMORY-ONLY COLLECTIONS (no IndexedDB persistence)
// ═══════════════════════════════════════════════════════════════════════════
// Conversations and messages are stored on the server (server-store.ts).
// Browser fetches via polling and keeps in memory for reactive UI.
// NOT persisted to IndexedDB to prevent blocking when workflows run.
// ═══════════════════════════════════════════════════════════════════════════
const conversationsCollection = createMemoryOnlyCollection<Conversation>(
  STORE_NAMES.conversations,
);
const conversationMessagesCollection = createMemoryOnlyCollection<ConversationMessage>(
  STORE_NAMES.conversationMessages,
);
const workflowsCollection = createIndexedDbCollectionWithOptions<Workflow>(
  STORE_NAMES.workflows,
  { lazySync: true },
);
const workflowNodesCollection = createIndexedDbCollectionWithOptions<WorkflowNode>(
  STORE_NAMES.workflowNodes,
  { lazySync: true },
);
const workflowEdgesCollection = createIndexedDbCollectionWithOptions<WorkflowEdge>(
  STORE_NAMES.workflowEdges,
  { lazySync: true },
);
const pmRequestsCollection = createIndexedDbCollectionWithOptions<PmRequest>(
  STORE_NAMES.pmRequests,
  { lazySync: true },
);

let initPromise: Promise<void> | null = null;

/**
 * Sync builtin agents in marketAgentsCollection with DEFAULT_AGENTS.
 * - Insert new agents not yet in collection
 * - Update existing agents whose properties differ from DEFAULT_AGENTS
 * - Remove obsolete agents no longer in DEFAULT_AGENTS
 */
function syncBuiltinAgents(): void {
  const existingBuiltins = Array.from(marketAgentsCollection.values()).filter(
    (a) => a.is_builtin === 1,
  );
  const existingIds = new Set(existingBuiltins.map((a) => a.id));
  const defaultIds = new Set(DEFAULT_AGENTS.map((a) => a.id));

  // 1. Insert new builtin agents
  const newAgents = DEFAULT_AGENTS.filter((a) => !existingIds.has(a.id));
  if (newAgents.length > 0) {
    const now = new Date().toISOString();
    marketAgentsCollection.insert(
      newAgents.map((agent) => {
        const metadata = getAgentMetadata(agent.role);
        return {
          ...agent,
          preferred_provider: agent.preferred_provider || 'claude',
          description: metadata.description,
          category: metadata.category,
          tags: metadata.tags,
          is_builtin: 1,
          created_at: now,
          updated_at: now,
        };
      }),
    );
    dbDebug('sync-agents', `✓ Added ${newAgents.length} new builtin agents`);
  }

  // 2. Update existing builtin agents to match latest definitions
  let updatedCount = 0;
  for (const agent of DEFAULT_AGENTS) {
    if (!existingIds.has(agent.id)) continue;
    const existing = marketAgentsCollection.get(agent.id);
    if (!existing) continue;
    const metadata = getAgentMetadata(agent.role);
    const needsUpdate =
      existing.role !== agent.role ||
      existing.name !== agent.name ||
      existing.avatar !== agent.avatar ||
      existing.profile_image !== agent.profile_image ||
      existing.system_prompt !== agent.system_prompt ||
      existing.can_generate_images !== agent.can_generate_images ||
      existing.can_log_screenshots !== agent.can_log_screenshots ||
      existing.preferred_provider !== (agent.preferred_provider || 'claude') ||
      existing.description !== metadata.description ||
      existing.category !== metadata.category ||
      JSON.stringify(existing.tags) !== JSON.stringify(metadata.tags);
    if (needsUpdate) {
      marketAgentsCollection.update(agent.id, (draft) => {
        draft.role = agent.role;
        draft.name = agent.name;
        draft.avatar = agent.avatar;
        draft.profile_image = agent.profile_image;
        draft.system_prompt = agent.system_prompt;
        draft.can_generate_images = agent.can_generate_images;
        draft.can_log_screenshots = agent.can_log_screenshots;
        draft.preferred_provider = agent.preferred_provider || 'claude';
        draft.description = metadata.description;
        draft.category = metadata.category;
        draft.tags = metadata.tags;
        draft.updated_at = new Date().toISOString();
      });
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    dbDebug('sync-agents', `✓ Updated ${updatedCount} builtin agents`);
  }

  // 3. Remove obsolete builtin agents no longer in DEFAULT_AGENTS
  const removedIds = Array.from(existingIds).filter((id) => !defaultIds.has(id));
  if (removedIds.length > 0) {
    for (const id of removedIds) {
      marketAgentsCollection.delete(id);
    }
    dbDebug('sync-agents', `✓ Removed ${removedIds.length} obsolete builtin agents`);
  }
}

/**
 * Load all data from IndexedDB into collections (background loading after init)
 * This runs AFTER the app is shown, so UI is responsive immediately.
 */
async function loadAllCollectionsFromDb(): Promise<void> {
  dbDebug('bgload', 'Starting background data load...');
  const startTime = Date.now();

  try {
    const db = await getIdb();

    // Load each collection from IndexedDB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadCollection = async (storeName: string, collection: any) => {
      try {
        const rows = await db.getAll(storeName) as Array<{ id: string }>;
        if (rows.length > 0) {
          // Insert all rows that don't already exist
          const existingIds = new Set(Array.from(collection.keys()));
          const newRows = rows.filter((row) => !existingIds.has(row.id));
          if (newRows.length > 0) {
            collection.insert(newRows);
          }
          dbDebug('bgload', `[${storeName}] Loaded ${rows.length} rows (${newRows.length} new)`);
        }
      } catch (error) {
        dbDebug('bgload', `[${storeName}] Error:`, error);
      }
    };

    // Load collections in parallel
    // NOTE: conversations and conversationMessages are MEMORY-ONLY (not persisted to IndexedDB)
    // They are populated via server polling (syncFromServer)
    await Promise.all([
      loadCollection(STORE_NAMES.members, membersCollection),
      loadCollection(STORE_NAMES.marketAgents, marketAgentsCollection),
      loadCollection(STORE_NAMES.tickets, ticketsCollection),
      loadCollection(STORE_NAMES.activityLogs, activityLogsCollection),
      loadCollection(STORE_NAMES.projects, projectsCollection),
      loadCollection(STORE_NAMES.agentWorkLogs, agentWorkLogsCollection),
      // conversations - MEMORY ONLY (server is source of truth)
      // conversationMessages - MEMORY ONLY (server is source of truth)
      loadCollection(STORE_NAMES.workflows, workflowsCollection),
      loadCollection(STORE_NAMES.workflowNodes, workflowNodesCollection),
      loadCollection(STORE_NAMES.workflowEdges, workflowEdgesCollection),
      loadCollection(STORE_NAMES.pmRequests, pmRequestsCollection),
    ]);

    // After all data is loaded from IndexedDB, sync builtin agents again.
    // STEP 3 runs before IndexedDB data loads (lazySync), so stale agents
    // from IndexedDB can sneak in. This second sync cleans them up.
    syncBuiltinAgents();

    const elapsed = Date.now() - startTime;
    dbDebug('bgload', `✓ Background load complete (${elapsed}ms)`);
  } catch (error) {
    dbDebug('bgload', '❌ Background load failed:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION FLOW DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │                        initClientDb() FLOW                              │
// ├─────────────────────────────────────────────────────────────────────────┤
// │                                                                         │
// │  [STEP 1] initClientDb() called                                        │
// │     │     Log: "[init:1] Starting initialization..."                   │
// │     ▼                                                                   │
// │  [STEP 2] preload() with TIMEOUT (10s)                                 │
// │     │     Log: "[init:2] Preloading collections..."                    │
// │     │     └─ membersCollection.preload()                               │
// │     │     └─ marketAgentsCollection.preload()                          │
// │     │                                                                   │
// │     │     If TIMEOUT: Log "[init:2] ⚠️ TIMEOUT" → continue anyway      │
// │     ▼                                                                   │
// │  [STEP 3] Sync builtin agents                                          │
// │     │     Log: "[init:3] Syncing builtin agents..."                    │
// │     ▼                                                                   │
// │  [STEP 4] Schedule dumps & backup                                      │
// │     │     Log: "[init:4] Scheduling background tasks..."               │
// │     ▼                                                                   │
// │  [STEP 5] Mark as initialized                                          │
// │     │     Log: "[init:5] ✅ DB initialized"                            │
// │     │     isDbInitialized = true                                       │
// │     ▼                                                                   │
// │  [DONE] Promise resolves                                               │
// │         Log: "[init:done] Initialization complete (XXXms)"             │
// │                                                                         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ═══════════════════════════════════════════════════════════════════════════

export function initClientDb(): Promise<void> {
  if (initPromise) {
    dbDebug('init:1', 'Already initializing, returning existing promise');
    return initPromise;
  }

  initStartTime = Date.now();
  dbDebug('init:1', '═══ Starting initialization ═══');

  initPromise = (async () => {
    try {
      // ─────────────────────────────────────────────────────────────────────
      // STEP 2: Preload all collections (instant with lazySync)
      // ─────────────────────────────────────────────────────────────────────
      // With lazySync, preload() just calls markReady() without loading data.
      // Data will be loaded in background after init (STEP 6).
      dbDebug('init:2', 'Preloading collections (lazySync mode - instant)...');

      await Promise.all([
        membersCollection.preload(),
        marketAgentsCollection.preload(),
        ticketsCollection.preload(),
        activityLogsCollection.preload(),
        projectsCollection.preload(),
        agentWorkLogsCollection.preload(),
        conversationsCollection.preload(),
        conversationMessagesCollection.preload(),
        workflowsCollection.preload(),
        workflowNodesCollection.preload(),
        workflowEdgesCollection.preload(),
        pmRequestsCollection.preload(),
      ]);

      dbDebug('init:2', '✓ All collections marked ready');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 3: Sync builtin agents (first pass - for new users with empty DB)
      // ─────────────────────────────────────────────────────────────────────
      // NOTE: With lazySync, collection is empty here. This inserts DEFAULT_AGENTS
      // for new users. For existing users, the real sync happens after background
      // data load in loadAllCollectionsFromDb() → syncBuiltinAgents().
      dbDebug('init:3', 'Syncing builtin agents...');
      syncBuiltinAgents();

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4: Restore any emergency writes from previous session
      // ─────────────────────────────────────────────────────────────────────
      dbDebug('init:4', 'Restoring emergency writes if any...');
      await restoreEmergencyWrites();
      dbDebug('init:4', '✓ Emergency writes check complete');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 5: Background tasks
      // ─────────────────────────────────────────────────────────────────────
      dbDebug('init:5', 'Scheduling background tasks...');
      scheduleSqliteDump();
      startAutoBackup();
      dbDebug('init:5', '✓ Background tasks scheduled');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 6: Mark as initialized
      // ─────────────────────────────────────────────────────────────────────
      isDbInitialized = true;
      dbDebug('init:6', '✅ DB marked as initialized');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 7: Start background data loading (non-blocking)
      // ─────────────────────────────────────────────────────────────────────
      // Don't await - let it run in background while UI is shown
      dbDebug('init:7', 'Starting background data loading...');
      void loadAllCollectionsFromDb();

      // ─────────────────────────────────────────────────────────────────────
      // DONE
      // ─────────────────────────────────────────────────────────────────────
      const elapsed = Date.now() - initStartTime;
      dbDebug('init:done', `═══ Initialization complete (${elapsed}ms) ═══`);

    } catch (error) {
      const elapsed = Date.now() - initStartTime;
      dbDebug('init:error', `❌ Initialization FAILED after ${elapsed}ms`, error);
      // Still mark as initialized to prevent infinite loading
      isDbInitialized = true;
      throw error;
    }
  })();

  return initPromise;
}

export function useMembers() {
  const { data } = useLiveQuery(() => membersCollection);
  const members = (data ?? []) as Member[];
  // Sort by order_index (default to created_at for backwards compatibility)
  return members.sort((a, b) => {
    const aIndex = a.order_index ?? new Date(a.created_at).getTime();
    const bIndex = b.order_index ?? new Date(b.created_at).getTime();
    return aIndex - bIndex;
  });
}

export function useMarketAgents() {
  const { data } = useLiveQuery(() => marketAgentsCollection);
  return (data ?? []) as MarketAgent[];
}

export function useTickets() {
  const { data } = useLiveQuery(() => ticketsCollection);
  const tickets = (data ?? []) as Ticket[];
  return tickets.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

export function useProjects() {
  const { data } = useLiveQuery(() => projectsCollection);
  const projects = (data ?? []) as Project[];
  // 최신순 정렬: active 우선, 그 다음 created_at 내림차순
  return projects.sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function useActivityLogs(ticketId: string) {
  const { data } = useLiveQuery((q) =>
    q.from({ logs: activityLogsCollection }).where(({ logs }) => eq(logs.ticket_id, ticketId)),
    [ticketId],
  );
  return (data ?? []) as ActivityLog[];
}

export function useConversations(ticketId: string) {
  const { data } = useLiveQuery((q) =>
    q.from({ conversations: conversationsCollection }).where(({ conversations }) => eq(conversations.ticket_id, ticketId)),
    [ticketId],
  );
  return (data ?? []) as Conversation[];
}

export function useConversationMessages(conversationId: string | null) {
  const { data } = useLiveQuery((q) => {
    if (!conversationId) return null;
    return q.from({ messages: conversationMessagesCollection }).where(({ messages }) => eq(messages.conversation_id, conversationId));
  }, [conversationId]);
  return (data ?? []) as ConversationMessage[];
}

export const memberService = {
  getAll(): Member[] {
    const members = Array.from(membersCollection.values());
    return members.sort((a, b) => {
      const aIndex = a.order_index ?? new Date(a.created_at).getTime();
      const bIndex = b.order_index ?? new Date(b.created_at).getTime();
      return aIndex - bIndex;
    });
  },
  getById(id: string): Member | undefined {
    return membersCollection.get(id);
  },
  getByRole(role: string): Member | undefined {
    return Array.from(membersCollection.values()).find((member) => member.role === role);
  },
  updateSystemPrompt(id: string, systemPrompt: string): Member | undefined {
    membersCollection.update(id, (draft) => {
      draft.system_prompt = systemPrompt;
      draft.updated_at = new Date().toISOString();
    });
    return this.getById(id);
  },
  update(id: string, data: Partial<Pick<Member, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'can_generate_images' | 'can_log_screenshots' | 'preferred_provider'>>): Member | undefined {
    membersCollection.update(id, (draft) => {
      if (data.name !== undefined) draft.name = data.name;
      if (data.avatar !== undefined) draft.avatar = data.avatar;
      if (data.profile_image !== undefined) draft.profile_image = data.profile_image;
      if (data.system_prompt !== undefined) draft.system_prompt = data.system_prompt;
      if (data.can_generate_images !== undefined) {
        draft.can_generate_images = data.can_generate_images ? 1 : 0;
      }
      if (data.can_log_screenshots !== undefined) {
        draft.can_log_screenshots = data.can_log_screenshots ? 1 : 0;
      }
      if (data.preferred_provider !== undefined) draft.preferred_provider = data.preferred_provider;
      draft.updated_at = new Date().toISOString();
    });
    return this.getById(id);
  },
  create(data: { role: string; name: string; avatar?: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean; preferred_provider?: 'claude' | 'opencode' | 'codex' }): Member {
    const now = new Date().toISOString();
    // Get max order_index to place new member at the end
    const members = Array.from(membersCollection.values());
    const maxOrderIndex = members.reduce((max, m) => Math.max(max, m.order_index ?? 0), 0);
    const member: Member = {
      id: uuidv4(),
      role: data.role,
      name: data.name,
      avatar: data.avatar || null,
      profile_image: null,
      system_prompt: data.system_prompt,
      is_default: 0,
      can_generate_images: data.can_generate_images ? 1 : 0,
      can_log_screenshots: data.can_log_screenshots ? 1 : 0,
      preferred_provider: data.preferred_provider || 'claude',
      source_market_agent_id: null,
      order_index: maxOrderIndex + 1,
      created_at: now,
      updated_at: now,
    };
    membersCollection.insert(member);
    return member;
  },
  reorder(members: { id: string; order_index: number }[]) {
    members.forEach((m) => {
      membersCollection.update(m.id, (draft) => {
        draft.order_index = m.order_index;
        draft.updated_at = new Date().toISOString();
      });
    });
  },
  delete(id: string): { success: boolean; error?: string } {
    const member = this.getById(id);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }
    membersCollection.delete(id);
    return { success: true };
  },
  addFromMarket(marketAgentId: string): Member {
    const marketAgent = marketAgentService.getById(marketAgentId);
    if (!marketAgent) {
      throw new Error('Market agent not found');
    }
    const now = new Date().toISOString();
    // Get max order_index to place new member at the end
    const members = Array.from(membersCollection.values());
    const maxOrderIndex = members.reduce((max, m) => Math.max(max, m.order_index ?? 0), 0);
    const member: Member = {
      id: uuidv4(),
      role: marketAgent.role,
      name: marketAgent.name,
      avatar: marketAgent.avatar,
      profile_image: marketAgent.profile_image,
      system_prompt: marketAgent.system_prompt,
      is_default: 0,
      can_generate_images: marketAgent.can_generate_images,
      can_log_screenshots: marketAgent.can_log_screenshots,
      preferred_provider: marketAgent.preferred_provider || 'claude',
      source_market_agent_id: marketAgent.id,
      order_index: maxOrderIndex + 1,
      created_at: now,
      updated_at: now,
    };
    membersCollection.insert(member);
    return member;
  },
};

export const marketAgentService = {
  getAll(): MarketAgent[] {
    return Array.from(marketAgentsCollection.values());
  },
  getById(id: string): MarketAgent | undefined {
    return marketAgentsCollection.get(id);
  },
  getByCategory(category: AgentCategory): MarketAgent[] {
    return Array.from(marketAgentsCollection.values()).filter((agent) => agent.category === category);
  },
  getBuiltins(): MarketAgent[] {
    return Array.from(marketAgentsCollection.values()).filter((agent) => agent.is_builtin === 1);
  },
  getUserCreated(): MarketAgent[] {
    return Array.from(marketAgentsCollection.values()).filter((agent) => agent.is_builtin === 0);
  },
  create(data: {
    role: string;
    name: string;
    avatar: string;
    system_prompt: string;
    description: string;
    category: AgentCategory;
    tags?: string[];
    can_generate_images?: boolean;
    can_log_screenshots?: boolean;
    preferred_provider?: 'claude' | 'opencode' | 'codex';
  }): MarketAgent {
    const now = new Date().toISOString();
    const agent: MarketAgent = {
      id: uuidv4(),
      role: data.role,
      name: data.name,
      avatar: data.avatar,
      profile_image: null,
      system_prompt: data.system_prompt,
      description: data.description,
      category: data.category,
      tags: data.tags || [],
      is_builtin: 0,
      can_generate_images: data.can_generate_images ? 1 : 0,
      can_log_screenshots: data.can_log_screenshots ? 1 : 0,
      preferred_provider: data.preferred_provider || 'claude',
      created_at: now,
      updated_at: now,
    };
    marketAgentsCollection.insert(agent);
    return agent;
  },
  update(
    id: string,
    data: Partial<Pick<MarketAgent, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'description' | 'category' | 'tags' | 'can_generate_images' | 'can_log_screenshots' | 'preferred_provider'>>,
  ): MarketAgent | undefined {
    const agent = this.getById(id);
    if (!agent) return undefined;
    // Prevent editing builtin agents
    if (agent.is_builtin === 1) return undefined;

    marketAgentsCollection.update(id, (draft) => {
      if (data.name !== undefined) draft.name = data.name;
      if (data.avatar !== undefined) draft.avatar = data.avatar;
      if (data.profile_image !== undefined) draft.profile_image = data.profile_image;
      if (data.system_prompt !== undefined) draft.system_prompt = data.system_prompt;
      if (data.description !== undefined) draft.description = data.description;
      if (data.category !== undefined) draft.category = data.category;
      if (data.tags !== undefined) draft.tags = data.tags;
      if (data.can_generate_images !== undefined) {
        draft.can_generate_images = data.can_generate_images ? 1 : 0;
      }
      if (data.can_log_screenshots !== undefined) {
        draft.can_log_screenshots = data.can_log_screenshots ? 1 : 0;
      }
      if (data.preferred_provider !== undefined) draft.preferred_provider = data.preferred_provider;
      draft.updated_at = new Date().toISOString();
    });
    return this.getById(id);
  },
  delete(id: string): { success: boolean; error?: string } {
    const agent = this.getById(id);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }
    if (agent.is_builtin === 1) {
      return { success: false, error: 'Cannot delete builtin agents' };
    }
    marketAgentsCollection.delete(id);
    return { success: true };
  },
};

export const activityService = {
  log(data: { ticket_id: string; member_id: string | null; action: string; old_value?: string | null; new_value?: string | null; details?: string | null }): ActivityLog {
    const log: ActivityLog = {
      id: uuidv4(),
      ticket_id: data.ticket_id,
      member_id: data.member_id || null,
      action: data.action,
      old_value: data.old_value || null,
      new_value: data.new_value || null,
      details: data.details || null,
      created_at: new Date().toISOString(),
    };
    activityLogsCollection.insert(log);
    return log;
  },
  getByTicketId(ticketId: string): ActivityLog[] {
    return Array.from(activityLogsCollection.values()).filter((log) => log.ticket_id === ticketId);
  },
};

export const ticketService = {
  getAll(status?: string, projectId?: string): Ticket[] {
    return Array.from(ticketsCollection.values()).filter((ticket) => {
      if (status && ticket.status !== status) return false;
      if (projectId && ticket.project_id !== projectId) return false;
      return true;
    });
  },
  getById(id: string): Ticket | undefined {
    return ticketsCollection.get(id);
  },
  reorder(tickets: { id: string; order_index: number }[]) {
    tickets.forEach((t) => {
      ticketsCollection.update(t.id, (draft) => {
        draft.order_index = t.order_index;
        draft.updated_at = new Date().toISOString();
      });
    });
  },
  create(data: { title: string; description?: string; priority?: Ticket['priority']; assignee_ids?: string[]; project_id?: string; created_by?: string; order_index?: number; enable_screenshot?: number }): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: uuidv4(),
      title: data.title,
      description: data.description || null,
      status: 'TODO',
      priority: data.priority || 'MEDIUM',
      assignee_ids: data.assignee_ids || [],
      project_id: data.project_id || null,
      created_by: data.created_by || null,
      order_index: data.order_index ?? Date.now(),
      enable_screenshot: data.enable_screenshot ?? 0,  // 기본값: 비활성화
      created_at: now,
      updated_at: now,
    };
    ticketsCollection.insert(ticket);
    activityService.log({
      ticket_id: ticket.id,
      member_id: data.created_by || null,
      action: 'CREATED',
      new_value: ticket.title,
      details: `Ticket "${ticket.title}" was created`,
    });
    return ticket;
  },
  update(id: string, data: Partial<Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'assignee_ids' | 'enable_screenshot'>>, updatedBy?: string): Ticket | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    ticketsCollection.update(id, (draft) => {
      if (data.title !== undefined) draft.title = data.title;
      if (data.description !== undefined) draft.description = data.description;
      if (data.status !== undefined) draft.status = data.status;
      if (data.priority !== undefined) draft.priority = data.priority;
      if (data.assignee_ids !== undefined) draft.assignee_ids = data.assignee_ids;
      if (data.enable_screenshot !== undefined) draft.enable_screenshot = data.enable_screenshot;
      draft.updated_at = new Date().toISOString();
    });

    if (data.status !== undefined && data.status !== current.status) {
      activityService.log({
        ticket_id: id,
        member_id: updatedBy || null,
        action: 'STATUS_CHANGED',
        old_value: current.status,
        new_value: data.status,
        details: `Status changed from ${current.status} to ${data.status}`,
      });
    }

    if (data.priority !== undefined && data.priority !== current.priority) {
      activityService.log({
        ticket_id: id,
        member_id: updatedBy || null,
        action: 'PRIORITY_CHANGED',
        old_value: current.priority,
        new_value: data.priority,
        details: `Priority changed from ${current.priority} to ${data.priority}`,
      });
    }

    if (data.assignee_ids !== undefined) {
      const newNames = data.assignee_ids.map(aid => memberService.getById(aid)?.name || '').filter(Boolean).join(', ');
      const oldNames = (current.assignee_ids || []).map(aid => memberService.getById(aid)?.name || '').filter(Boolean).join(', ');
      if (newNames !== oldNames) {
        activityService.log({
          ticket_id: id,
          member_id: updatedBy || null,
          action: 'ASSIGNED',
          old_value: oldNames || null,
          new_value: newNames || null,
          details: newNames ? `Assigned to ${newNames}` : 'Unassigned',
        });
      }
    }

    return this.getById(id);
  },
  delete(id: string): boolean {
    ticketsCollection.delete(id);
    return true;
  },
};

export const projectService = {
  getAll(): Project[] {
    return Array.from(projectsCollection.values()).sort((a, b) => {
      if (a.is_active !== b.is_active) return b.is_active - a.is_active;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  },
  getById(id: string): Project | undefined {
    return projectsCollection.get(id);
  },
  getActive(): Project | undefined {
    return Array.from(projectsCollection.values()).find((project) => project.is_active === 1);
  },
  create(data: { name: string; path: string; description?: string }): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      name: data.name,
      path: data.path,
      description: data.description || null,
      is_active: 0,
      created_at: now,
      updated_at: now,
    };
    projectsCollection.insert(project);
    return project;
  },
  setActive(id: string): Project | undefined {
    const ids = Array.from(projectsCollection.keys());
    if (ids.length > 0) {
      projectsCollection.update(ids, (drafts) => {
        drafts.forEach((draft) => {
          draft.is_active = draft.id === id ? 1 : 0;
          draft.updated_at = new Date().toISOString();
        });
      });
    }
    return this.getById(id);
  },
  delete(id: string): boolean {
    projectsCollection.delete(id);
    return true;
  },
};

/**
 * Sync server-side execution data into IndexedDB (ComfyUI pattern).
 * Server is source of truth; IndexedDB is just a reactive UI cache.
 */
export const syncFromServer = {
  /** Upsert a conversation from server into IndexedDB */
  upsertConversation(data: Conversation): void {
    const existing = conversationsCollection.get(data.id);
    if (existing) {
      const hasChanges = existing.status !== data.status ||
        existing.git_commit_hash !== data.git_commit_hash ||
        existing.completed_at !== data.completed_at;
      if (hasChanges) {
        conversationsCollection.update(data.id, (draft) => {
          draft.status = data.status;
          draft.git_commit_hash = data.git_commit_hash;
          draft.completed_at = data.completed_at;
        });
        dbDebug('syncFromServer', `conversation ${data.id.slice(0, 8)} updated (status: ${data.status})`);
      }
    } else {
      conversationsCollection.insert(data);
      dbDebug('syncFromServer', `conversation ${data.id.slice(0, 8)} inserted`);
    }
  },

  /** Upsert a message from server into IndexedDB (skip if already exists) */
  upsertMessage(data: ConversationMessage): void {
    const existing = conversationMessagesCollection.get(data.id);
    if (!existing) {
      conversationMessagesCollection.insert(data);
      // Don't log every message to avoid spam during agent execution
    }
  },

  /** Batch sync conversations and messages from server */
  syncAll(conversations: Conversation[], messages: ConversationMessage[]): void {
    dbDebug('syncFromServer', `syncAll called: ${conversations.length} convs, ${messages.length} msgs`);
    for (const conv of conversations) {
      this.upsertConversation(conv);
    }
    for (const msg of messages) {
      this.upsertMessage(msg);
    }
  },

  /** Update ticket status from server */
  updateTicketStatus(ticketId: string, status: Ticket['status']): void {
    const existing = ticketsCollection.get(ticketId);
    if (existing && existing.status !== status) {
      ticketsCollection.update(ticketId, (draft) => {
        draft.status = status;
        draft.updated_at = new Date().toISOString();
      });
      dbDebug('syncFromServer', `ticket ${ticketId.slice(0, 8)} status: ${existing.status} → ${status}`);
    }
  },

  /** Sync all ticket statuses from server (call on app load) */
  async syncAllTicketStatuses(): Promise<void> {
    dbDebug('syncFromServer', 'syncAllTicketStatuses called');
    try {
      const res = await fetch('/api/tickets/sync');
      const data = await res.json();
      if (data.ticketStatuses) {
        let updatedCount = 0;
        for (const statusUpdate of data.ticketStatuses) {
          const existing = ticketsCollection.get(statusUpdate.ticket_id);
          if (existing && existing.status !== statusUpdate.status) {
            this.updateTicketStatus(statusUpdate.ticket_id, statusUpdate.status);
            updatedCount++;
          }
        }
        if (updatedCount > 0) {
          dbDebug('syncFromServer', `✓ ${updatedCount} ticket statuses updated from server`);
        }
      }
    } catch (error) {
      dbDebug('syncFromServer', 'ERROR syncing ticket statuses:', error);
    }
  },
};

export const conversationService = {
  create(data: {
    ticket_id: string;
    agent_id: string;
    provider: 'claude' | 'opencode' | 'codex';
    prompt?: string;
    feedback?: string;
  }): Conversation {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: uuidv4(),
      ticket_id: data.ticket_id,
      agent_id: data.agent_id,
      provider: data.provider,
      prompt: data.prompt || null,
      feedback: data.feedback || null,
      status: 'running',
      git_commit_hash: null,
      started_at: now,
      completed_at: null,
      created_at: now,
    };
    conversationsCollection.insert(conversation);
    return conversation;
  },
  getById(id: string): Conversation | undefined {
    return conversationsCollection.get(id);
  },
  getByTicketId(ticketId: string): Conversation[] {
    return Array.from(conversationsCollection.values()).filter((conv) => conv.ticket_id === ticketId);
  },
  updateStatus(id: string, status: Conversation['status'], commitHash?: string): void {
    conversationsCollection.update(id, (draft) => {
      draft.status = status;
      draft.git_commit_hash = commitHash || null;
    });
  },
  complete(id: string, data: { status: Conversation['status']; git_commit_hash?: string }): void {
    conversationsCollection.update(id, (draft) => {
      draft.status = data.status;
      draft.git_commit_hash = data.git_commit_hash || null;
      draft.completed_at = new Date().toISOString();
    });
  },
};

export const conversationMessageService = {
  create(conversationId: string, content: string, type: ConversationMessage['message_type'] = 'log'): ConversationMessage {
    const message: ConversationMessage = {
      id: uuidv4(),
      conversation_id: conversationId,
      content,
      message_type: type,
      created_at: new Date().toISOString(),
    };
    conversationMessagesCollection.insert(message);
    return message;
  },
  getByConversationId(conversationId: string): ConversationMessage[] {
    return Array.from(conversationMessagesCollection.values()).filter((msg) => msg.conversation_id === conversationId);
  },
};

export const agentWorkLogService = {
  getByTicketId(ticketId: string): AgentWorkLog[] {
    return Array.from(agentWorkLogsCollection.values()).filter((log) => log.ticket_id === ticketId);
  },
};

export function useWorkflows(projectId?: string) {
  const { data } = useLiveQuery(() => workflowsCollection);
  const workflows = (data ?? []) as Workflow[];
  if (projectId) {
    return workflows.filter((w) => w.project_id === projectId);
  }
  return workflows;
}

export function useWorkflowNodes(workflowId: string) {
  const { data } = useLiveQuery((q) =>
    q.from({ nodes: workflowNodesCollection }).where(({ nodes }) => eq(nodes.workflow_id, workflowId)),
    [workflowId],
  );
  return (data ?? []) as WorkflowNode[];
}

export function useWorkflowEdges(workflowId: string) {
  const { data } = useLiveQuery((q) =>
    q.from({ edges: workflowEdgesCollection }).where(({ edges }) => eq(edges.workflow_id, workflowId)),
    [workflowId],
  );
  return (data ?? []) as WorkflowEdge[];
}

export const workflowService = {
  getAll(projectId?: string): Workflow[] {
    const workflows = Array.from(workflowsCollection.values());
    if (projectId) {
      return workflows.filter((w) => w.project_id === projectId);
    }
    return workflows;
  },
  getById(id: string): Workflow | undefined {
    return workflowsCollection.get(id);
  },
  create(data: { name: string; description?: string; project_id: string }): Workflow {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: uuidv4(),
      name: data.name,
      description: data.description || null,
      project_id: data.project_id,
      status: 'idle',
      current_node_id: null,
      created_at: now,
      updated_at: now,
    };
    workflowsCollection.insert(workflow);
    return workflow;
  },
  update(id: string, data: Partial<Pick<Workflow, 'name' | 'description' | 'status' | 'current_node_id'>>): Workflow | undefined {
    workflowsCollection.update(id, (draft) => {
      if (data.name !== undefined) draft.name = data.name;
      if (data.description !== undefined) draft.description = data.description;
      if (data.status !== undefined) draft.status = data.status;
      if (data.current_node_id !== undefined) draft.current_node_id = data.current_node_id;
      draft.updated_at = new Date().toISOString();
    });
    return this.getById(id);
  },
  delete(id: string): boolean {
    // Delete all nodes and edges first
    const nodes = Array.from(workflowNodesCollection.values()).filter((n) => n.workflow_id === id);
    const edges = Array.from(workflowEdgesCollection.values()).filter((e) => e.workflow_id === id);
    nodes.forEach((node) => workflowNodesCollection.delete(node.id));
    edges.forEach((edge) => workflowEdgesCollection.delete(edge.id));
    workflowsCollection.delete(id);
    return true;
  },
};

export const workflowNodeService = {
  getByWorkflowId(workflowId: string): WorkflowNode[] {
    return Array.from(workflowNodesCollection.values()).filter((node) => node.workflow_id === workflowId);
  },
  getById(id: string): WorkflowNode | undefined {
    return workflowNodesCollection.get(id);
  },
  create(data: { workflow_id: string; ticket_id: string; position_x: number; position_y: number }): WorkflowNode {
    const node: WorkflowNode = {
      id: uuidv4(),
      workflow_id: data.workflow_id,
      ticket_id: data.ticket_id,
      position_x: data.position_x,
      position_y: data.position_y,
      created_at: new Date().toISOString(),
    };
    workflowNodesCollection.insert(node);
    return node;
  },
  updatePosition(id: string, position_x: number, position_y: number): void {
    workflowNodesCollection.update(id, (draft) => {
      draft.position_x = position_x;
      draft.position_y = position_y;
    });
  },
  delete(id: string): boolean {
    // Delete related edges
    const edges = Array.from(workflowEdgesCollection.values()).filter(
      (e) => e.source_node_id === id || e.target_node_id === id
    );
    edges.forEach((edge) => workflowEdgesCollection.delete(edge.id));
    workflowNodesCollection.delete(id);
    return true;
  },
};

export const workflowEdgeService = {
  getByWorkflowId(workflowId: string): WorkflowEdge[] {
    return Array.from(workflowEdgesCollection.values()).filter((edge) => edge.workflow_id === workflowId);
  },
  getById(id: string): WorkflowEdge | undefined {
    return workflowEdgesCollection.get(id);
  },
  create(data: { workflow_id: string; source_node_id: string; target_node_id: string }): WorkflowEdge {
    const edge: WorkflowEdge = {
      id: uuidv4(),
      workflow_id: data.workflow_id,
      source_node_id: data.source_node_id,
      target_node_id: data.target_node_id,
      created_at: new Date().toISOString(),
    };
    workflowEdgesCollection.insert(edge);
    return edge;
  },
  delete(id: string): boolean {
    workflowEdgesCollection.delete(id);
    return true;
  },
};

export function usePmRequests(projectId?: string) {
  const { data } = useLiveQuery(() => pmRequestsCollection);
  const requests = (data ?? []) as PmRequest[];
  if (projectId) {
    return requests
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return requests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export const pmRequestService = {
  getAll(projectId?: string): PmRequest[] {
    const requests = Array.from(pmRequestsCollection.values());
    if (projectId) {
      return requests
        .filter((r) => r.project_id === projectId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return requests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  getById(id: string): PmRequest | undefined {
    return pmRequestsCollection.get(id);
  },
  create(data: {
    project_id: string;
    request_type: 'breakdown' | 'ask';
    request_content: string;
    response_content?: string;
    provider: 'claude' | 'opencode' | 'codex';
    tasks_created?: number;
    workflow_id?: string;
    selected_member_ids?: string[];
  }): PmRequest {
    const request: PmRequest = {
      id: uuidv4(),
      project_id: data.project_id,
      request_type: data.request_type,
      request_content: data.request_content,
      response_content: data.response_content || null,
      provider: data.provider,
      tasks_created: data.tasks_created || 0,
      workflow_id: data.workflow_id || null,
      selected_member_ids: data.selected_member_ids || [],
      created_at: new Date().toISOString(),
    };
    pmRequestsCollection.insert(request);
    return request;
  },
  delete(id: string): boolean {
    pmRequestsCollection.delete(id);
    return true;
  },
  deleteAll(projectId: string): number {
    const requests = this.getAll(projectId);
    requests.forEach((r) => pmRequestsCollection.delete(r.id));
    return requests.length;
  },
};

export const collections = {
  membersCollection,
  marketAgentsCollection,
  ticketsCollection,
  activityLogsCollection,
  projectsCollection,
  agentWorkLogsCollection,
  conversationsCollection,
  conversationMessagesCollection,
  workflowsCollection,
  workflowNodesCollection,
  workflowEdgesCollection,
  pmRequestsCollection,
};

// User Settings (stored in meta store)
export interface UserSettings {
  id: string;
  email: string;
  created_at: string;
}

export const userSettingsService = {
  async get(): Promise<UserSettings | null> {
    const db = await getIdb();
    const settings = await db.get(STORE_NAMES.meta, 'user_settings');
    return settings as UserSettings | null;
  },
  async set(email: string): Promise<UserSettings> {
    const db = await getIdb();
    const settings: UserSettings = {
      id: 'user_settings',
      email: email.trim().toLowerCase(),
      created_at: new Date().toISOString(),
    };
    await db.put(STORE_NAMES.meta, settings);
    return settings;
  },
  async getEmail(): Promise<string | null> {
    const settings = await this.get();
    return settings?.email || null;
  },
  // Clear user settings (logout)
  async clear(): Promise<void> {
    const db = await getIdb();
    await db.delete(STORE_NAMES.meta, 'user_settings');
  },
  // Convert email to safe directory name
  emailToDir(email: string): string {
    return email.replace(/@/g, '_at_').replace(/\./g, '_');
  },
};
