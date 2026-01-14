import { NextRequest, NextResponse } from 'next/server';
import { ticketService, memberService, projectService, activityService, conversationService } from '@/lib/db';
import { startBackgroundJob, AgentProvider } from '@/lib/agent-jobs';
import { v4 as uuidv4 } from 'uuid';

interface AgentExecuteRequest {
    ticket_id: string;
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
1. PORT CONFIGURATION: When running tests or starting servers for the TARGET PROJECT, you MUST use port 3001 (or any port other than 1234) to avoid conflict with this dashboard app. Use "PORT=3001 npm run dev" or equivalent.
2. TOOL USAGE: You MUST use the **Playwright MCP** (https://github.com/microsoft/playwright-mcp) tools for automated testing. verify the available tools and use them for browser automation and testing. Do NOT rely solely on manual terminal commands.`
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
1. Start the dev server with PORT=3001 (e.g., "PORT=3001 npm run dev")
2. Use browser automation tools (Playwright MCP or similar) to capture screenshots
3. Save screenshots to the ".agent-screenshots/" folder in the project root
4. Name files descriptively (e.g., "feature-result.png", "bug-fix-result.png")
5. Include multiple screenshots if you changed multiple pages/components
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
7. CRITICAL: You are working on the external project "${project.name}". When starting its server, ALWAYS use port 3001 (e.g. "PORT=3001 npm run dev"). NEVER use port 1234.${qaInstruction}${imageGenerationInstruction}${screenshotInstruction}

Please complete this task now.`;
}

export async function POST(request: NextRequest) {
    try {
        const body: AgentExecuteRequest = await request.json();

        if (!body.ticket_id) {
            return NextResponse.json({ error: 'ticket_id is required' }, { status: 400 });
        }

        // Get ticket
        const ticket = ticketService.getById(body.ticket_id);
        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Get assignee (agent)
        if (!ticket.assignee_id) {
            return NextResponse.json({ error: 'Ticket has no assignee' }, { status: 400 });
        }

        const agent = memberService.getById(ticket.assignee_id);
        if (!agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        // Get active project
        const project = projectService.getActive();
        if (!project) {
            return NextResponse.json({ error: 'No active project selected. Please select a project first.' }, { status: 400 });
        }

        // Build prompt
        const prompt = buildAgentPrompt(ticket, agent, project, body.feedback);

        // Use provided provider or default to 'claude'
        const provider: AgentProvider = body.provider || 'claude';

        // Generate job ID
        const jobId = uuidv4();

        // Update ticket status to IN_PROGRESS
        ticketService.update(body.ticket_id, { status: 'IN_PROGRESS' }, agent.id);

        // Create conversation for this execution
        const conversation = conversationService.create({
            ticket_id: body.ticket_id,
            agent_id: agent.id,
            provider,
            prompt,
            feedback: body.feedback,
        });

        // Log activity
        const providerLabel = provider === 'opencode'
            ? 'OpenCode'
            : provider === 'codex'
                ? 'Codex CLI'
                : 'Claude Code';

        activityService.log({
            ticket_id: body.ticket_id,
            member_id: agent.id,
            action: 'AGENT_WORK_STARTED',
            details: `${agent.name} started working on this task using ${providerLabel}`,
        });

        // Start background job (non-blocking)
        startBackgroundJob({
            jobId,
            conversationId: conversation.id,
            ticketId: body.ticket_id,
            agentId: agent.id,
            agentName: agent.name,
            projectPath: project.path,
            prompt,
            provider,
        });

        // Return immediately with job info
        return NextResponse.json({
            success: true,
            job_id: jobId,
            conversation_id: conversation.id,
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
        console.error('Error executing agent:', error);
        return NextResponse.json({
            error: 'Failed to execute agent',
            details: String(error)
        }, { status: 500 });
    }
}
