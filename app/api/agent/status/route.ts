import { NextRequest, NextResponse } from 'next/server';
import { getRunningJobs, getJobByTicketId, getJobById, getJobOutput, cancelJob } from '@/lib/agent-jobs';
import {
    getConversation,
    getConversationsByTicketId,
    getMessagesSince,
    getMessageCount,
} from '@/lib/server-store';

// Get job status + server-side conversation data
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('ticket_id');
    const jobId = url.searchParams.get('job_id');
    const messagesSince = url.searchParams.get('messages_since');

    if (jobId) {
        // Get specific job output and job info
        const output = getJobOutput(jobId);
        const job = getJobById(jobId);

        // Also return server-side conversation data
        const conversationId = job?.conversationId;
        const conversation = conversationId ? getConversation(conversationId) : null;
        const messageCount = conversationId ? getMessageCount(conversationId) : 0;

        // If messages_since provided, return incremental messages
        const messages = conversationId && messagesSince
            ? getMessagesSince(conversationId, messagesSince)
            : undefined;

        return NextResponse.json({ output, job, conversation, messageCount, messages });
    }

    if (ticketId) {
        // Get job for specific ticket
        const job = getJobByTicketId(ticketId);

        // Also return all server-side conversations for this ticket
        const conversations = getConversationsByTicketId(ticketId);

        return NextResponse.json({ job, conversations });
    }

    // Get all running jobs
    const jobs = getRunningJobs();
    return NextResponse.json({ jobs });
}

// Cancel a job
export async function DELETE(request: NextRequest) {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');

    if (!jobId) {
        return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const cancelled = cancelJob(jobId);
    return NextResponse.json({ success: cancelled });
}
