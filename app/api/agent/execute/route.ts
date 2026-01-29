import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundJob, AgentProvider, getJobByTicketId } from '@/lib/agent-jobs';
import { v4 as uuidv4 } from 'uuid';

interface AgentExecuteRequest {
    ticket?: {
        id: string;
        title: string;
        description?: string | null;
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
1. PORT CONFIGURATION: When running tests or starting servers, use a DYNAMIC PORT. Check ports in range 3001-3999 and use the first available one. Do NOT hardcode any specific port as it may conflict with other agents or servers.
2. TOOL USAGE: You MUST use the **Playwright MCP** (https://github.com/microsoft/playwright-mcp) tools for automated testing. verify the available tools and use them for browser automation and testing. Do NOT rely solely on manual terminal commands.
3. CLEANUP: After running tests, STOP any dev servers you started to free up ports for other agents.`
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

    const canLogScreenshots = agent.can_log_screenshots === 1;
    const screenshotInstruction = canLogScreenshots
        ? `\n\nSCREENSHOT REQUIREMENT:
If you make any UI/visual changes, you MUST take screenshots to document your work:
1. Start the dev server using a DYNAMIC PORT. First check if any port is already in use, then pick an available one from range 3001-3999:
   - Check port availability: lsof -i :PORT_NUMBER (macOS/Linux) or netstat -ano | findstr :PORT_NUMBER (Windows)
   - Next.js: "npm run dev -- --port PORT_NUMBER" (or "next dev -p PORT_NUMBER")
   - Vite: "npm run dev -- --port PORT_NUMBER"
   - IMPORTANT: If a port is already in use, try the next one. Do NOT kill existing processes using that port.
2. Use browser automation tools (Playwright MCP or similar) to capture screenshots
3. Save screenshots to the ".agent-screenshots/" folder in the project root
4. Name files descriptively (e.g., "feature-result.png", "bug-fix-result.png")
5. Include multiple screenshots if you changed multiple pages/components
6. AFTER taking screenshots, STOP the dev server immediately to free up the port for other agents
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
7. CRITICAL: You are working on the external project "${project.name}". When starting its server, use a DYNAMIC PORT (not 1234 which is used by Olly Molly). Check if ports in range 3001-3999 are available and use the first free one. Prefer "npm run dev -- --port PORT" when supported.
8. CLEANUP REQUIREMENT (MANDATORY): Before finishing your task, you MUST stop any dev servers or processes you started. This is critical because multiple agents share the same environment.
   - Kill any npm/node dev server you started: find the process and terminate it
   - macOS/Linux: Use "lsof -ti :PORT | xargs kill -9" or "pkill -f 'next dev'" / "pkill -f 'vite'"
   - Windows: Use "netstat -ano | findstr :PORT" to find PID, then "taskkill /PID <pid> /F"
   - Verify the port is released before finishing
   - Do NOT leave any background processes running${qaInstruction}${imageGenerationInstruction}${screenshotInstruction}

Please complete this task now.`;
}

export async function POST(request: NextRequest) {
    try {
        const body: AgentExecuteRequest = await request.json();

        if (!body.ticket || !body.agent || !body.project) {
            console.error('[agent/execute] Missing required fields:', {
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

        // Generate job ID
        const jobId = uuidv4();
        const conversationId = body.conversation_id || uuidv4();

        console.log('[agent/execute] Starting new job:', {
            jobId,
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            agentName: agent.name,
            projectPath: project.path,
            provider,
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

        // Return immediately with job info
        return NextResponse.json({
            success: true,
            job_id: jobId,
            conversation_id: conversationId,
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('[agent/execute] Error executing agent:', {
            error: errorMessage,
            stack: errorStack,
        });

        return NextResponse.json({
            success: false,
            error: 'Failed to execute agent',
            details: errorMessage,
        }, { status: 500 });
    }
}
