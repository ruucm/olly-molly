import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundJob, AgentProvider } from '@/lib/agent-jobs';
import { v4 as uuidv4 } from 'uuid';

interface TicketData {
    id: string;
    title: string;
    description?: string | null;
    agent: {
        id: string;
        name: string;
        role: string;
        avatar?: string | null;
        system_prompt: string;
        can_generate_images: number;
        can_log_screenshots: number;
    };
}

interface BatchExecuteRequest {
    tickets: TicketData[];
    project: {
        id?: string;
        name: string;
        path: string;
    };
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
}): string {
    const isQA = agent.role === 'QA';
    const qaInstruction = isQA
        ? `\nIMPORTANT:
1. PORT CONFIGURATION: When running tests or starting servers for the TARGET PROJECT.
2. TOOL USAGE: You MUST use the **Playwright MCP** (https://github.com/microsoft/playwright-mcp) tools for automated testing.`
        : '';

    const canGenerateImages = agent.can_generate_images === 1;
    const imageGenerationInstruction = canGenerateImages
        ? `\n\nIMAGE GENERATION (if configured in Settings):
If you need images for your implementation, you can generate them using the Image Generation API:
- Endpoint: POST http://localhost:1234/api/image/generate
- Body: { "prompt": "detailed image description", "width": 1024, "height": 1024, "projectPath": "${project.path}" }
- Generated images will be saved to ${project.path}/public/generated/`
        : '';

    const canLogScreenshots = agent.can_log_screenshots === 1;
    const screenshotInstruction = canLogScreenshots
        ? `\n\nSCREENSHOT REQUIREMENT:
If you make any UI/visual changes, you MUST take screenshots:
1. Start the dev server on port 3001
2. Use browser automation tools to capture screenshots
3. Save screenshots to the ".agent-screenshots/" folder`
        : '';

    return `You are acting as ${agent.name} (${agent.role}) for the project "${project.name}".

${agent.system_prompt}

---

TASK TO COMPLETE:
Title: ${ticket.title}
${ticket.description ? `Description: ${ticket.description}` : ''}

---

INSTRUCTIONS:
1. Analyze the task requirements carefully
2. Make the necessary code changes to complete this task
3. Focus only on what's needed for this specific task
4. Write clean, well-documented code
5. After completing, provide a brief summary of changes made
6. COMMIT REQUIREMENT (MANDATORY): If you made any code or file changes, you MUST create a git commit before finishing.
7. CRITICAL: You are working on the external project "${project.name}". When starting its server, ALWAYS use port 3001.${qaInstruction}${imageGenerationInstruction}${screenshotInstruction}

Please complete this task now.`;
}

interface JobResult {
    ticketId: string;
    ticketTitle: string;
    jobId: string;
    conversationId: string;
    agentName: string;
    success: true;
}

interface JobError {
    ticketId: string;
    ticketTitle: string;
    success: false;
    error: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: BatchExecuteRequest = await request.json();

        if (!body.tickets || body.tickets.length === 0 || !body.project) {
            return NextResponse.json({ error: 'tickets and project are required' }, { status: 400 });
        }

        const project = body.project;
        const provider: AgentProvider = body.provider || 'claude';

        const results: (JobResult | JobError)[] = [];

        // Start all jobs concurrently
        for (const ticketData of body.tickets) {
            try {
                const { id: ticketId, title, description, agent } = ticketData;

                if (!agent) {
                    results.push({
                        ticketId,
                        ticketTitle: title,
                        success: false,
                        error: 'No agent assigned',
                    });
                    continue;
                }

                const prompt = buildAgentPrompt(
                    { title, description },
                    agent,
                    project
                );

                const jobId = uuidv4();
                const conversationId = uuidv4();

                // Start background job (non-blocking)
                startBackgroundJob({
                    jobId,
                    conversationId,
                    ticketId,
                    ticketTitle: title,
                    agentId: agent.id,
                    agentName: agent.name,
                    agentAvatar: agent.avatar,
                    projectPath: project.path,
                    prompt,
                    provider,
                });

                results.push({
                    ticketId,
                    ticketTitle: title,
                    jobId,
                    conversationId,
                    agentName: agent.name,
                    success: true,
                });
            } catch (error) {
                results.push({
                    ticketId: ticketData.id,
                    ticketTitle: ticketData.title,
                    success: false,
                    error: String(error),
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return NextResponse.json({
            success: true,
            message: `Started ${successCount} job(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
            results,
            summary: {
                total: body.tickets.length,
                started: successCount,
                failed: failCount,
            },
        });
    } catch (error) {
        console.error('Error executing batch:', error);
        return NextResponse.json({
            error: 'Failed to execute batch',
            details: String(error)
        }, { status: 500 });
    }
}
