'use client';

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

// Collection names for TanStack DB (memory-only, no persistence)
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
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// AUTO BACKUP (to ~/.olly-molly/users/{email}/db-backup.json)
// ═══════════════════════════════════════════════════════════════════════════
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let autoBackupTimer: number | null = null;

export function startAutoBackup(): void {
  if (typeof window === 'undefined') return;
  if (autoBackupTimer) return;

  const run = async () => {
    try {
      // Fetch all data from server (source of truth)
      const res = await fetch('/api/data/sync');
      if (!res.ok) return;

      const serverData = await res.json();
      const email = userSettingsService.getEmailSync();
      if (!email) return;

      // Create backup payload
      const backup = {
        version: 1,
        exported_at: new Date().toISOString(),
        stores: serverData.data,
        _email: email,
      };

      // Send to backup API
      await fetch('/api/db/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });

      dbDebug('autoBackup', '✓ Auto backup completed');
    } catch (error) {
      console.warn('[db] Auto backup failed', error);
    }
  };

  // Run first backup after 30 seconds, then every 5 minutes
  window.setTimeout(run, 30000);
  autoBackupTimer = window.setInterval(run, AUTO_BACKUP_INTERVAL_MS);
}

/**
 * Create a MEMORY-ONLY collection.
 * All data is persisted on the server (JSON files at ~/.olly-molly/data/).
 * Browser keeps data in memory only for reactive UI updates.
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
      // Mark ready immediately - data loaded from server
      dbDebug('sync', `[${collectionId}] Memory-only collection - markReady()`);
      params.markReady();
      return () => {}; // cleanup function
    },
  };

  return createCollection<T>({
    id: collectionId,
    getKey: (item) => item.id,
    sync: memoryOnlySync,
    // Confirm operations for TanStack DB reactivity
    onInsert: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
    },
    onUpdate: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
    },
    onDelete: async ({ transaction }) => {
      confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL COLLECTIONS ARE MEMORY-ONLY
// ═══════════════════════════════════════════════════════════════════════════
// All data is stored on the server (JSON files at ~/.olly-molly/data/).
// Browser keeps data in memory for reactive UI (useLiveQuery), and syncs
// with server via /api/data/sync endpoint.
// ═══════════════════════════════════════════════════════════════════════════
const membersCollection = createMemoryOnlyCollection<Member>(STORE_NAMES.members);
const marketAgentsCollection = createMemoryOnlyCollection<MarketAgent>(STORE_NAMES.marketAgents);
const ticketsCollection = createMemoryOnlyCollection<Ticket>(STORE_NAMES.tickets);
const activityLogsCollection = createMemoryOnlyCollection<ActivityLog>(STORE_NAMES.activityLogs);
const projectsCollection = createMemoryOnlyCollection<Project>(STORE_NAMES.projects);
const agentWorkLogsCollection = createMemoryOnlyCollection<AgentWorkLog>(STORE_NAMES.agentWorkLogs);
const conversationsCollection = createMemoryOnlyCollection<Conversation>(STORE_NAMES.conversations);
const conversationMessagesCollection = createMemoryOnlyCollection<ConversationMessage>(STORE_NAMES.conversationMessages);
const workflowsCollection = createMemoryOnlyCollection<Workflow>(STORE_NAMES.workflows);
const workflowNodesCollection = createMemoryOnlyCollection<WorkflowNode>(STORE_NAMES.workflowNodes);
const workflowEdgesCollection = createMemoryOnlyCollection<WorkflowEdge>(STORE_NAMES.workflowEdges);
const pmRequestsCollection = createMemoryOnlyCollection<PmRequest>(STORE_NAMES.pmRequests);

let initPromise: Promise<void> | null = null;

/**
 * Load all data from server into memory collections.
 * Server JSON files at ~/.olly-molly/data/ are the source of truth.
 */
async function loadAllCollectionsFromServer(): Promise<void> {
  dbDebug('bgload', 'Starting data load from server...');
  const startTime = Date.now();

  try {
    // Fetch all data from server
    const res = await fetch('/api/data/sync');
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const { data } = await res.json();
    if (!data) {
      dbDebug('bgload', 'No data from server');
      return;
    }

    // Load each collection from server response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadCollection = (storeName: string, collection: any, serverData: any[]) => {
      if (serverData && serverData.length > 0) {
        const existingIds = new Set(Array.from(collection.keys()));
        const newRows = serverData.filter((row) => !existingIds.has(row.id));
        if (newRows.length > 0) {
          collection.insert(newRows);
        }
        dbDebug('bgload', `[${storeName}] Loaded ${serverData.length} rows (${newRows.length} new)`);
      }
    };

    // Load all collections
    loadCollection(STORE_NAMES.members, membersCollection, data.members || []);
    loadCollection(STORE_NAMES.marketAgents, marketAgentsCollection, data.market_agents || []);
    loadCollection(STORE_NAMES.tickets, ticketsCollection, data.tickets || []);
    loadCollection(STORE_NAMES.activityLogs, activityLogsCollection, data.activity_logs || []);
    loadCollection(STORE_NAMES.projects, projectsCollection, data.projects || []);
    // agentWorkLogs - execution data from server-store.ts
    // conversations - execution data from server-store.ts
    // conversationMessages - execution data from server-store.ts
    loadCollection(STORE_NAMES.workflows, workflowsCollection, data.workflows || []);
    loadCollection(STORE_NAMES.workflowNodes, workflowNodesCollection, data.workflow_nodes || []);
    loadCollection(STORE_NAMES.workflowEdges, workflowEdgesCollection, data.workflow_edges || []);
    loadCollection(STORE_NAMES.pmRequests, pmRequestsCollection, data.pm_requests || []);

    const elapsed = Date.now() - startTime;
    dbDebug('bgload', `✓ Server load complete (${elapsed}ms)`);
  } catch (error) {
    dbDebug('bgload', '❌ Server load failed:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER SYNC HELPERS
// ═══════════════════════════════════════════════════════════════════════════
// All mutations are synced to server for multi-tab consistency.
// Local state is updated first (optimistic), then server is notified.
// ═══════════════════════════════════════════════════════════════════════════

async function syncToServer(
  action: 'create' | 'update' | 'delete' | 'bulkCreate' | 'bulkUpdate',
  collection: string,
  payload: { data?: unknown; id?: string; updates?: unknown }
): Promise<void> {
  try {
    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, collection, ...payload }),
    });
    if (!res.ok) {
      console.error(`[sync] Failed to sync ${action} to ${collection}:`, await res.text());
    } else {
      dbDebug('sync', `${action} ${collection} synced to server`);
    }
  } catch (error) {
    console.error(`[sync] Error syncing ${action} to ${collection}:`, error);
  }
}

// Fire-and-forget sync (don't block UI)
function syncCreate(collection: string, data: unknown): void {
  void syncToServer('create', collection, { data });
}

function syncUpdate(collection: string, id: string, updates: unknown): void {
  void syncToServer('update', collection, { id, updates });
}

function syncDelete(collection: string, id: string): void {
  void syncToServer('delete', collection, { id });
}

function syncBulkUpdate(collection: string, updates: Array<{ id: string; data: unknown }>): void {
  void syncToServer('bulkUpdate', collection, { updates });
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
      // STEP 3: Sync builtin agents
      // ─────────────────────────────────────────────────────────────────────
      dbDebug('init:3', 'Syncing builtin agents...');

      const existingIds = new Set(
        Array.from(marketAgentsCollection.values())
          .filter((a) => a.is_builtin === 1)
          .map((a) => a.id)
      );

      const newBuiltinAgents = DEFAULT_AGENTS.filter((agent) => !existingIds.has(agent.id));

      if (newBuiltinAgents.length > 0) {
        const now = new Date().toISOString();
        marketAgentsCollection.insert(
          newBuiltinAgents.map((agent) => {
            const metadata = getAgentMetadata(agent.role);
            return {
              ...agent,
              description: metadata.description,
              category: metadata.category,
              tags: metadata.tags,
              is_builtin: 1,
              created_at: now,
              updated_at: now,
            };
          }),
        );
        dbDebug('init:3', `✓ Added ${newBuiltinAgents.length} builtin agents`);
      } else {
        dbDebug('init:3', '✓ No new builtin agents to add');
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4: Load data from server (BLOCKING - must complete before UI)
      // ─────────────────────────────────────────────────────────────────────
      dbDebug('init:4', 'Loading data from server...');
      await loadAllCollectionsFromServer();
      dbDebug('init:4', '✓ Server data loaded');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 5: Mark as initialized
      // ─────────────────────────────────────────────────────────────────────
      isDbInitialized = true;
      dbDebug('init:5', '✅ DB marked as initialized');

      // ─────────────────────────────────────────────────────────────────────
      // STEP 6: Start auto backup (non-blocking)
      // ─────────────────────────────────────────────────────────────────────
      startAutoBackup();

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
    const updated_at = new Date().toISOString();
    membersCollection.update(id, (draft) => {
      draft.system_prompt = systemPrompt;
      draft.updated_at = updated_at;
    });
    const member = this.getById(id);
    if (member) syncUpdate(STORE_NAMES.members, id, { system_prompt: systemPrompt, updated_at });
    return member;
  },
  update(id: string, data: Partial<Pick<Member, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'can_generate_images' | 'can_log_screenshots'>>): Member | undefined {
    const updated_at = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at };
    membersCollection.update(id, (draft) => {
      if (data.name !== undefined) { draft.name = data.name; updates.name = data.name; }
      if (data.avatar !== undefined) { draft.avatar = data.avatar; updates.avatar = data.avatar; }
      if (data.profile_image !== undefined) { draft.profile_image = data.profile_image; updates.profile_image = data.profile_image; }
      if (data.system_prompt !== undefined) { draft.system_prompt = data.system_prompt; updates.system_prompt = data.system_prompt; }
      if (data.can_generate_images !== undefined) {
        draft.can_generate_images = data.can_generate_images ? 1 : 0;
        updates.can_generate_images = draft.can_generate_images;
      }
      if (data.can_log_screenshots !== undefined) {
        draft.can_log_screenshots = data.can_log_screenshots ? 1 : 0;
        updates.can_log_screenshots = draft.can_log_screenshots;
      }
      draft.updated_at = updated_at;
    });
    syncUpdate(STORE_NAMES.members, id, updates);
    return this.getById(id);
  },
  create(data: { role: string; name: string; avatar?: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }): Member {
    const now = new Date().toISOString();
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
      source_market_agent_id: null,
      order_index: maxOrderIndex + 1,
      created_at: now,
      updated_at: now,
    };
    membersCollection.insert(member);
    syncCreate(STORE_NAMES.members, member);
    return member;
  },
  reorder(updates: { id: string; order_index: number }[]) {
    const now = new Date().toISOString();
    updates.forEach((m) => {
      membersCollection.update(m.id, (draft) => {
        draft.order_index = m.order_index;
        draft.updated_at = now;
      });
    });
    syncBulkUpdate(STORE_NAMES.members, updates.map(u => ({ id: u.id, data: { order_index: u.order_index, updated_at: now } })));
  },
  delete(id: string): { success: boolean; error?: string } {
    const member = this.getById(id);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }
    membersCollection.delete(id);
    syncDelete(STORE_NAMES.members, id);
    return { success: true };
  },
  addFromMarket(marketAgentId: string): Member {
    const marketAgent = marketAgentService.getById(marketAgentId);
    if (!marketAgent) {
      throw new Error('Market agent not found');
    }
    const now = new Date().toISOString();
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
      source_market_agent_id: marketAgent.id,
      order_index: maxOrderIndex + 1,
      created_at: now,
      updated_at: now,
    };
    membersCollection.insert(member);
    syncCreate(STORE_NAMES.members, member);
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
      created_at: now,
      updated_at: now,
    };
    marketAgentsCollection.insert(agent);
    return agent;
  },
  update(
    id: string,
    data: Partial<Pick<MarketAgent, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'description' | 'category' | 'tags' | 'can_generate_images' | 'can_log_screenshots'>>,
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
    const now = new Date().toISOString();
    tickets.forEach((t) => {
      ticketsCollection.update(t.id, (draft) => {
        draft.order_index = t.order_index;
        draft.updated_at = now;
      });
    });
    syncBulkUpdate(STORE_NAMES.tickets, tickets.map(t => ({ id: t.id, data: { order_index: t.order_index, updated_at: now } })));
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
      enable_screenshot: data.enable_screenshot ?? 0,
      created_at: now,
      updated_at: now,
    };
    ticketsCollection.insert(ticket);
    syncCreate(STORE_NAMES.tickets, ticket);
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

    const updated_at = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at };

    ticketsCollection.update(id, (draft) => {
      if (data.title !== undefined) { draft.title = data.title; updates.title = data.title; }
      if (data.description !== undefined) { draft.description = data.description; updates.description = data.description; }
      if (data.status !== undefined) { draft.status = data.status; updates.status = data.status; }
      if (data.priority !== undefined) { draft.priority = data.priority; updates.priority = data.priority; }
      if (data.assignee_ids !== undefined) { draft.assignee_ids = data.assignee_ids; updates.assignee_ids = data.assignee_ids; }
      if (data.enable_screenshot !== undefined) { draft.enable_screenshot = data.enable_screenshot; updates.enable_screenshot = data.enable_screenshot; }
      draft.updated_at = updated_at;
    });

    syncUpdate(STORE_NAMES.tickets, id, updates);

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
    syncDelete(STORE_NAMES.tickets, id);
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
    syncCreate(STORE_NAMES.projects, project);
    return project;
  },
  setActive(id: string): Project | undefined {
    const now = new Date().toISOString();
    const ids = Array.from(projectsCollection.keys()) as string[];
    if (ids.length > 0) {
      projectsCollection.update(ids, (drafts) => {
        drafts.forEach((draft) => {
          draft.is_active = draft.id === id ? 1 : 0;
          draft.updated_at = now;
        });
      });
      // Sync all project active states
      syncBulkUpdate(STORE_NAMES.projects, ids.map(pid => ({
        id: pid,
        data: { is_active: pid === id ? 1 : 0, updated_at: now }
      })));
    }
    return this.getById(id);
  },
  delete(id: string): boolean {
    projectsCollection.delete(id);
    syncDelete(STORE_NAMES.projects, id);
    return true;
  },
};

/**
 * Sync server-side execution data into memory collections.
 * Server is source of truth; memory collections are for reactive UI.
 */
export const syncFromServer = {
  /** Upsert a conversation from server into memory */
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

  /** Upsert a message from server into memory (skip if already exists) */
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
    syncCreate(STORE_NAMES.workflows, workflow);
    return workflow;
  },
  update(id: string, data: Partial<Pick<Workflow, 'name' | 'description' | 'status' | 'current_node_id'>>): Workflow | undefined {
    const updated_at = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at };
    workflowsCollection.update(id, (draft) => {
      if (data.name !== undefined) { draft.name = data.name; updates.name = data.name; }
      if (data.description !== undefined) { draft.description = data.description; updates.description = data.description; }
      if (data.status !== undefined) { draft.status = data.status; updates.status = data.status; }
      if (data.current_node_id !== undefined) { draft.current_node_id = data.current_node_id; updates.current_node_id = data.current_node_id; }
      draft.updated_at = updated_at;
    });
    syncUpdate(STORE_NAMES.workflows, id, updates);
    return this.getById(id);
  },
  delete(id: string): boolean {
    // Delete all nodes and edges first
    const nodes = Array.from(workflowNodesCollection.values()).filter((n) => n.workflow_id === id);
    const edges = Array.from(workflowEdgesCollection.values()).filter((e) => e.workflow_id === id);
    nodes.forEach((node) => {
      workflowNodesCollection.delete(node.id);
      syncDelete(STORE_NAMES.workflowNodes, node.id);
    });
    edges.forEach((edge) => {
      workflowEdgesCollection.delete(edge.id);
      syncDelete(STORE_NAMES.workflowEdges, edge.id);
    });
    workflowsCollection.delete(id);
    syncDelete(STORE_NAMES.workflows, id);
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
    syncCreate(STORE_NAMES.workflowNodes, node);
    return node;
  },
  updatePosition(id: string, position_x: number, position_y: number): void {
    workflowNodesCollection.update(id, (draft) => {
      draft.position_x = position_x;
      draft.position_y = position_y;
    });
    syncUpdate(STORE_NAMES.workflowNodes, id, { position_x, position_y });
  },
  delete(id: string): boolean {
    // Delete related edges
    const edges = Array.from(workflowEdgesCollection.values()).filter(
      (e) => e.source_node_id === id || e.target_node_id === id
    );
    edges.forEach((edge) => {
      workflowEdgesCollection.delete(edge.id);
      syncDelete(STORE_NAMES.workflowEdges, edge.id);
    });
    workflowNodesCollection.delete(id);
    syncDelete(STORE_NAMES.workflowNodes, id);
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
    syncCreate(STORE_NAMES.workflowEdges, edge);
    return edge;
  },
  delete(id: string): boolean {
    workflowEdgesCollection.delete(id);
    syncDelete(STORE_NAMES.workflowEdges, id);
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

// User Settings (stored in localStorage only)
export interface UserSettings {
  id: string;
  email: string;
  created_at: string;
}

const USER_EMAIL_STORAGE_KEY = 'olly-molly-user-email';

export const userSettingsService = {
  // Get email synchronously from localStorage
  getEmailSync(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(USER_EMAIL_STORAGE_KEY);
  },
  // Get email (async for API compatibility, but uses localStorage)
  async getEmail(): Promise<string | null> {
    return this.getEmailSync();
  },
  // Get full settings
  async get(): Promise<UserSettings | null> {
    const email = this.getEmailSync();
    if (!email) return null;
    return {
      id: 'user_settings',
      email,
      created_at: new Date().toISOString(),
    };
  },
  // Set email
  async set(email: string): Promise<UserSettings> {
    const normalizedEmail = email.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_EMAIL_STORAGE_KEY, normalizedEmail);
    }
    return {
      id: 'user_settings',
      email: normalizedEmail,
      created_at: new Date().toISOString(),
    };
  },
  // Clear user settings (logout)
  async clear(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    }
  },
  // Convert email to safe directory name
  emailToDir(email: string): string {
    return email.replace(/@/g, '_at_').replace(/\./g, '_');
  },
};
