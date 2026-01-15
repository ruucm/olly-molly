import { NextRequest, NextResponse } from 'next/server';
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await params;
        return NextResponse.json({ error: 'Server-side work logs are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching work logs:', error);
        return NextResponse.json({ error: 'Failed to fetch work logs' }, { status: 500 });
    }
}
