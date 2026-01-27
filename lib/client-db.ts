'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';

// Polyfill crypto.randomUUID for non-secure contexts (HTTP external access)
if (typeof window !== 'undefined' && typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = () => uuidv4() as `${string}-${string}-${string}-${string}-${string}`;
}
import {
  createCollection,
  useLiveQuery,
  eq,
} from '@tanstack/react-db';
import type { SyncConfig } from '@tanstack/react-db';
import type { PendingMutation } from '@tanstack/react-db';
import { DEFAULT_AGENTS } from '@/agents';

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

const DB_NAME = 'olly-molly';
const DB_VERSION = 2;

const STORE_NAMES = {
  members: 'members',
  tickets: 'tickets',
  activityLogs: 'activity_logs',
  projects: 'projects',
  agentWorkLogs: 'agent_work_logs',
  conversations: 'conversations',
  conversationMessages: 'conversation_messages',
  workflows: 'workflows',
  workflowNodes: 'workflow_nodes',
  workflowEdges: 'workflow_edges',
  sqliteDump: 'sqlite_dump',
  meta: 'meta',
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

let dbPromise: Promise<IDBPDatabase> | null = null;

const DB_BACKUP_VERSION = 1;
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const BACKUP_STORE_NAMES: StoreName[] = [
  STORE_NAMES.members,
  STORE_NAMES.tickets,
  STORE_NAMES.activityLogs,
  STORE_NAMES.projects,
  STORE_NAMES.agentWorkLogs,
  STORE_NAMES.conversations,
  STORE_NAMES.conversationMessages,
  STORE_NAMES.workflows,
  STORE_NAMES.workflowNodes,
  STORE_NAMES.workflowEdges,
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
      await fetch('/api/db/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
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
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAMES.members)) {
          db.createObjectStore(STORE_NAMES.members, { keyPath: 'id' });
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
        if (!db.objectStoreNames.contains(STORE_NAMES.sqliteDump)) {
          db.createObjectStore(STORE_NAMES.sqliteDump, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.meta)) {
          db.createObjectStore(STORE_NAMES.meta, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

type IndexedDbSync<T extends { id: string }> = SyncConfig<T> & {
  confirmOperationsSync: (mutations: Array<PendingMutation<T>>) => void;
};

function createIndexedDbSync<T extends { id: string }>(storeName: StoreName): IndexedDbSync<T> {
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

  return {
    sync: (params) => {
      syncParams = params;
      let cancelled = false;
      void (async () => {
        try {
          const db = await getIdb();
          const rows = await db.getAll(storeName);
          if (cancelled) return;
          if (rows.length === 0) {
            params.markReady();
            return;
          }
          params.begin();
          rows.forEach((row) => params.write({ type: 'insert', value: row }));
          params.commit();
          params.markReady();
        } catch (error) {
          console.error(`[db] Failed to load ${storeName} from IndexedDB`, error);
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

function scheduleSqliteDump() {
  if (typeof window === 'undefined') return;
  if (sqliteDumpTimer) {
    window.clearTimeout(sqliteDumpTimer);
  }
  sqliteDumpTimer = window.setTimeout(() => {
    sqliteDumpTimer = null;
    void persistSqliteDump();
  }, 500);
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
  try {
    const db = await getIdb();
    const members = Array.from(membersCollection.values()) as unknown as Member[];
    const tickets = Array.from(ticketsCollection.values()) as unknown as Ticket[];
    const activityLogs = Array.from(activityLogsCollection.values()) as unknown as ActivityLog[];
    const projects = Array.from(projectsCollection.values()) as unknown as Project[];
    const agentWorkLogs = Array.from(agentWorkLogsCollection.values()) as unknown as AgentWorkLog[];
    const conversations = Array.from(conversationsCollection.values()) as unknown as Conversation[];
    const conversationMessages = Array.from(conversationMessagesCollection.values()) as unknown as ConversationMessage[];

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
      'created_at',
      'updated_at',
    ], tickets.map(t => ({
      ...t,
      assignee_ids: JSON.stringify(t.assignee_ids || []),
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

    insertRows<ConversationMessage>('conversation_messages', [
      'id',
      'conversation_id',
      'content',
      'message_type',
      'created_at',
    ], conversationMessages);

    chunks.push('COMMIT;');

    await db.put(STORE_NAMES.sqliteDump, {
      id: 'main',
      sql: chunks.join('\n'),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[db] Failed to persist sqlite dump', error);
  }
}

function createIndexedDbCollection<T extends { id: string }>(storeName: StoreName) {
  const sync = createIndexedDbSync<T>(storeName);
  return createCollection<T>({
    id: storeName,
    getKey: (item) => item.id,
    sync,
    onInsert: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
    onUpdate: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
    onDelete: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.delete(storeName, mutation.key as string)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      scheduleSqliteDump();
    },
  });
}

function createIndexedDbCollectionWithOptions<T extends { id: string }>(
  storeName: StoreName,
  options?: { scheduleSqliteDump?: boolean },
) {
  const shouldScheduleSqliteDump = options?.scheduleSqliteDump ?? true;
  const sync = createIndexedDbSync<T>(storeName);
  return createCollection<T>({
    id: storeName,
    getKey: (item) => item.id,
    sync,
    onInsert: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
    onUpdate: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.put(storeName, mutation.modified)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
    onDelete: async ({ transaction }) => {
      const db = await getIdb();
      await Promise.all(transaction.mutations.map((mutation) => db.delete(storeName, mutation.key as string)));
      sync.confirmOperationsSync(transaction.mutations as Array<PendingMutation<T>>);
      if (shouldScheduleSqliteDump) scheduleSqliteDump();
    },
  });
}

const membersCollection = createIndexedDbCollection<Member>(STORE_NAMES.members);
const ticketsCollection = createIndexedDbCollection<Ticket>(STORE_NAMES.tickets);
const activityLogsCollection = createIndexedDbCollection<ActivityLog>(STORE_NAMES.activityLogs);
const projectsCollection = createIndexedDbCollection<Project>(STORE_NAMES.projects);
const agentWorkLogsCollection = createIndexedDbCollection<AgentWorkLog>(STORE_NAMES.agentWorkLogs);
const conversationsCollection = createIndexedDbCollection<Conversation>(STORE_NAMES.conversations);
// Conversation messages can grow rapidly while an agent is running. Avoid rebuilding the entire
// sqlite dump on every streamed log append; the dump will still be refreshed by higher-level
// updates (e.g. conversation completion, ticket changes).
const conversationMessagesCollection = createIndexedDbCollectionWithOptions<ConversationMessage>(
  STORE_NAMES.conversationMessages,
  { scheduleSqliteDump: false },
);
const workflowsCollection = createIndexedDbCollection<Workflow>(STORE_NAMES.workflows);
const workflowNodesCollection = createIndexedDbCollection<WorkflowNode>(STORE_NAMES.workflowNodes);
const workflowEdgesCollection = createIndexedDbCollection<WorkflowEdge>(STORE_NAMES.workflowEdges);

let initPromise: Promise<void> | null = null;

export function initClientDb(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await membersCollection.preload();
    if (membersCollection.size === 0) {
      const now = new Date().toISOString();
      membersCollection.insert(
        DEFAULT_AGENTS.map((member) => ({
          ...member,
          created_at: now,
          updated_at: now,
        })),
      );
    }
    scheduleSqliteDump();
    startAutoBackup();
  })();
  return initPromise;
}

export function useMembers() {
  const { data } = useLiveQuery(() => membersCollection);
  return (data ?? []) as Member[];
}

export function useTickets() {
  const { data } = useLiveQuery(() => ticketsCollection);
  const tickets = (data ?? []) as Ticket[];
  return tickets.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

export function useProjects() {
  const { data } = useLiveQuery(() => projectsCollection);
  return (data ?? []) as Project[];
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
    return Array.from(membersCollection.values());
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
  update(id: string, data: Partial<Pick<Member, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'can_generate_images' | 'can_log_screenshots'>>): Member | undefined {
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
      draft.updated_at = new Date().toISOString();
    });
    return this.getById(id);
  },
  create(data: { role: string; name: string; avatar?: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }): Member {
    const now = new Date().toISOString();
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
      created_at: now,
      updated_at: now,
    };
    membersCollection.insert(member);
    return member;
  },
  delete(id: string): { success: boolean; error?: string } {
    const member = this.getById(id);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }
    if (member.is_default === 1) {
      return { success: false, error: 'Cannot delete default team members' };
    }
    membersCollection.delete(id);
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
  create(data: { title: string; description?: string; priority?: Ticket['priority']; assignee_ids?: string[]; project_id?: string; created_by?: string }): Ticket {
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
      order_index: Date.now(),
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
  update(id: string, data: Partial<Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'assignee_ids'>>, updatedBy?: string): Ticket | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    ticketsCollection.update(id, (draft) => {
      if (data.title !== undefined) draft.title = data.title;
      if (data.description !== undefined) draft.description = data.description;
      if (data.status !== undefined) draft.status = data.status;
      if (data.priority !== undefined) draft.priority = data.priority;
      if (data.assignee_ids !== undefined) draft.assignee_ids = data.assignee_ids;
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
      return a.name.localeCompare(b.name);
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

export const collections = {
  membersCollection,
  ticketsCollection,
  activityLogsCollection,
  projectsCollection,
  agentWorkLogsCollection,
  conversationsCollection,
  conversationMessagesCollection,
  workflowsCollection,
  workflowNodesCollection,
  workflowEdgesCollection,
};
