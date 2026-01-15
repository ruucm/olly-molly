import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundJob, AgentProvider } from '@/lib/agent-jobs';
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
1. PORT CONFIGURATION: When running tests or starting servers for the TARGET PROJECT.
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
1. Start the dev server on port 3001. Prefer an explicit CLI arg when available:
   - Next.js: "npm run dev -- --port 3001" (or "next dev -p 3001")
   - Vite: "npm run dev -- --port 3001"
   - If the tool only supports env vars: set PORT=3001 using the shell's syntax (Windows PowerShell/CMD differs from bash)
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
7. CRITICAL: You are working on the external project "${project.name}". When starting its server, ALWAYS use port 3001. Prefer "npm run dev -- --port 3001" when supported. NEVER use port 1234.${qaInstruction}${imageGenerationInstruction}${screenshotInstruction}

Please complete this task now.`;
}

export async function POST(request: NextRequest) {
    try {
        const body: AgentExecuteRequest = await request.json();

        if (!body.ticket || !body.agent || !body.project) {
            return NextResponse.json({ error: 'ticket, agent, and project are required' }, { status: 400 });
        }

        const ticket = body.ticket;
        const agent = body.agent;
        const project = body.project;

        // Build prompt
        const prompt = buildAgentPrompt(ticket, agent, project, body.feedback);

        // Use provided provider or default to 'claude'
        const provider: AgentProvider = body.provider || 'claude';

        // Generate job ID
        const jobId = uuidv4();
        const conversationId = body.conversation_id || uuidv4();

        // Start background job (non-blocking)
        startBackgroundJob({
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
        console.error('Error executing agent:', error);
        return NextResponse.json({
            error: 'Failed to execute agent',
            details: String(error)
        }, { status: 500 });
    }
}
