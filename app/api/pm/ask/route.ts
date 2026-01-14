import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/db';
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

async function askWithCLI(question: string, projectPath: string): Promise<string> {
    const cli = await detectCLI();

    if (!cli) {
        throw new Error('No CLI tool available. Please install codex, claude, or opencode.');
    }

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

        // Get active project
        const project = projectService.getActive();
        const projectPath = project?.path || process.cwd();

        // Use CLI to answer the question
        const answer = await askWithCLI(body.question, projectPath);

        return NextResponse.json({
            success: true,
            question: body.question,
            answer,
            project: project ? {
                name: project.name,
                path: project.path,
            } : null,
        });
    } catch (error) {
        console.error('Error in PM ask:', error);
        return NextResponse.json(
            { error: 'Failed to process question', details: String(error) },
            { status: 500 }
        );
    }
}
