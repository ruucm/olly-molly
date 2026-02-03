import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

/**
 * PM Agent - CLI-powered feature breakdown
 * 
 * Uses codex, opencode, or claude CLI to analyze feature requests and create appropriate tasks
 * with intelligent assignment to team members.
 */

interface TaskFromAI {
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    assignee_role: string;
}

interface ExistingTicket {
    title: string;
    status: string;
    priority: string;
}

interface TeamMember {
    role: string;
    name: string;
}

// Default role descriptions for system prompt
const ROLE_DESCRIPTIONS: Record<string, string> = {
    FE_DEV: 'Frontend Developer: Handles UI/UX, React, Next.js, CSS, components, user interfaces',
    BACKEND_DEV: 'Backend Developer: Handles APIs, databases, server logic, authentication, business logic',
    QA: 'QA Engineer: Handles testing, quality assurance, bug verification, E2E tests',
    DEVOPS: 'DevOps Engineer: Handles deployment, CI/CD, infrastructure, monitoring',
    BUG_HUNTER: 'Bug Hunter: Full Stack Developer specialized in quickly fixing bugs, debugging, and hotfixes',
};

function buildSystemPrompt(existingTickets?: ExistingTicket[], teamMembers?: TeamMember[], maxTickets?: number): string {
    // Build team description dynamically based on provided members
    let teamDescription = '';
    const availableRoles: string[] = [];

    if (teamMembers && teamMembers.length > 0) {
        teamDescription = teamMembers.map(m => {
            availableRoles.push(m.role);
            const roleDesc = ROLE_DESCRIPTIONS[m.role] || `${m.role}: ${m.name}`;
            return `- ${m.role} (${m.name}): ${roleDesc.split(': ')[1] || 'General tasks'}`;
        }).join('\n');
    } else {
        // Fallback to default team if no members provided
        teamDescription = Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => {
            availableRoles.push(role);
            return `- ${desc}`;
        }).join('\n');
    }

    let prompt = `You are a PM (Project Manager) AI agent for a software development team.

Your team consists of:
${teamDescription}

When given a feature request, you must:
1. Break it down into simple, actionable tasks written for non-technical readers
2. Assign each task to the appropriate team member based on their expertise
3. Set priorities (CRITICAL > HIGH > MEDIUM > LOW)

IMPORTANT RULES:
- ONLY assign tasks to these available roles: ${availableRoles.join(', ')}
- Create focused, single-responsibility tasks
- Keep descriptions short and avoid technical jargon
- Prefer FE_DEV-only tasks when backend changes are not clearly required (if FE_DEV is available)
- Only create BACKEND_DEV tasks if APIs, data storage, auth, or server logic are truly needed (if BACKEND_DEV is available)
- Only add QA/DEVOPS tasks when they are clearly necessary (if they are available)
- Use Korean for titles and descriptions
- AVOID creating duplicate tasks that already exist on the board
- ORDER tasks by execution sequence (tasks that must be done first should come first)
- PREFIX each task title with a sequence number (e.g., "1. 로그인 화면 UI 구현", "2. 백엔드 API 연동")${maxTickets ? `\n- CRITICAL: You MUST create AT MOST ${maxTickets} tasks. Prioritize the most important tasks if you need to limit.` : ''}`;

    if (existingTickets && existingTickets.length > 0) {
        prompt += `\n\n## EXISTING TICKETS ON THE BOARD\nThe following tickets already exist. Avoid creating duplicate or overlapping tasks:\n`;
        existingTickets.forEach(t => {
            prompt += `- [${t.status}] ${t.title} (${t.priority})\n`;
        });
    }

    // Build example using available roles
    const exampleRole1 = availableRoles[0] || 'FE_DEV';
    const exampleRole2 = availableRoles[1] || availableRoles[0] || 'FE_DEV';

    prompt += `\n\nCRITICAL: You MUST respond with ONLY a valid JSON object, no other text. The format must be exactly:
{
  "tasks": [
    {
      "title": "1. 첫 번째 작업",
      "description": "Detailed task description in Korean",
      "priority": "HIGH",
      "assignee_role": "${exampleRole1}"
    },
    {
      "title": "2. 두 번째 작업",
      "description": "Detailed task description in Korean",
      "priority": "HIGH",
      "assignee_role": "${exampleRole2}"
    }
  ],
  "summary": "Brief summary of the breakdown in Korean"
}

REMINDER: assignee_role MUST be one of: ${availableRoles.join(', ')}`;

    return prompt;
}

// Detect available CLI tool
type SupportedCLI = 'claude' | 'opencode' | 'codex';

async function getAvailableCLIs(): Promise<SupportedCLI[]> {
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where' : 'which';

    const checkCommand = (cmd: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const proc = spawn(whichCmd, [cmd], { shell: true });
            proc.on('close', (code) => resolve(code === 0));
            proc.on('error', () => resolve(false));
        });
    };

    const available: SupportedCLI[] = [];
    if (await checkCommand('codex')) available.push('codex');
    if (await checkCommand('claude')) available.push('claude');
    if (await checkCommand('opencode')) available.push('opencode');
    return available;
}

function truncateForResponse(text: string, max = 8000): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n... (truncated ${text.length - max} chars)`;
}

function classifyCliError(raw: string): { status: number; publicMessage: string } {
    const msg = raw.toLowerCase();

    if (msg.includes('usage_limit_reached') || msg.includes('too many requests') || msg.includes('http 429') || msg.includes("you've hit your usage limit")) {
        return { status: 429, publicMessage: 'CLI usage limit reached (429). Try another provider or wait for quota reset.' };
    }
    if (msg.includes('no cli tool available')) {
        return { status: 503, publicMessage: 'No CLI tool available on server. Install and authenticate codex/claude/opencode.' };
    }
    if (msg.includes('cli timeout')) {
        return { status: 504, publicMessage: 'CLI timeout. The request took too long.' };
    }
    if (msg.includes('failed to start cli') || msg.includes('enoent')) {
        return { status: 503, publicMessage: 'Failed to start CLI. Check PATH and permissions.' };
    }
    if (msg.includes('failed to parse cli output') || msg.includes('no valid json')) {
        return { status: 502, publicMessage: 'CLI returned invalid output (expected JSON).' };
    }
    return { status: 500, publicMessage: 'Failed to run CLI.' };
}

async function breakdownWithCLI(cli: SupportedCLI, request: string, projectPath: string, existingTickets?: ExistingTicket[], teamMembers?: TeamMember[], maxTickets?: number): Promise<{ tasks: TaskFromAI[]; summary: string }> {

    const systemPrompt = buildSystemPrompt(existingTickets, teamMembers, maxTickets);
    const fullPrompt = `${systemPrompt}\n\nFeature Request: ${request}`;

    return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';

        let args: string[];
        let useStdin = true;
        if (cli === 'opencode') {
            // opencode uses 'run' with stdin
            args = ['run', '-'];
        } else if (cli === 'codex') {
            const rawArgs = process.env.CODEX_CLI_ARGS;
            const parsed = rawArgs ? rawArgs.split(' ').map(arg => arg.trim()).filter(Boolean) : [];
            if (parsed.length === 0) {
                args = ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'];
                useStdin = true;
            } else {
                const hasExec = parsed.includes('exec');
                const baseArgs = hasExec ? parsed : ['exec', ...parsed];
                if (baseArgs.includes('{prompt}')) {
                    args = baseArgs.map(arg => (arg === '{prompt}' ? fullPrompt : arg));
                    useStdin = false;
                } else if (baseArgs.includes('-')) {
                    args = baseArgs;
                } else {
                    args = [...baseArgs, fullPrompt];
                    useStdin = false;
                }
            }
        } else {
            // claude reads from stdin when no prompt is provided with --print
            args = ['--print', '--dangerously-skip-permissions'];
        }

        // On Windows, shell: true is needed to find commands in PATH
        const isWindows = process.platform === 'win32';

        const proc = spawn(cli, args, {
            cwd: projectPath,
            shell: isWindows,
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (useStdin) {
            // Write prompt to stdin
            proc.stdin?.write(fullPrompt);
            proc.stdin?.end();
        }

        proc.stdout?.on('data', (data: Buffer) => {
            output += data.toString('utf-8');
        });

        proc.stderr?.on('data', (data: Buffer) => {
            errorOutput += data.toString('utf-8');
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                const combined = `CLI exited with code ${code}\n\n[stderr]\n${errorOutput}\n\n[stdout]\n${output}`;
                reject(new Error(combined.trim()));
                return;
            }

            try {
                // Extract JSON from output (CLI might include extra text)
                const jsonMatch = output.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error('No valid JSON found in CLI output');
                }
                const parsed = JSON.parse(jsonMatch[0]);
                resolve(parsed);
            } catch (parseError) {
                reject(new Error(`Failed to parse CLI output: ${parseError}`));
            }
        });

        proc.on('error', (error) => {
            reject(new Error(`Failed to start CLI: ${error.message}`));
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            proc.kill();
            reject(new Error('CLI timeout - process took too long'));
        }, 300000);
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.request) {
            return NextResponse.json(
                { error: 'Feature request is required' },
                { status: 400 }
            );
        }

        const projectPath = typeof body.project_path === 'string' && body.project_path.trim()
            ? body.project_path.trim()
            : process.cwd();

        const available = await getAvailableCLIs();
        if (available.length === 0) {
            return NextResponse.json(
                { error: 'No CLI tool available. Please install codex, claude, or opencode.' },
                { status: 503 },
            );
        }

        const requestedProvider = (body.provider ?? process.env.PM_CLI_PROVIDER ?? 'opencode') as SupportedCLI;
        if (!available.includes(requestedProvider)) {
            return NextResponse.json(
                {
                    error: `Requested provider "${requestedProvider}" is not available on this server.`,
                    available_providers: available,
                },
                { status: 400 },
            );
        }

        // Run ONLY the requested provider (no fallback)
        const existingTickets = Array.isArray(body.existing_tickets) ? body.existing_tickets : [];
        const teamMembers = Array.isArray(body.team_members) ? body.team_members : undefined;
        const maxTickets = typeof body.max_tickets === 'number' && body.max_tickets > 0 ? body.max_tickets : undefined;
        const aiResponse = await breakdownWithCLI(requestedProvider, body.request, projectPath, existingTickets, teamMembers, maxTickets);

        return NextResponse.json({
            success: true,
            original_request: body.request,
            tickets_created: aiResponse.tasks.length,
            tasks: aiResponse.tasks,
            ai_summary: aiResponse.summary,
            provider: requestedProvider,
            message: `PM이 AI를 사용해 "${body.request}" 요청을 분석하여 ${aiResponse.tasks.length}개의 태스크를 생성했습니다.`,
        }, { status: 201 });
    } catch (error) {
        console.error('Error in PM breakdown:', error);
        const details = error instanceof Error ? error.message : String(error);
        const classified = classifyCliError(details);
        return NextResponse.json(
            { error: 'Failed to process feature request', details: truncateForResponse(details) },
            { status: classified.status },
        );
    }
}
