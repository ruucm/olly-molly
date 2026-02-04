import { NextRequest, NextResponse } from 'next/server';
import { getAllTicketStatuses, getTicketStatusesByIds } from '@/lib/server-store';

// Track sync request count for debugging
let ticketSyncRequestCount = 0;

/**
 * Sync endpoint for ticket statuses.
 * Returns all ticket statuses stored on the server.
 *
 * GET /api/tickets/sync              -> all ticket statuses
 * GET /api/tickets/sync?ids=X,Y,Z    -> specific ticket statuses
 */
export async function GET(request: NextRequest) {
    const reqId = ++ticketSyncRequestCount;
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');

    if (idsParam) {
        const ids = idsParam.split(',').filter(Boolean);
        const statuses = getTicketStatusesByIds(ids);
        console.log(`[api:tickets-sync] #${reqId} ids=${ids.length} | returned=${statuses.length}`);
        return NextResponse.json({ ticketStatuses: statuses });
    }

    const statuses = getAllTicketStatuses();
    const inProgressCount = statuses.filter(s => s.status === 'IN_PROGRESS').length;
    console.log(`[api:tickets-sync] #${reqId} all | total=${statuses.length}, in_progress=${inProgressCount}`);
    return NextResponse.json({ ticketStatuses: statuses });
}
