import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        await request.json();
        return NextResponse.json({ error: 'Server-side PM ticket creation is disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error in PM create ticket:', error);
        return NextResponse.json(
            { error: 'Failed to create ticket' },
            { status: 500 }
        );
    }
}

// GET endpoint to get PM agent info and capabilities
export async function GET() {
    try {
        return NextResponse.json({ error: 'Server-side PM info is disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching PM info:', error);
        return NextResponse.json(
            { error: 'Failed to fetch PM info' },
            { status: 500 }
        );
    }
}
