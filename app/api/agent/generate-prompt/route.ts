import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

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
    if (await checkCommand('claude')) available.push('claude');
    if (await checkCommand('codex')) available.push('codex');
    if (await checkCommand('opencode')) available.push('opencode');
    return available;
}

function generateWithCLI(cli: SupportedCLI, agentName: string, description?: string): Promise<string> {
    const metaPrompt = `You are an expert at writing system prompts for AI coding agents.

Generate a system prompt for an AI agent named "${agentName}"${description ? ` whose purpose is: ${description}` : ''}.

The system prompt should:
- Define the agent's role clearly
- List 3-5 key responsibilities as bullet points
- Include guidelines for code quality and communication style
- Be professional and actionable
- Be written in English

Output ONLY the system prompt text. Do not include any explanation, markdown formatting, or wrapper text.`;

    return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';

        let args: string[];
        let useStdin = true;
        const isWindows = process.platform === 'win32';

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
                    args = baseArgs.map(arg => (arg === '{prompt}' ? metaPrompt : arg));
                    useStdin = false;
                } else if (baseArgs.includes('-')) {
                    args = baseArgs;
                } else {
                    args = [...baseArgs, metaPrompt];
                    useStdin = false;
                }
            }
        } else {
            args = ['--print', '--dangerously-skip-permissions'];
        }

        const proc = spawn(cli, args, {
            cwd: process.cwd(),
            shell: isWindows,
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (useStdin) {
            proc.stdin?.write(metaPrompt);
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
            const cleanOutput = output.replace(/\x1B\[[0-9;]*[mK]/g, '').trim();
            resolve(cleanOutput);
        });

        proc.on('error', (error) => {
            reject(new Error(`Failed to start CLI: ${error.message}`));
        });

        setTimeout(() => {
            proc.kill();
            reject(new Error('CLI timeout'));
        }, 120000);
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
            return NextResponse.json(
                { error: 'Agent name is required' },
                { status: 400 }
            );
        }

        const available = await getAvailableCLIs();
        if (available.length === 0) {
            return NextResponse.json(
                { error: 'No CLI tool available. Please install claude, codex, or opencode.' },
                { status: 503 },
            );
        }

        const cli = available[0];
        const prompt = await generateWithCLI(cli, body.name.trim(), body.description?.trim());

        return NextResponse.json({
            success: true,
            prompt,
            provider: cli,
        });
    } catch (error) {
        console.error('Error generating prompt:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { error: 'Failed to generate prompt', details },
            { status: 500 },
        );
    }
}
