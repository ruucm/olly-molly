import { NextRequest, NextResponse } from 'next/server';
interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

// GET /api/conversations/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        // Await params for Next.js 15+
        await params;
        return NextResponse.json({ error: 'Server-side conversations are disabled' }, { status: 410 });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        return NextResponse.json({
            error: 'Failed to fetch conversation',
            details: String(error)
        }, { status: 500 });
    }
}
