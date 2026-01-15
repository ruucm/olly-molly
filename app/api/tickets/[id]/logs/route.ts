import { NextRequest, NextResponse } from 'next/server';
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await params;
        return NextResponse.json({ error: 'Server-side activity logs are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
    }
}
