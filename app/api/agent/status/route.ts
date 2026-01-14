import { NextRequest, NextResponse } from 'next/server';
import { getRunningJobs, getJobByTicketId, getJobOutput, cancelJob } from '@/lib/agent-jobs';

// Get all running jobs
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('ticket_id');
    const jobId = url.searchParams.get('job_id');

    if (jobId) {
        // Get specific job output
        const output = getJobOutput(jobId);
        return NextResponse.json({ output });
    }

    if (ticketId) {
        // Get job for specific ticket
        const job = getJobByTicketId(ticketId);
        return NextResponse.json({ job });
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
