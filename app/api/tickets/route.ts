import { NextRequest, NextResponse } from 'next/server';
export async function GET(request: NextRequest) {
    try {
        await request;
        return NextResponse.json({ error: 'Server-side tickets are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await request.json();
        return NextResponse.json({ error: 'Server-side tickets are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error creating ticket:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}

