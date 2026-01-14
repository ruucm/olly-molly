import { NextRequest, NextResponse } from 'next/server';
import { ticketService, memberService, projectService } from '@/lib/db';
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
    assignee_role: 'FE_DEV' | 'BACKEND_DEV' | 'QA' | 'DEVOPS' | 'BUG_HUNTER';
}

const SYSTEM_PROMPT = `You are a PM (Project Manager) AI agent for a software development team.

Your team consists of:
- FE_DEV (Frontend Developer): Handles UI/UX, React, Next.js, CSS, components, user interfaces
- BACKEND_DEV (Backend Developer): Handles APIs, databases, server logic, authentication, business logic
- QA (QA Engineer): Handles testing, quality assurance, bug verification, E2E tests
- DEVOPS (DevOps Engineer): Handles deployment, CI/CD, infrastructure, monitoring
- BUG_HUNTER (Bug Hunter): Full Stack Developer specialized in quickly fixing bugs, debugging, and hotfixes

When given a feature request, you must:
1. Break it down into simple, actionable tasks written for non-technical readers
2. Assign each task to the appropriate team member based on their expertise
3. Set priorities (CRITICAL > HIGH > MEDIUM > LOW)

IMPORTANT RULES:
- Create focused, single-responsibility tasks
- Keep descriptions short and avoid technical jargon
- Prefer FE_DEV-only tasks when backend changes are not clearly required
- Only create BACKEND_DEV tasks if APIs, data storage, auth, or server logic are truly needed
- Only add QA/DEVOPS tasks when they are clearly necessary
- Use Korean for titles and descriptions

CRITICAL: You MUST respond with ONLY a valid JSON object, no other text. The format must be exactly:
{
  "tasks": [
    {
      "title": "Task title in Korean",
      "description": "Detailed task description in Korean",
      "priority": "HIGH",
      "assignee_role": "BACKEND_DEV"
    }
  ],
  "summary": "Brief summary of the breakdown in Korean"
}`;

// Detect available CLI tool
async function detectCLI(): Promise<'claude' | 'opencode' | 'codex' | null> {
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where' : 'which';

    const checkCommand = (cmd: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const proc = spawn(whichCmd, [cmd], { shell: true });
            proc.on('close', (code) => resolve(code === 0));
            proc.on('error', () => resolve(false));
        });
    };

    if (await checkCommand('codex')) return 'codex';
    if (await checkCommand('claude')) return 'claude';
    if (await checkCommand('opencode')) return 'opencode';
    return null;
}

async function breakdownWithCLI(request: string, projectPath: string): Promise<{ tasks: TaskFromAI[]; summary: string }> {
    const cli = await detectCLI();

    if (!cli) {
        throw new Error('No CLI tool available. Please install codex, claude, or opencode.');
    }

    const fullPrompt = `${SYSTEM_PROMPT}

Feature Request: ${request}`;

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
                reject(new Error(`CLI exited with code ${code}: ${errorOutput}`));
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

        // Timeout after 2 minutes
        setTimeout(() => {
            proc.kill();
            reject(new Error('CLI timeout - process took too long'));
        }, 120000);
    });
}

function getAssigneeByRole(role: string): string | null {
    const member = memberService.getByRole(role);
    return member?.id || null;
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

        // Get active project for CLI execution path
        const project = projectService.getActive();
        const projectPath = project?.path || process.cwd();

        const pmMember = memberService.getByRole('PM');

        // Use CLI to break down the request
        const aiResponse = await breakdownWithCLI(body.request, projectPath);

        const createdTickets = [];

        for (const task of aiResponse.tasks) {
            const assigneeId = getAssigneeByRole(task.assignee_role);

            const ticket = ticketService.create({
                title: task.title,
                description: task.description,
                priority: task.priority,
                assignee_id: assigneeId || undefined,
                project_id: body.project_id,
                created_by: pmMember?.id,
            });

            const assignee = assigneeId ? memberService.getById(assigneeId) : null;
            createdTickets.push({
                ...ticket,
                assignee,
                assigned_role: task.assignee_role,
            });
        }

        return NextResponse.json({
            success: true,
            original_request: body.request,
            created_by: pmMember,
            tickets_created: createdTickets.length,
            tickets: createdTickets,
            ai_summary: aiResponse.summary,
            message: `PM이 AI를 사용해 "${body.request}" 요청을 분석하여 ${createdTickets.length}개의 태스크를 생성했습니다.`,
        }, { status: 201 });
    } catch (error) {
        console.error('Error in PM breakdown:', error);
        return NextResponse.json(
            { error: 'Failed to process feature request', details: String(error) },
            { status: 500 }
        );
    }
}
