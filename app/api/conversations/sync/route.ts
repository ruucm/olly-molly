import { NextRequest, NextResponse } from 'next/server';
import {
    getSyncDataForTicket,
    getSyncDataSince,
    getConversation,
    getMessages,
} from '@/lib/server-store';

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
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('ticket_id');
    const conversationId = url.searchParams.get('conversation_id');
    const since = url.searchParams.get('since');

    if (conversationId) {
        const conversation = getConversation(conversationId);
        if (!conversation) {
            return NextResponse.json({ conversation: null, messages: [] });
        }
        const messages = getMessages(conversationId);
        return NextResponse.json({ conversation, messages });
    }

    if (ticketId) {
        const data = since
            ? getSyncDataSince(ticketId, since)
            : getSyncDataForTicket(ticketId);
        return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'ticket_id or conversation_id is required' }, { status: 400 });
}
