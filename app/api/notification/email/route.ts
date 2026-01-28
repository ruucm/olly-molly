import { NextRequest, NextResponse } from 'next/server';
import { sendTaskCompletedEmail, isEmailConfigured } from '@/lib/email-notification';

export async function POST(request: NextRequest) {
    try {
        if (!isEmailConfigured()) {
            return NextResponse.json(
                { error: 'Email not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL environment variables.' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { to, agentName, agentRole, ticketTitle, ticketId, projectName, commitHash } = body;

        if (!to || !agentName || !ticketTitle || !projectName) {
            return NextResponse.json(
                { error: 'Missing required fields: to, agentName, ticketTitle, projectName' },
                { status: 400 }
            );
        }

        const result = await sendTaskCompletedEmail({
            to,
            agentName,
            agentRole: agentRole || 'Agent',
            ticketTitle,
            ticketId: ticketId || '',
            projectName,
            commitHash,
        });

        if (result.success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }
    } catch (error) {
        console.error('Email API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to send email' },
            { status: 500 }
        );
    }
}
