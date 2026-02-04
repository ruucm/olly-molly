import { NextRequest, NextResponse } from 'next/server';
import {
    getSyncDataForTicket,
    getSyncDataSince,
    getConversation,
    getMessages,
} from '@/lib/server-store';

// Track sync request count for debugging
let syncRequestCount = 0;

/**
 * Sync endpoint for browser reconnection (ComfyUI pattern).
 *
 * Browser can fetch all execution data from server memory,
 * even if it was closed during execution.
 *
 * GET /api/conversations/sync?ticket_id=X         -> full sync for ticket
 * GET /api/conversations/sync?ticket_id=X&since=T -> incremental sync
 * GET /api/conversations/sync?conversation_id=X   -> single conversation + messages
 */
export async function GET(request: NextRequest) {
    const reqId = ++syncRequestCount;
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('ticket_id');
    const conversationId = url.searchParams.get('conversation_id');
    const since = url.searchParams.get('since');

    if (conversationId) {
        const conversation = getConversation(conversationId);
        if (!conversation) {
            console.log(`[api:sync] #${reqId} conversation_id=${conversationId.slice(0, 8)} | not found`);
            return NextResponse.json({ conversation: null, messages: [] });
        }
        const messages = getMessages(conversationId);
        console.log(`[api:sync] #${reqId} conversation_id=${conversationId.slice(0, 8)} | status=${conversation.status}, msgs=${messages.length}`);
        return NextResponse.json({ conversation, messages });
    }

    if (ticketId) {
        const data = since
            ? getSyncDataSince(ticketId, since)
            : getSyncDataForTicket(ticketId);
        const runningConvs = data.conversations.filter(c => c.status === 'running').length;
        console.log(`[api:sync] #${reqId} ticket_id=${ticketId.slice(0, 8)} | convs=${data.conversations.length} (running: ${runningConvs}), msgs=${data.messages.length}, statuses=${data.ticketStatuses.length}${since ? ', incremental' : ''}`);
        return NextResponse.json(data);
    }

    console.log(`[api:sync] #${reqId} missing params`);
    return NextResponse.json({ error: 'ticket_id or conversation_id is required' }, { status: 400 });
}
