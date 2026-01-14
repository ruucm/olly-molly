import { NextRequest, NextResponse } from 'next/server';
import { conversationService, conversationMessageService } from '@/lib/db';

// GET /api/conversations?ticket_id=xxx
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ticketId = searchParams.get('ticket_id');

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
