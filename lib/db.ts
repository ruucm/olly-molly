import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Check if we're in build phase - skip DB operations during build
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' ||
  process.argv.includes('build') ||
  process.env.npm_lifecycle_event === 'build';

// Database file path
const DB_PATH = path.join(process.cwd(), 'db', 'dev.sqlite');

// Lazy database connection - only initialize when actually needed
let _db: DatabaseType | null = null;
let _initialized = false;

function getDb(): DatabaseType {
  if (_db) return _db;

  // During build phase, throw an error that will be caught by try-catch
  if (isBuildPhase) {
    throw new Error('Database not available during build phase');
  }

  // Ensure db directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create database connection
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks

  // Initialize schema and run migrations only once
  if (!_initialized) {
    initializeDatabase(_db);
    runMigrations(_db);
    _initialized = true;
  }

  return _db;
}

// Initialize database schema
function initializeDatabase(db: DatabaseType) {
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  try {
    db.exec(schema);
  } catch (error) {
    const message = String(error);
    if (message.includes('no column named')) {
      console.warn('[db] Schema insert failed due to missing columns, running migrations and retrying...');
      runMigrations(db);
      db.exec(schema);
    } else {
      throw error;
    }
  }

  // Load projects schema if exists
  const projectsSchemaPath = path.join(process.cwd(), 'db', 'schema-projects.sql');
  if (fs.existsSync(projectsSchemaPath)) {
    const projectsSchema = fs.readFileSync(projectsSchemaPath, 'utf-8');
    db.exec(projectsSchema);
  }

  // Load conversations schema if exists
  const conversationsSchemaPath = path.join(process.cwd(), 'db', 'schema-conversations.sql');
  if (fs.existsSync(conversationsSchemaPath)) {
    const conversationsSchema = fs.readFileSync(conversationsSchemaPath, 'utf-8');
    db.exec(conversationsSchema);
  }
}

// Run migrations for columns that may not exist in older databases
function runMigrations(db: DatabaseType) {
  // Check if profile_image column exists in members table
  const tableInfo = db.prepare("PRAGMA table_info(members)").all() as { name: string }[];
  const hasProfileImage = tableInfo.some(col => col.name === 'profile_image');
  const hasCanGenerateImages = tableInfo.some(col => col.name === 'can_generate_images');
  const hasCanLogScreenshots = tableInfo.some(col => col.name === 'can_log_screenshots');

  if (!hasProfileImage) {
    console.log('Running migration: Adding profile_image column to members table');
    db.exec('ALTER TABLE members ADD COLUMN profile_image TEXT');
  }

  // Check if is_default column exists in members table
  const hasIsDefault = tableInfo.some(col => col.name === 'is_default');

  if (!hasIsDefault) {
    console.log('Running migration: Adding is_default column to members table');
    db.exec('ALTER TABLE members ADD COLUMN is_default INTEGER DEFAULT 0');

    // Mark existing default members as is_default = 1
    const defaultMemberIds = ['pm-001', 'fe-001', 'be-001', 'qa-001', 'devops-001', 'bughunter-001'];
    const placeholders = defaultMemberIds.map(() => '?').join(',');
    db.prepare(`UPDATE members SET is_default = 1 WHERE id IN (${placeholders})`).run(...defaultMemberIds);
    console.log('Migration: Marked default members with is_default = 1');
  }

  if (!hasCanGenerateImages) {
    console.log('Running migration: Adding can_generate_images column to members table');
    db.exec('ALTER TABLE members ADD COLUMN can_generate_images INTEGER DEFAULT 0');

    const defaultImageMemberIds = ['fe-001', 'bughunter-001'];
    const placeholders = defaultImageMemberIds.map(() => '?').join(',');
    db.prepare(`UPDATE members SET can_generate_images = 1 WHERE id IN (${placeholders})`).run(...defaultImageMemberIds);
  }

  if (!hasCanLogScreenshots) {
    console.log('Running migration: Adding can_log_screenshots column to members table');
    db.exec('ALTER TABLE members ADD COLUMN can_log_screenshots INTEGER DEFAULT 0');

    const defaultScreenshotMemberIds = ['fe-001', 'qa-001'];
    const placeholders = defaultScreenshotMemberIds.map(() => '?').join(',');
    db.prepare(`UPDATE members SET can_log_screenshots = 1 WHERE id IN (${placeholders})`).run(...defaultScreenshotMemberIds);
  }

  // Check if CHECK constraint needs updating for BUG_HUNTER role
  // We detect this by checking if BUG_HUNTER already exists
  const bugHunter = db.prepare("SELECT id FROM members WHERE id = 'bughunter-001'").get();
  if (!bugHunter) {
    console.log('Running migration: Updating members table for BUG_HUNTER role');

    // SQLite doesn't support ALTER CHECK constraint, so we need to recreate the table
    // First, check if the old constraint exists by trying to insert and catching error
    try {
      // Disable foreign key checks temporarily
      db.exec('PRAGMA foreign_keys = OFF;');

      db.exec(`
        -- Create new table with updated CHECK constraint
        CREATE TABLE IF NOT EXISTS members_new (
          id TEXT PRIMARY KEY,
          role TEXT NOT NULL CHECK(role IN ('PM', 'FE_DEV', 'BACKEND_DEV', 'QA', 'DEVOPS', 'BUG_HUNTER')),
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

        -- Copy existing data
        INSERT OR IGNORE INTO members_new (id, role, name, avatar, profile_image, system_prompt, is_default, can_generate_images, can_log_screenshots, created_at, updated_at)
        SELECT id, role, name, avatar, profile_image, system_prompt, is_default, can_generate_images, can_log_screenshots, created_at, updated_at FROM members;

        -- Drop old table
        DROP TABLE members;

        -- Rename new table
        ALTER TABLE members_new RENAME TO members;
      `);

      // Re-enable foreign key checks
      db.exec('PRAGMA foreign_keys = ON;');

      console.log('Migration: Recreated members table with BUG_HUNTER support');
    } catch (e) {
      // Make sure foreign keys are re-enabled even on error
      try { db.exec('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
      console.log('Migration: Table recreation skipped or already done:', e);
    }

    // Now add Bug Hunter member
    console.log('Running migration: Adding Bug Hunter member');
    db.prepare(`
      INSERT OR IGNORE INTO members (id, role, name, avatar, system_prompt) VALUES
      ('bughunter-001', 'BUG_HUNTER', 'Bug Hunter', '🐛', 'You are a Bug Hunter AI agent - a Full Stack Developer specialized in fixing bugs. Your responsibilities include:
- Quickly diagnosing and fixing bugs reported by users
- Debugging both frontend and backend issues
- Analyzing error logs and stack traces
- Writing fixes with minimal side effects
- Adding regression tests to prevent bugs from recurring
- Identifying root causes and proposing long-term solutions

When given a bug report, quickly identify the issue, implement a fix, and verify it works correctly.')
    `).run();
  }

  const conversationsTable = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversations'
  `).get() as { sql?: string } | undefined;

  if (conversationsTable?.sql && !conversationsTable.sql.includes("'codex'")) {
    console.log('Running migration: Updating conversations provider constraint to include codex');
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE conversations RENAME TO conversations_old;
        CREATE TABLE conversations (
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
        INSERT INTO conversations (id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at)
        SELECT id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at
        FROM conversations_old;
        DROP TABLE conversations_old;
        CREATE INDEX IF NOT EXISTS idx_conversations_ticket ON conversations(ticket_id);
        COMMIT;
      `);
    } catch (error) {
      const message = String(error);
      const getTableSql = (name: string) => {
        const row = db.prepare(`
          SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?
        `).get(name) as { sql?: string } | undefined;
        return row?.sql;
      };

      const conversationsSql = getTableSql('conversations');
      if (conversationsSql?.includes("'codex'")) {
        console.log('Migration: conversations provider already updated, skipping');
        return;
      }

      const hasConversationsOld = Boolean(getTableSql('conversations_old'));

      try {
        if (hasConversationsOld && !conversationsSql) {
          db.exec(`
            BEGIN;
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
            INSERT INTO conversations (id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at)
            SELECT id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at
            FROM conversations_old;
            DROP TABLE conversations_old;
            CREATE INDEX IF NOT EXISTS idx_conversations_ticket ON conversations(ticket_id);
            COMMIT;
          `);
          console.log('Migration: recovered conversations table from conversations_old');
          return;
        }

        if (conversationsSql && !conversationsSql.includes("'codex'")) {
          db.exec(`
            BEGIN;
            DROP TABLE IF EXISTS conversations_new;
            CREATE TABLE conversations_new (
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
            INSERT INTO conversations_new (id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at)
            SELECT id, ticket_id, agent_id, provider, prompt, feedback, status, git_commit_hash, started_at, completed_at, created_at
            FROM conversations;
            DROP TABLE conversations;
            ALTER TABLE conversations_new RENAME TO conversations;
            CREATE INDEX IF NOT EXISTS idx_conversations_ticket ON conversations(ticket_id);
            COMMIT;
          `);
          console.log('Migration: updated conversations provider constraint with fallback');
          return;
        }
      } catch (fallbackError) {
        console.warn(`Migration: fallback failed for conversations provider constraint: ${fallbackError}`);
      }

      console.warn(`Migration: failed to update conversations provider constraint: ${message}`);
    }
  }

  const conversationMessagesTable = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversation_messages'
  `).get() as { sql?: string } | undefined;

  if (conversationMessagesTable?.sql?.includes('"conversations_old"')) {
    console.log('Running migration: Fixing conversation_messages foreign key reference');
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE conversation_messages RENAME TO conversation_messages_old;
        CREATE TABLE conversation_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          message_type TEXT DEFAULT 'log' CHECK(message_type IN ('log', 'error', 'success', 'system')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO conversation_messages (id, conversation_id, content, message_type, created_at)
        SELECT id, conversation_id, content, message_type, created_at
        FROM conversation_messages_old;
        DROP TABLE conversation_messages_old;
        CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
        COMMIT;
      `);
    } catch (error) {
      console.warn(`Migration: failed to fix conversation_messages foreign key: ${error}`);
    }
  }
}

// Types
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
  assignee_id: string | null;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Member;
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
  member?: Member;
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
  agent?: Member;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  content: string;
  message_type: 'log' | 'error' | 'success' | 'system';
  created_at: string;
}

// Member operations
export const memberService = {
  getAll(): Member[] {
    return getDb().prepare('SELECT * FROM members ORDER BY role').all() as Member[];
  },

  getById(id: string): Member | undefined {
    return getDb().prepare('SELECT * FROM members WHERE id = ?').get(id) as Member | undefined;
  },

  getByRole(role: string): Member | undefined {
    return getDb().prepare('SELECT * FROM members WHERE role = ?').get(role) as Member | undefined;
  },

  updateSystemPrompt(id: string, systemPrompt: string): Member | undefined {
    getDb().prepare(`
      UPDATE members 
      SET system_prompt = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(systemPrompt, id);
    return this.getById(id);
  },

  update(id: string, data: Partial<Pick<Member, 'name' | 'avatar' | 'profile_image' | 'system_prompt' | 'can_generate_images' | 'can_log_screenshots'>>): Member | undefined {
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(data.avatar);
    }
    if (data.profile_image !== undefined) {
      updates.push('profile_image = ?');
      values.push(data.profile_image);
    }
    if (data.system_prompt !== undefined) {
      updates.push('system_prompt = ?');
      values.push(data.system_prompt);
    }
    if (data.can_generate_images !== undefined) {
      updates.push('can_generate_images = ?');
      values.push(data.can_generate_images ? '1' : '0');
    }
    if (data.can_log_screenshots !== undefined) {
      updates.push('can_log_screenshots = ?');
      values.push(data.can_log_screenshots ? '1' : '0');
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      getDb().prepare(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id);
  },

  create(data: { role: string; name: string; avatar?: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }): Member {
    const id = uuidv4();
    const canGenerate = data.can_generate_images ? 1 : 0;
    const canLogScreenshots = data.can_log_screenshots ? 1 : 0;
    getDb().prepare(`
      INSERT INTO members (id, role, name, avatar, system_prompt, is_default, can_generate_images, can_log_screenshots)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.role, data.name, data.avatar || null, data.system_prompt, canGenerate, canLogScreenshots);
    return this.getById(id)!;
  },

  delete(id: string): { success: boolean; error?: string } {
    const member = this.getById(id);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }

    if (member.is_default === 1) {
      return { success: false, error: 'Cannot delete default team members' };
    }

    const result = getDb().prepare('DELETE FROM members WHERE id = ?').run(id);
    return { success: result.changes > 0 };
  }
};

// Ticket operations
export const ticketService = {
  getAll(status?: string, projectId?: string): Ticket[] {
    let query = `
      SELECT t.*, m.name as assignee_name, m.avatar as assignee_avatar, m.role as assignee_role
      FROM tickets t
      LEFT JOIN members m ON t.assignee_id = m.id
    `;
    const conditions: string[] = [];
    const params: (string | null)[] = [];

    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    if (projectId) {
      conditions.push('t.project_id = ?');
      params.push(projectId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC';
    const tickets = getDb().prepare(query).all(...params) as (Ticket & { assignee_name?: string; assignee_avatar?: string; assignee_role?: string })[];
    return tickets.map(t => ({
      ...t,
      assignee: t.assignee_id ? {
        id: t.assignee_id,
        name: t.assignee_name!,
        avatar: t.assignee_avatar!,
        role: t.assignee_role as Member['role']
      } as Member : undefined
    }));
  },

  getById(id: string): Ticket | undefined {
    const ticket = getDb().prepare(`
      SELECT t.*, m.name as assignee_name, m.avatar as assignee_avatar, m.role as assignee_role
      FROM tickets t
      LEFT JOIN members m ON t.assignee_id = m.id
      WHERE t.id = ?
    `).get(id) as (Ticket & { assignee_name?: string; assignee_avatar?: string; assignee_role?: string }) | undefined;

    if (!ticket) return undefined;

    return {
      ...ticket,
      assignee: ticket.assignee_id ? {
        id: ticket.assignee_id,
        name: ticket.assignee_name!,
        avatar: ticket.assignee_avatar!,
        role: ticket.assignee_role as Member['role']
      } as Member : undefined
    };
  },

  create(data: { title: string; description?: string; priority?: Ticket['priority']; assignee_id?: string; project_id?: string; created_by?: string }): Ticket {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO tickets (id, title, description, priority, assignee_id, project_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, data.description || null, data.priority || 'MEDIUM', data.assignee_id || null, data.project_id || null, data.created_by || null);

    // Log creation
    activityService.log({
      ticket_id: id,
      member_id: data.created_by || null,
      action: 'CREATED',
      new_value: data.title,
      details: `Ticket "${data.title}" was created`
    });

    return this.getById(id)!;
  },

  update(id: string, data: Partial<Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'assignee_id'>>, updatedBy?: string): Ticket | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined && data.status !== current.status) {
      updates.push('status = ?');
      values.push(data.status);
      activityService.log({
        ticket_id: id,
        member_id: updatedBy || null,
        action: 'STATUS_CHANGED',
        old_value: current.status,
        new_value: data.status,
        details: `Status changed from ${current.status} to ${data.status}`
      });
    }
    if (data.priority !== undefined && data.priority !== current.priority) {
      updates.push('priority = ?');
      values.push(data.priority);
      activityService.log({
        ticket_id: id,
        member_id: updatedBy || null,
        action: 'PRIORITY_CHANGED',
        old_value: current.priority,
        new_value: data.priority,
        details: `Priority changed from ${current.priority} to ${data.priority}`
      });
    }
    if (data.assignee_id !== undefined && data.assignee_id !== current.assignee_id) {
      updates.push('assignee_id = ?');
      values.push(data.assignee_id);
      const newAssignee = data.assignee_id ? memberService.getById(data.assignee_id) : null;
      const oldAssignee = current.assignee_id ? memberService.getById(current.assignee_id) : null;
      activityService.log({
        ticket_id: id,
        member_id: updatedBy || null,
        action: 'ASSIGNED',
        old_value: oldAssignee?.name || null,
        new_value: newAssignee?.name || null,
        details: newAssignee
          ? `Assigned to ${newAssignee.name}`
          : 'Unassigned'
      });
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      getDb().prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id);
  },

  delete(id: string): boolean {
    const result = getDb().prepare('DELETE FROM tickets WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

// Activity log operations
export const activityService = {
  log(data: { ticket_id: string; member_id: string | null; action: string; old_value?: string | null; new_value?: string | null; details?: string | null }): ActivityLog {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO activity_logs (id, ticket_id, member_id, action, old_value, new_value, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.ticket_id, data.member_id, data.action, data.old_value || null, data.new_value || null, data.details || null);
    return this.getById(id)!;
  },

  getById(id: string): ActivityLog | undefined {
    return getDb().prepare(`
      SELECT al.*, m.name as member_name, m.avatar as member_avatar
      FROM activity_logs al
      LEFT JOIN members m ON al.member_id = m.id
      WHERE al.id = ?
    `).get(id) as ActivityLog | undefined;
  },

  getByTicketId(ticketId: string): ActivityLog[] {
    const logs = getDb().prepare(`
      SELECT al.*, m.name as member_name, m.avatar as member_avatar, m.role as member_role
      FROM activity_logs al
      LEFT JOIN members m ON al.member_id = m.id
      WHERE al.ticket_id = ?
      ORDER BY al.created_at DESC
    `).all(ticketId) as (ActivityLog & { member_name?: string; member_avatar?: string; member_role?: string })[];

    return logs.map(log => ({
      ...log,
      member: log.member_id ? {
        id: log.member_id,
        name: log.member_name!,
        avatar: log.member_avatar!,
        role: log.member_role as Member['role']
      } as Member : undefined
    }));
  }
};

// Project operations
export const projectService = {
  getAll(): Project[] {
    return getDb().prepare('SELECT * FROM projects ORDER BY is_active DESC, name ASC').all() as Project[];
  },

  getById(id: string): Project | undefined {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  },

  getActive(): Project | undefined {
    return getDb().prepare('SELECT * FROM projects WHERE is_active = 1').get() as Project | undefined;
  },

  create(data: { name: string; path: string; description?: string }): Project {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO projects (id, name, path, description)
      VALUES (?, ?, ?, ?)
    `).run(id, data.name, data.path, data.description || null);
    return this.getById(id)!;
  },

  setActive(id: string): Project | undefined {
    // Deactivate all projects first
    getDb().prepare('UPDATE projects SET is_active = 0').run();
    // Activate the selected project
    getDb().prepare('UPDATE projects SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return this.getById(id);
  },

  delete(id: string): boolean {
    const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

// Agent work log operations
export const agentWorkLogService = {
  create(data: {
    ticket_id: string;
    agent_id: string;
    project_id: string;
    command: string;
    prompt?: string;
  }): AgentWorkLog {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO agent_work_logs (id, ticket_id, agent_id, project_id, command, prompt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.ticket_id, data.agent_id, data.project_id, data.command, data.prompt || null);
    return this.getById(id)!;
  },

  getById(id: string): AgentWorkLog | undefined {
    return getDb().prepare('SELECT * FROM agent_work_logs WHERE id = ?').get(id) as AgentWorkLog | undefined;
  },

  getByTicketId(ticketId: string): AgentWorkLog[] {
    return getDb().prepare(`
      SELECT awl.*, m.name as agent_name, m.avatar as agent_avatar, p.name as project_name
      FROM agent_work_logs awl
      LEFT JOIN members m ON awl.agent_id = m.id
      LEFT JOIN projects p ON awl.project_id = p.id
      WHERE awl.ticket_id = ?
      ORDER BY awl.started_at DESC
    `).all(ticketId) as AgentWorkLog[];
  },

  complete(id: string, data: {
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
    output?: string;
    git_commit_hash?: string;
  }): AgentWorkLog | undefined {
    const log = this.getById(id);
    if (!log) return undefined;

    const startTime = new Date(log.started_at).getTime();
    const duration = Date.now() - startTime;

    getDb().prepare(`
      UPDATE agent_work_logs 
      SET status = ?, output = ?, git_commit_hash = ?, completed_at = CURRENT_TIMESTAMP, duration_ms = ?
      WHERE id = ?
    `).run(data.status, data.output || null, data.git_commit_hash || null, duration, id);

    return this.getById(id);
  }
};

// Conversation operations
export const conversationService = {
  create(data: {
    ticket_id: string;
    agent_id: string;
    provider: 'claude' | 'opencode' | 'codex';
    prompt?: string;
    feedback?: string;
  }): Conversation {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO conversations (id, ticket_id, agent_id, provider, prompt, feedback)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.ticket_id, data.agent_id, data.provider, data.prompt || null, data.feedback || null);
    return this.getById(id)!;
  },

  getById(id: string): Conversation | undefined {
    const conversation = getDb().prepare(`
      SELECT c.*, m.name as agent_name, m.avatar as agent_avatar, m.role as agent_role
      FROM conversations c
      LEFT JOIN members m ON c.agent_id = m.id
      WHERE c.id = ?
    `).get(id) as (Conversation & { agent_name?: string; agent_avatar?: string; agent_role?: string }) | undefined;

    if (!conversation) return undefined;

    return {
      ...conversation,
      agent: conversation.agent_id ? {
        id: conversation.agent_id,
        name: conversation.agent_name!,
        avatar: conversation.agent_avatar!,
        role: conversation.agent_role as Member['role']
      } as Member : undefined
    };
  },

  getByTicketId(ticketId: string): Conversation[] {
    const conversations = getDb().prepare(`
      SELECT c.*, m.name as agent_name, m.avatar as agent_avatar, m.role as agent_role
      FROM conversations c
      LEFT JOIN members m ON c.agent_id = m.id
      WHERE c.ticket_id = ?
      ORDER BY c.started_at DESC
    `).all(ticketId) as (Conversation & { agent_name?: string; agent_avatar?: string; agent_role?: string })[];

    return conversations.map(conv => ({
      ...conv,
      agent: conv.agent_id ? {
        id: conv.agent_id,
        name: conv.agent_name!,
        avatar: conv.agent_avatar!,
        role: conv.agent_role as Member['role']
      } as Member : undefined
    }));
  },

  updateStatus(id: string, status: Conversation['status'], commitHash?: string): void {
    getDb().prepare(`
      UPDATE conversations 
      SET status = ?, git_commit_hash = ?
      WHERE id = ?
    `).run(status, commitHash || null, id);
  },

  complete(id: string, data: {
    status: Conversation['status'];
    git_commit_hash?: string;
  }): void {
    getDb().prepare(`
      UPDATE conversations 
      SET status = ?, git_commit_hash = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.status, data.git_commit_hash || null, id);
  }
};

// Conversation message operations
export const conversationMessageService = {
  create(conversationId: string, content: string, type: ConversationMessage['message_type'] = 'log'): ConversationMessage {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO conversation_messages (id, conversation_id, content, message_type)
      VALUES (?, ?, ?, ?)
    `).run(id, conversationId, content, type);
    return this.getById(id)!;
  },

  getById(id: string): ConversationMessage | undefined {
    return getDb().prepare('SELECT * FROM conversation_messages WHERE id = ?').get(id) as ConversationMessage | undefined;
  },

  getByConversationId(conversationId: string): ConversationMessage[] {
    return getDb().prepare(`
      SELECT * FROM conversation_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC
    `).all(conversationId) as ConversationMessage[];
  },

  appendLog(conversationId: string, content: string): void {
    this.create(conversationId, content, 'log');
  }
};

// Export the lazy getter instead of direct db instance
export default { getDb };
