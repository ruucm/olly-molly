import { NextRequest, NextResponse } from 'next/server';
import { activityService } from '@/lib/db';

export const dynamic = 'force-static';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ticketId = searchParams.get('ticketId');

        if (!ticketId) {
            return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
        }

        const logs = activityService.getByTicketId(ticketId);
        return NextResponse.json(logs);
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
    }
}
