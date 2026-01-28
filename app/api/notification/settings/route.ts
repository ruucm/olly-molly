import { NextResponse } from 'next/server';
import { getEmailStatus } from '@/lib/email-notification';

export async function GET() {
    const status = getEmailStatus();

    return NextResponse.json({
        email: {
            configured: status.configured,
            fromEmail: status.fromEmail,
        },
    });
}
