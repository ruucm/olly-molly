import { NextRequest, NextResponse } from 'next/server';
import { startDirectCliJob, AgentProvider } from '@/lib/agent-jobs';
import { createDirectCliConversation, addDirectCliMessage } from '@/lib/server-store';
import { v4 as uuidv4 } from 'uuid';

interface DirectCliExecuteRequest {
    project_path: string;
    prompt: string;
    provider?: AgentProvider;
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const body: DirectCliExecuteRequest = await request.json();

        if (!body.project_path || !body.prompt) {
            return NextResponse.json({
                success: false,
                error: 'project_path and prompt are required',
            }, { status: 400 });
        }

        const provider: AgentProvider = body.provider || 'claude';
        const jobId = uuidv4();
        const conversationId = uuidv4();

        // Create DirectCLI conversation on server
        const conversation = createDirectCliConversation({
            id: conversationId,
            project_path: body.project_path,
            provider,
            prompt: body.prompt,
        });
        addDirectCliMessage(conversationId, `🚀 Starting ${provider} CLI in ${body.project_path}...`, 'system');

        console.log(`[direct-cli/execute] Starting job:`, {
            jobId,
            conversationId,
            projectPath: body.project_path,
            provider,
            promptLength: body.prompt.length,
        });

        // Start DirectCLI job
        await startDirectCliJob({
            jobId,
            conversationId,
            projectPath: body.project_path,
            prompt: body.prompt,
            provider,
        });

        const duration = Date.now() - startTime;
        console.log(`[direct-cli/execute] Job started in ${duration}ms`);

        return NextResponse.json({
            success: true,
            job_id: jobId,
            conversation_id: conversationId,
            conversation,
            message: `${provider} CLI started. The job is running in the background.`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[direct-cli/execute] FAILED after ${duration}ms:`, errorMessage);

        return NextResponse.json({
            success: false,
            error: 'Failed to execute DirectCLI',
            details: errorMessage,
        }, { status: 500 });
    }
}
