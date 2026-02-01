import { NextRequest, NextResponse } from 'next/server';
import { getAllTicketStatuses, getTicketStatusesByIds } from '@/lib/server-store';

/**
 * Sync endpoint for ticket statuses.
 * Returns all ticket statuses stored on the server.
 *
 * GET /api/tickets/sync              -> all ticket statuses
 * GET /api/tickets/sync?ids=X,Y,Z    -> specific ticket statuses
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');

    if (idsParam) {
        const ids = idsParam.split(',').filter(Boolean);
        const statuses = getTicketStatusesByIds(ids);
        return NextResponse.json({ ticketStatuses: statuses });
    }

    const statuses = getAllTicketStatuses();
    return NextResponse.json({ ticketStatuses: statuses });
}
