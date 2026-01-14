import { NextRequest, NextResponse } from 'next/server';
import { agentWorkLogService } from '@/lib/db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const logs = agentWorkLogService.getByTicketId(id);
        return NextResponse.json(logs);
    } catch (error) {
        console.error('Error fetching work logs:', error);
        return NextResponse.json({ error: 'Failed to fetch work logs' }, { status: 500 });
    }
}
