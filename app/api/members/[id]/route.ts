import { NextRequest, NextResponse } from 'next/server';
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await params;
        return NextResponse.json({ error: 'Server-side members are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching member:', error);
        return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await params;
        await request.json();
        return NextResponse.json({ error: 'Server-side members are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error updating member:', error);
        return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await params;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting member:', error);
        return NextResponse.json({ error: 'Failed to delete member' }, { status: 500 });
    }
}
