import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CLI_CHECK_CACHE_TTL_MS = 60_000;
let cliCheckCache: { ts: number; result: { opencode: boolean; claude: boolean; codex: boolean; anyInstalled: boolean } } | null = null;

async function checkCommandExists(command: string): Promise<boolean> {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    try {
        // Windows: `where` can hang if PATH includes slow/unreachable entries (e.g., network drives).
        // Keep this fast to avoid freezing the UI on initial load.
        await execAsync(checkCmd, { timeout: 2000, windowsHide: true, maxBuffer: 256 * 1024 });
        return true;
    } catch {
        return false;
    }
}

export async function GET() {
    try {
        const now = Date.now();
        if (cliCheckCache && now - cliCheckCache.ts < CLI_CHECK_CACHE_TTL_MS) {
            return NextResponse.json(cliCheckCache.result);
        }

        const [hasOpencode, hasClaude, hasCodex] = await Promise.all([
            checkCommandExists('opencode'),
            checkCommandExists('claude'),
            checkCommandExists('codex'),
        ]);

        const result = {
            opencode: hasOpencode,
            claude: hasClaude,
            codex: hasCodex,
            anyInstalled: hasOpencode || hasClaude || hasCodex,
        };

        cliCheckCache = { ts: now, result };
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error checking CLI:', error);
        return NextResponse.json(
            { error: 'Failed to check CLI installation' },
            { status: 500 }
        );
    }
}
