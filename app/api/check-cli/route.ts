import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkCommandExists(command: string): Promise<boolean> {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    try {
        await execAsync(checkCmd);
        return true;
    } catch {
        return false;
    }
}

export async function GET() {
    try {
        const [hasOpencode, hasClaude, hasCodex] = await Promise.all([
            checkCommandExists('opencode'),
            checkCommandExists('claude'),
            checkCommandExists('codex'),
        ]);

        return NextResponse.json({
            opencode: hasOpencode,
            claude: hasClaude,
            codex: hasCodex,
            anyInstalled: hasOpencode || hasClaude || hasCodex,
        });
    } catch (error) {
        console.error('Error checking CLI:', error);
        return NextResponse.json(
            { error: 'Failed to check CLI installation' },
            { status: 500 }
        );
    }
}
