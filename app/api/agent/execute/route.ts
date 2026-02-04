import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundJob, AgentProvider, getJobByTicketId, getRunningJobs } from '@/lib/agent-jobs';
import { createConversation, addMessage, logServerStoreState } from '@/lib/server-store';
import { v4 as uuidv4 } from 'uuid';

// Track request count for debugging
let requestCount = 0;

interface AgentExecuteRequest {
    ticket?: {
        id: string;
        title: string;
        description?: string | null;
        enable_screenshot?: number; // 티켓별 스크린샷 설정
    };
    agent?: {
        id: string;
        name: string;
        role: string;
        avatar?: string | null;
        system_prompt: string;
        can_generate_images: number;
        can_log_screenshots: number;
    };
    project?: {
        id?: string;
        name: string;
        path: string;
    };
    conversation_id?: string;
    feedback?: string;
    provider?: AgentProvider;
}

function buildAgentPrompt(ticket: {
    title: string;
    description?: string | null;
    enable_screenshot?: number;
}, agent: {
    name: string;
    role: string;
    system_prompt: string;
    can_generate_images: number;
    can_log_screenshots: number;
}, project: {
    name: string;
    path: string;
}, feedback?: string): string {
    // Check if role is QA to add specific port instructions
    const isQA = agent.role === 'QA';
    const qaInstruction = isQA
        ? `\nIMPORTANT:
1. 🚨 NEVER KILL PROCESSES ON PORTS 1234 OR 31337 OR 3000 - These are Olly Molly system ports. Killing them will crash the app.
2. PORT: Use env var AVAILABLE_PORT if set, or find an available port yourself (skip 1234, 3000).
3. TOOL USAGE: Use Playwright MCP for automated testing. NEVER navigate to localhost:1234 or localhost:3000.
4. CLEANUP: After tests, stop only the dev servers YOU started. Never kill processes you didn't start.
5. If a port is busy: Choose a different port. NEVER kill existing processes.`
        : '';

    // Image generation instruction based on member capability
    const canGenerateImages = agent.can_generate_images === 1;
    const imageGenerationInstruction = canGenerateImages
        ? `\n\nIMAGE GENERATION (if configured in Settings):
If you need images for your implementation (backgrounds, icons, illustrations, etc.), you can generate them using the Image Generation API:
- Endpoint: POST http://localhost:1234/api/image/generate
- Body: { "prompt": "detailed image description", "width": 1024, "height": 1024, "projectPath": "${project.path}" }
- NOTE: The server will use the provider configured in the app settings. No manual configuration needed.
- Example: curl -X POST http://localhost:1234/api/image/generate -H "Content-Type: application/json" -d '{"prompt": "modern dark theme dashboard background", "width": 1024, "height": 1024, "projectPath": "${project.path}"}'
- Generated images will be saved to ${project.path}/public/generated/
- Use descriptive prompts for best results (style, colors, composition)
- Supported sizes: any width/height, defaults to 1024x1024
- If you get an error about settings not configured, skip image generation`
        : '';

    // 티켓에서 스크린샷이 활성화되어 있고, 에이전트가 스크린샷 권한이 있을 때만 스크린샷 지침 추가
    const canLogScreenshots = ticket.enable_screenshot === 1 && agent.can_log_screenshots === 1;
    const screenshotInstruction = canLogScreenshots
        ? `\n\nSCREENSHOT REQUIREMENT:
If you make any UI/visual changes, you MUST take screenshots to document your work:
1. Start the dev server on an available port (NEVER use 1234 or 3000 - these are Olly Molly system ports)
2. Use Playwright MCP to capture screenshots (NEVER navigate to localhost:1234 or localhost:3000)
3. Save screenshots to ".agent-screenshots/" in the project root with descriptive names
4. AFTER taking screenshots, STOP only the dev server YOU started
5. 🚨 NEVER kill processes on ports 1234 or 3000 - this will crash Olly Molly
This is MANDATORY for visual changes so other agents can reference your work.`
        : '';

    const feedbackSection = feedback
        ? `\n\nIMPORTANT FEEDBACK FROM USER:\n${feedback}\n\nPlease address this feedback specifically in your implementation.`
        : '';

    return `You are acting as ${agent.name} (${agent.role}) for the project "${project.name}".

${agent.system_prompt}

---

TASK TO COMPLETE:
Title: ${ticket.title}
${ticket.description ? `Description: ${ticket.description}` : ''}
${feedbackSection}

---

INSTRUCTIONS:
1. Analyze the task requirements carefully
2. Make the necessary code changes to complete this task
3. Focus only on what's needed for this specific task
4. Write clean, well-documented code
5. After completing, provide a brief summary of changes made
6. COMMIT REQUIREMENT (MANDATORY): If you made any code or file changes, you MUST create a git commit before finishing. Do not skip this step unless there are truly no changes to commit.
7. PORT: Your assigned port is in env var AVAILABLE_PORT (also DEV_PORT, PORT). It is pre-verified available — use it directly without any port scanning. Example: npm run dev -- --port $AVAILABLE_PORT
8. CLEANUP (MANDATORY): Before finishing, stop any dev servers you started. Kill the process on your assigned port.
   - macOS/Linux: lsof -ti :$AVAILABLE_PORT | xargs kill -9
   - Windows: for /f "tokens=5" %a in ('netstat -ano ^| findstr :$AVAILABLE_PORT') do taskkill /PID %a /F${qaInstruction}${imageGenerationInstruction}${screenshotInstruction}

Please complete this task now.`;
}

export async function POST(request: NextRequest) {
    const reqId = ++requestCount;
    const startTime = Date.now();
    const runningJobs = getRunningJobs();

    console.log(`[agent/execute] Request #${reqId} started | currently running jobs: ${runningJobs.length}`);
    logServerStoreState(`execute-request-${reqId}`);

    try {
        const body: AgentExecuteRequest = await request.json();

        if (!body.ticket || !body.agent || !body.project) {
            console.error(`[agent/execute] Request #${reqId} - Missing required fields:`, {
                hasTicket: !!body.ticket,
                hasAgent: !!body.agent,
                hasProject: !!body.project,
            });
            return NextResponse.json({
                success: false,
                error: 'ticket, agent, and project are required',
                details: {
                    hasTicket: !!body.ticket,
                    hasAgent: !!body.agent,
                    hasProject: !!body.project,
                }
            }, { status: 400 });
        }

        const ticket = body.ticket;
        const agent = body.agent;
        const project = body.project;

        // Check for existing running job for this ticket
        const existingJob = getJobByTicketId(ticket.id);
        if (existingJob && existingJob.status === 'running') {
            console.warn('[agent/execute] Job already running for ticket:', {
                ticketId: ticket.id,
                ticketTitle: ticket.title,
                existingJobId: existingJob.id,
                existingJobAgent: existingJob.agentName,
            });
            return NextResponse.json({
                success: false,
                error: 'A job is already running for this ticket',
                details: {
                    existingJobId: existingJob.id,
                    existingAgentName: existingJob.agentName,
                    ticketId: ticket.id,
                }
            }, { status: 409 }); // 409 Conflict
        }

        // Build prompt
        const prompt = buildAgentPrompt(ticket, agent, project, body.feedback);

        // Use provided provider or default to 'claude'
        const provider: AgentProvider = body.provider || 'claude';

        // Generate job ID and create conversation on server (ComfyUI pattern)
        const jobId = uuidv4();
        const conversationId = body.conversation_id || uuidv4();

        // Server creates conversation in memory (browser no longer does this)
        const conversation = createConversation({
            id: conversationId,
            ticket_id: ticket.id,
            agent_id: agent.id,
            provider,
            feedback: body.feedback,
        });
        addMessage(conversationId, `🚀 ${agent.name} started working on "${ticket.title}"`, 'system');

        console.log(`[agent/execute] Request #${reqId} - Starting new job:`, {
            jobId,
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            agentName: agent.name,
            projectPath: project.path,
            provider,
            currentRunningJobs: runningJobs.length,
        });

        // Start background job (find available port first, then run non-blocking)
        await startBackgroundJob({
            jobId,
            conversationId,
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            agentId: agent.id,
            agentName: agent.name,
            agentAvatar: agent.avatar,
            projectPath: project.path,
            prompt,
            provider,
        });

        const duration = Date.now() - startTime;
        const newRunningJobs = getRunningJobs();
        console.log(`[agent/execute] Request #${reqId} completed in ${duration}ms | running jobs: ${newRunningJobs.length}`);

        // Return immediately with job info + server-created conversation
        return NextResponse.json({
            success: true,
            job_id: jobId,
            conversation_id: conversationId,
            conversation,
            message: `${agent.name} started working on the task. The job is running in the background.`,
            agent: {
                id: agent.id,
                name: agent.name,
                role: agent.role,
                avatar: agent.avatar,
            },
            project: {
                id: project.id,
                name: project.name,
                path: project.path,
            },
            ticket_status: 'IN_PROGRESS',
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error(`[agent/execute] Request #${reqId} FAILED after ${duration}ms:`, {
            error: errorMessage,
            stack: errorStack,
        });
        logServerStoreState(`execute-error-${reqId}`);

        return NextResponse.json({
            success: false,
            error: 'Failed to execute agent',
            details: errorMessage,
        }, { status: 500 });
    }
}
