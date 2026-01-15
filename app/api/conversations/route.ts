import { NextRequest, NextResponse } from 'next/server';
// GET /api/conversations?ticket_id=xxx
export async function GET(request: NextRequest) {
    try {
        await request;
        return NextResponse.json({ error: 'Server-side conversations are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json({
            error: 'Failed to fetch conversations',
            details: String(error)
        }, { status: 500 });
    }
}
