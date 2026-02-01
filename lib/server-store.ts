/**
 * Server-side in-memory store for execution data.
 *
 * ComfyUI pattern: the server owns all execution state.
 * Browser is just a remote viewer (리모컨).
 *
 * - conversations: created by server when job starts
 * - messages: accumulated by server during streaming
 * - history: completed jobs kept for later retrieval (max 10,000)
 *
 * Data lifecycle:
 *   [submit] POST /api/agent/execute
 *       -> conversation created in memory
 *       -> job spawned
 *   [running] stdout/stderr -> messages accumulated in memory
 *       -> browser polls and reads from memory
 *   [done] process exits
 *       -> conversation status updated
 *       -> moved to history
 *   [reconnect] browser fetches from history
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────────────

export interface ServerConversation {
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

export interface ServerConversationMessage {
    id: string;
    conversation_id: string;
    content: string;
    message_type: 'log' | 'error' | 'success' | 'system';
    created_at: string;
}

// ─── Ticket Status Types ─────────────────────────────────────────────

export type TicketStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEED_FIX' | 'COMPLETE' | 'ON_HOLD';

export interface TicketStatusUpdate {
    ticket_id: string;
    status: TicketStatus;
    updated_at: string;
}

// ─── In-Memory Store ─────────────────────────────────────────────────

const MAX_HISTORY = 10000;

/** All conversations keyed by id */
const conversations = new Map<string, ServerConversation>();

/** Messages keyed by conversation_id -> messages array */
const messagesByConversation = new Map<string, ServerConversationMessage[]>();

/** Ticket statuses keyed by ticket_id */
const ticketStatuses = new Map<string, TicketStatusUpdate>();

// ─── Debug Logging ───────────────────────────────────────────────────

function getMemoryUsage(): string {
    const used = process.memoryUsage();
    return `heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB, rss: ${Math.round(used.rss / 1024 / 1024)}MB`;
}

export function logServerStoreState(context: string): void {
    const runningConvs = Array.from(conversations.values()).filter(c => c.status === 'running').length;
    let totalMessages = 0;
    for (const msgs of messagesByConversation.values()) {
        totalMessages += msgs.length;
    }
    console.log(`[server-store:debug] ${context} | conversations: ${conversations.size} (running: ${runningConvs}), messages: ${totalMessages}, tickets: ${ticketStatuses.size}, memory: ${getMemoryUsage()}`);
}

// ─── Conversation CRUD ───────────────────────────────────────────────

export function createConversation(data: {
    id?: string;
    ticket_id: string;
    agent_id: string;
    provider: 'claude' | 'opencode' | 'codex';
    prompt?: string;
    feedback?: string;
}): ServerConversation {
    const now = new Date().toISOString();
    const conversation: ServerConversation = {
        id: data.id || uuidv4(),
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
    conversations.set(conversation.id, conversation);
    messagesByConversation.set(conversation.id, []);
    enforceHistoryLimit();
    logServerStoreState(`conversation-created:${conversation.id.slice(0, 8)}`);
    return conversation;
}

export function getConversation(id: string): ServerConversation | null {
    return conversations.get(id) || null;
}

export function getConversationsByTicketId(ticketId: string): ServerConversation[] {
    const result: ServerConversation[] = [];
    for (const conv of conversations.values()) {
        if (conv.ticket_id === ticketId) {
            result.push(conv);
        }
    }
    return result.sort((a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
}

export function completeConversation(id: string, data: {
    status: 'completed' | 'failed' | 'cancelled';
    git_commit_hash?: string;
}): void {
    const conv = conversations.get(id);
    if (!conv) return;
    conv.status = data.status;
    conv.git_commit_hash = data.git_commit_hash || null;
    conv.completed_at = new Date().toISOString();
    logServerStoreState(`conversation-${data.status}:${id.slice(0, 8)}`);
}

// ─── Message CRUD ────────────────────────────────────────────────────

export function addMessage(
    conversationId: string,
    content: string,
    type: ServerConversationMessage['message_type'] = 'log',
): ServerConversationMessage {
    const message: ServerConversationMessage = {
        id: uuidv4(),
        conversation_id: conversationId,
        content,
        message_type: type,
        created_at: new Date().toISOString(),
    };
    let messages = messagesByConversation.get(conversationId);
    if (!messages) {
        messages = [];
        messagesByConversation.set(conversationId, messages);
    }
    messages.push(message);
    return message;
}

export function getMessages(conversationId: string): ServerConversationMessage[] {
    return messagesByConversation.get(conversationId) || [];
}

/**
 * Get messages created after a given timestamp (for incremental sync).
 */
export function getMessagesSince(conversationId: string, since: string): ServerConversationMessage[] {
    const messages = messagesByConversation.get(conversationId) || [];
    const sinceTime = new Date(since).getTime();
    return messages.filter(m => new Date(m.created_at).getTime() > sinceTime);
}

/**
 * Get message count (for quick sync check without transferring all data).
 */
export function getMessageCount(conversationId: string): number {
    return (messagesByConversation.get(conversationId) || []).length;
}

// ─── Ticket Status CRUD ──────────────────────────────────────────────

export function updateTicketStatus(ticketId: string, status: TicketStatus): TicketStatusUpdate {
    const update: TicketStatusUpdate = {
        ticket_id: ticketId,
        status,
        updated_at: new Date().toISOString(),
    };
    ticketStatuses.set(ticketId, update);
    console.log(`[server-store] Ticket ${ticketId} status updated to ${status}`);
    return update;
}

export function getTicketStatus(ticketId: string): TicketStatusUpdate | null {
    return ticketStatuses.get(ticketId) || null;
}

export function getTicketStatusesByIds(ticketIds: string[]): TicketStatusUpdate[] {
    const result: TicketStatusUpdate[] = [];
    for (const id of ticketIds) {
        const status = ticketStatuses.get(id);
        if (status) {
            result.push(status);
        }
    }
    return result;
}

export function getAllTicketStatuses(): TicketStatusUpdate[] {
    return Array.from(ticketStatuses.values());
}

// ─── Sync API (for browser reconnection) ─────────────────────────────

export interface SyncData {
    conversations: ServerConversation[];
    messages: ServerConversationMessage[];
    ticketStatuses: TicketStatusUpdate[];
}

/**
 * Get all conversations and their messages for a ticket.
 * Used when browser reconnects after being closed.
 */
export function getSyncDataForTicket(ticketId: string): SyncData {
    const convs = getConversationsByTicketId(ticketId);
    const msgs: ServerConversationMessage[] = [];
    for (const conv of convs) {
        msgs.push(...getMessages(conv.id));
    }
    const status = getTicketStatus(ticketId);
    return {
        conversations: convs,
        messages: msgs,
        ticketStatuses: status ? [status] : [],
    };
}

/**
 * Get incremental sync data - only conversations/messages updated since a timestamp.
 */
export function getSyncDataSince(ticketId: string, since: string): SyncData {
    const sinceTime = new Date(since).getTime();
    const allConvs = getConversationsByTicketId(ticketId);

    // Include conversations that were created or completed after `since`
    const convs = allConvs.filter(c => {
        const createdAt = new Date(c.created_at).getTime();
        const completedAt = c.completed_at ? new Date(c.completed_at).getTime() : 0;
        return createdAt > sinceTime || completedAt > sinceTime;
    });

    // Include all messages after `since` for ALL conversations of this ticket
    const msgs: ServerConversationMessage[] = [];
    for (const conv of allConvs) {
        msgs.push(...getMessagesSince(conv.id, since));
    }

    // Include ticket status if updated since
    const status = getTicketStatus(ticketId);
    const ticketStatusList: TicketStatusUpdate[] = [];
    if (status && new Date(status.updated_at).getTime() > sinceTime) {
        ticketStatusList.push(status);
    }

    return { conversations: convs, messages: msgs, ticketStatuses: ticketStatusList };
}

// ─── History Management ──────────────────────────────────────────────

function enforceHistoryLimit(): void {
    if (conversations.size <= MAX_HISTORY) return;

    // Find oldest completed conversations to evict
    const completed: ServerConversation[] = [];
    for (const conv of conversations.values()) {
        if (conv.status !== 'running') {
            completed.push(conv);
        }
    }
    completed.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const toRemove = conversations.size - MAX_HISTORY;
    for (let i = 0; i < toRemove && i < completed.length; i++) {
        conversations.delete(completed[i].id);
        messagesByConversation.delete(completed[i].id);
    }
}

// ─── Server Startup Recovery ─────────────────────────────────────────

/**
 * Mark any "running" conversations as failed on server startup.
 * After a server restart, those processes are dead.
 */
export function recoverOrphanedConversations(): number {
    let count = 0;
    for (const conv of conversations.values()) {
        if (conv.status === 'running') {
            conv.status = 'failed';
            conv.completed_at = new Date().toISOString();
            addMessage(conv.id, '⚠️ Server restarted during execution', 'system');
            count++;
        }
    }
    return count;
}
