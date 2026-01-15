import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * PM Agent - Ask questions about project status
 * 
 * Uses codex, opencode, or claude CLI to answer questions about the project
 * based on AGENT_WORK_LOG.md and project structure.
 */

const SYSTEM_PROMPT = `You are a PM (Project Manager) AI assistant helping a developer understand their project's current status.

You have access to:
1. The project's AGENT_WORK_LOG.md file which contains a history of all AI agent work completed on this project
2. The project's file structure

Your role is to:
- Answer questions about recent development progress
- Summarize what has been done
- Explain what agents have worked on
- Provide insights about the project state

IMPORTANT RULES:
- Be concise and helpful
- Use Korean for responses
- Reference specific work from the AGENT_WORK_LOG.md when relevant
- If you don't have information, say so clearly`;

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
    return { status: 500, publicMessage: 'Failed to run CLI.' };
}

function getProjectContext(projectPath: string): string {
    let context = '';

    // Read AGENT_WORK_LOG.md if exists
    const workLogPath = path.join(projectPath, 'AGENT_WORK_LOG.md');
    if (fs.existsSync(workLogPath)) {
        const workLog = fs.readFileSync(workLogPath, 'utf-8');
        context += `\n## AGENT_WORK_LOG.md 내용:\n${workLog}\n`;
    } else {
        context += '\n## AGENT_WORK_LOG.md: 아직 기록이 없습니다.\n';
    }

    // Get basic project structure (top-level files/folders)
    try {
        const entries = fs.readdirSync(projectPath, { withFileTypes: true });
        const structure = entries
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
            .slice(0, 20)
            .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
            .join('\n');
        context += `\n## 프로젝트 구조:\n${structure}\n`;
    } catch {
        context += '\n## 프로젝트 구조: 읽기 실패\n';
    }

    return context;
}

async function askWithCLI(cli: SupportedCLI, question: string, projectPath: string): Promise<string> {

    const projectContext = getProjectContext(projectPath);

    const fullPrompt = `${SYSTEM_PROMPT}

${projectContext}

---

사용자 질문: ${question}

위 정보를 바탕으로 한국어로 답변해주세요.`;

    return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';

        let args: string[];
        let useStdin = true;
        if (cli === 'opencode') {
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
            args = ['--print', '--dangerously-skip-permissions'];
        }

        const isWindows = process.platform === 'win32';

        const proc = spawn(cli, args, {
            cwd: projectPath,
            shell: isWindows,
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (useStdin) {
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

            // Clean up output (remove ANSI codes)
            const cleanOutput = output.replace(/\x1B\[[0-9;]*[mK]/g, '').trim();
            resolve(cleanOutput);
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

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.question) {
            return NextResponse.json(
                { error: 'Question is required' },
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

        // Use ONLY the requested provider (no fallback)
        const answer = await askWithCLI(requestedProvider, body.question, projectPath);

        return NextResponse.json({
            success: true,
            question: body.question,
            answer,
            provider: requestedProvider,
            project: projectPath ? { path: projectPath } : null,
        });
    } catch (error) {
        console.error('Error in PM ask:', error);
        const details = error instanceof Error ? error.message : String(error);
        const classified = classifyCliError(details);
        return NextResponse.json(
            { error: 'Failed to process question', details: truncateForResponse(details) },
            { status: classified.status },
        );
    }
}
