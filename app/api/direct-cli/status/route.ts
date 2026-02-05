import { NextRequest, NextResponse } from 'next/server';
import { getDirectCliJob, cancelDirectCliJob } from '@/lib/agent-jobs';
import { getDirectCliSyncData } from '@/lib/server-store';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversation_id');
    const jobId = searchParams.get('job_id');

    if (!conversationId && !jobId) {
        return NextResponse.json({
            success: false,
            error: 'conversation_id or job_id is required',
        }, { status: 400 });
    }

    try {
        // Get job status
        let job = null;
        if (jobId) {
            job = getDirectCliJob(jobId);
        }

        // Get sync data (conversation + messages)
        let syncData = null;
        if (conversationId) {
            syncData = getDirectCliSyncData(conversationId);
        }

        return NextResponse.json({
            success: true,
            job,
            conversation: syncData?.conversation || null,
            messages: syncData?.messages || [],
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[direct-cli/status] Error:`, errorMessage);

        return NextResponse.json({
            success: false,
            error: 'Failed to get status',
            details: errorMessage,
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
        return NextResponse.json({
            success: false,
            error: 'job_id is required',
        }, { status: 400 });
    }

    try {
        const cancelled = cancelDirectCliJob(jobId);

        if (!cancelled) {
            return NextResponse.json({
                success: false,
                error: 'Job not found or already completed',
            }, { status: 404 });
        }

        console.log(`[direct-cli/status] Job cancelled: ${jobId}`);

        return NextResponse.json({
            success: true,
            message: 'Job cancelled successfully',
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[direct-cli/status] Cancel error:`, errorMessage);

        return NextResponse.json({
            success: false,
            error: 'Failed to cancel job',
            details: errorMessage,
        }, { status: 500 });
    }
}
