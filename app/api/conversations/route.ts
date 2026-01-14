import { NextRequest, NextResponse } from 'next/server';
import { conversationService, conversationMessageService } from '@/lib/db';

export const dynamic = 'force-static';

// GET /api/conversations?ticket_id=xxx
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const ticketId = searchParams.get('ticket_id');

        if (id) {
            const conversation = conversationService.getById(id);
            if (!conversation) {
                return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
            }

            const messages = conversationMessageService.getByConversationId(id);
            return NextResponse.json({ conversation, messages });
        }

        if (!ticketId) {
            return NextResponse.json({ error: 'ticket_id is required' }, { status: 400 });
        }

        const conversations = conversationService.getByTicketId(ticketId);

        return NextResponse.json({ conversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json({
            error: 'Failed to fetch conversations',
            details: String(error)
        }, { status: 500 });
    }
}
