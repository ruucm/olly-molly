import { NextResponse } from 'next/server';
export async function GET() {
    try {
        return NextResponse.json({ error: 'Server-side members are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching members:', error);
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await request.json();
        return NextResponse.json({ error: 'Server-side members are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error creating member:', error);
        return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
    }
}
