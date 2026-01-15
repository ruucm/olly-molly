import { NextResponse } from 'next/server';

export async function GET() {
    try {
        return NextResponse.json({ error: 'Server-side project lookup is disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching active project:', error);
        return NextResponse.json({ error: 'Failed to fetch active project' }, { status: 500 });
    }
}
