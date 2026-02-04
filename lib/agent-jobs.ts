import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { addMessage, completeConversation } from './server-store';

// ─── Global Error Handlers for Debugging ─────────────────────────────
// These help catch errors that might cause the process to crash

if (typeof process !== 'undefined') {
    process.on('uncaughtException', (error) => {
        process.stderr.write(`[agent-jobs:CRITICAL] Uncaught Exception: ${error}\n`);
        process.stderr.write(`[agent-jobs:CRITICAL] Stack: ${error.stack}\n`);
    });

    process.on('unhandledRejection', (reason, promise) => {
        process.stderr.write(`[agent-jobs:CRITICAL] Unhandled Rejection at: ${promise}\n`);
        process.stderr.write(`[agent-jobs:CRITICAL] Reason: ${reason}\n`);
    });

    // Add exit handler here too for redundancy
    process.on('exit', (code) => {
        process.stderr.write(`[agent-jobs:EXIT] Process exiting with code: ${code}\n`);
    });

    // Heartbeat timer - logs every 10 seconds to prove process is alive
    let heartbeatCount = 0;
    setInterval(() => {
        heartbeatCount++;
        const memUsage = process.memoryUsage();
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        const runningCount = runningJobs.size;
        process.stdout.write(`[heartbeat:${heartbeatCount}] alive | jobs: ${runningCount}, heap: ${heapMB}MB, rss: ${rssMB}MB\n`);
    }, 10000).unref(); // unref() so this doesn't keep the process alive
}

export type AgentProvider = 'claude' | 'opencode' | 'codex';

const CLAUDE_CMD = 'claude';
const OPENCODE_CMD = 'opencode';
const CODEX_CMD = 'codex';
const CLAUDE_STREAM_ARGS = [
    '--print',
    '--dangerously-skip-permissions',
    '--output-format=stream-json',
    '--include-partial-messages',
    '--verbose',
];
const OPENCODE_STREAM_ARGS = [
    'run',
    '--format', 'json',
];
const CODEX_STREAM_ARGS = [
    'exec',
    '--json',
    '--dangerously-bypass-approvals-and-sandbox',
];
const STREAM_FLUSH_INTERVAL_MS = 1000;
const STREAM_FLUSH_CHARS = 200;
const CLAUDE_MODEL_ENV_KEYS = ['CLAUDE_MODEL', 'CLAUDE_CODE_MODEL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_MODEL'];
const OPENCODE_MODEL_ENV_KEYS = ['OPENCODE_MODEL', 'OPENCODE_DEFAULT_MODEL'];
const CODEX_MODEL_ENV_KEYS = ['CODEX_MODEL', 'CODEX_DEFAULT_MODEL', 'OPENAI_MODEL', 'OPENAI_DEFAULT_MODEL'];
const CODEX_ARGS_ENV_KEY = 'CODEX_CLI_ARGS';

// Reserved ports that agents should never use (Olly Molly app ports)
const RESERVED_PORTS = [1234, 3000];

/**
 * Find an available port starting from the given port
 * Skips reserved ports to avoid conflicts with Olly Molly
 */
async function findAvailablePort(startPort = 3001): Promise<number> {
    const tryPort = (port: number): Promise<number> => {
        return new Promise((resolve) => {
            // Skip reserved ports
            if (RESERVED_PORTS.includes(port)) {
                resolve(tryPort(port + 1));
                return;
            }

            const server = net.createServer();
            server.listen(port, '127.0.0.1', () => {
                server.close(() => resolve(port));
            });
            server.on('error', () => {
                resolve(tryPort(port + 1));
            });
        });
    };
    return tryPort(startPort);
}

// Common instructions prepended to all agent prompts
const PORT_SAFETY_INSTRUCTIONS = `
🚨 CRITICAL PORT SAFETY RULES (MUST FOLLOW):
1. RESERVED PORTS - NEVER TOUCH: 1234, 31337, 3000 are used by Olly Molly. NEVER:
   - Kill processes on these ports (no kill, pkill, lsof -t, fuser -k, etc.)
   - Stop or restart services on these ports
   - Navigate Playwright to localhost:1234 or localhost:3000

2. If a port is in use: Find another available port. NEVER kill the existing process.

3. For dev servers: Use any port EXCEPT 1234, 31337 and 3000. Let the framework auto-select or use ports like 3001, 3002, 4000, 5000, 8080, etc.

4. Before killing ANY process on ANY port, verify it's not port 1234 or 3000.

`;

function getConfiguredModel(provider: AgentProvider): string | null {
    let keys: string[];
    if (provider === 'claude') {
        keys = CLAUDE_MODEL_ENV_KEYS;
    } else if (provider === 'opencode') {
        keys = OPENCODE_MODEL_ENV_KEYS;
    } else {
        keys = CODEX_MODEL_ENV_KEYS;
    }
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return null;
}

function getCodexInvocation(): { args: string[]; useStdin: boolean } {
    const rawArgs = process.env[CODEX_ARGS_ENV_KEY];
    if (!rawArgs) {
        // Default: use stream args with stdin
        return { args: [...CODEX_STREAM_ARGS, '-'], useStdin: true };
    }
    const parsed = rawArgs.split(' ').map(arg => arg.trim()).filter(Boolean);
    if (parsed.length === 0) {
        return { args: [...CODEX_STREAM_ARGS, '-'], useStdin: true };
    }
    // Ensure --json is included for streaming
    const hasJson = parsed.includes('--json');
    const hasExec = parsed.includes('exec');
    let baseArgs = hasExec ? parsed : ['exec', ...parsed];
    if (!hasJson) {
        // Insert --json after exec
        const execIndex = baseArgs.indexOf('exec');
        baseArgs = [...baseArgs.slice(0, execIndex + 1), '--json', ...baseArgs.slice(execIndex + 1)];
    }
    if (baseArgs.includes('-')) {
        return { args: baseArgs, useStdin: true };
    }
    return { args: [...baseArgs, '-'], useStdin: true };
}

interface RunningJob {
    id: string;
    conversationId: string;
    ticketId: string;
    agentId: string;
    agentName: string;
    projectPath: string;
    provider: AgentProvider;
    startedAt: Date;
    process: ChildProcess;
    output: string;
    status: 'running' | 'completed' | 'failed';
}

// Store running jobs in memory
const runningJobs = new Map<string, RunningJob>();

// ─── Debug Logging ───────────────────────────────────────────────────
function getMemoryUsage(): string {
    const used = process.memoryUsage();
    return `heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB, rss: ${Math.round(used.rss / 1024 / 1024)}MB`;
}

function logDebugState(context: string): void {
    const runningCount = Array.from(runningJobs.values()).filter(j => j.status === 'running').length;
    const jobsByProject = new Map<string, number>();
    for (const job of runningJobs.values()) {
        if (job.status === 'running') {
            const count = jobsByProject.get(job.projectPath) || 0;
            jobsByProject.set(job.projectPath, count + 1);
        }
    }
    const projectSummary = Array.from(jobsByProject.entries())
        .map(([p, c]) => `${path.basename(p)}:${c}`)
        .join(', ') || 'none';
    console.log(`[agent-jobs:debug] ${context} | running: ${runningCount}, total: ${runningJobs.size}, projects: [${projectSummary}], memory: ${getMemoryUsage()}`);
}

// Log debug state every 30 seconds if there are running jobs
let debugIntervalId: NodeJS.Timeout | null = null;
function startDebugInterval(): void {
    if (debugIntervalId) return;
    debugIntervalId = setInterval(() => {
        const runningCount = Array.from(runningJobs.values()).filter(j => j.status === 'running').length;
        if (runningCount > 0) {
            logDebugState('interval-check');
        } else if (debugIntervalId) {
            clearInterval(debugIntervalId);
            debugIntervalId = null;
        }
    }, 30000);
}

export function getRunningJobs(): Omit<RunningJob, 'process'>[] {
    return Array.from(runningJobs.values()).map(job => ({
        id: job.id,
        conversationId: job.conversationId,
        ticketId: job.ticketId,
        agentId: job.agentId,
        agentName: job.agentName,
        projectPath: job.projectPath,
        provider: job.provider,
        startedAt: job.startedAt,
        output: job.output,
        status: job.status,
    }));
}

export function getJobByTicketId(ticketId: string): Omit<RunningJob, 'process'> | null {
    for (const job of runningJobs.values()) {
        if (job.ticketId === ticketId) {
            return {
                id: job.id,
                conversationId: job.conversationId,
                ticketId: job.ticketId,
                agentId: job.agentId,
                agentName: job.agentName,
                projectPath: job.projectPath,
                provider: job.provider,
                startedAt: job.startedAt,
                output: job.output,
                status: job.status,
            };
        }
    }
    return null;
}

export function getJobById(jobId: string): Omit<RunningJob, 'process'> | null {
    const job = runningJobs.get(jobId);
    if (!job) return null;
    return {
        id: job.id,
        conversationId: job.conversationId,
        ticketId: job.ticketId,
        agentId: job.agentId,
        agentName: job.agentName,
        projectPath: job.projectPath,
        provider: job.provider,
        startedAt: job.startedAt,
        output: job.output,
        status: job.status,
    };
}

export function getJobOutput(jobId: string): string | null {
    const job = runningJobs.get(jobId);
    return job?.output || null;
}

// Agent Work Log file name
const WORK_LOG_FILE = 'AGENT_WORK_LOG.md';

interface WorkLogEntry {
    agentName: string;
    agentAvatar: string;
    ticketTitle: string;
    success: boolean;
    commitHash?: string;
    output: string;
}

/**
 * Append a work log entry to the project's AGENT_WORK_LOG.md file
 * New entries are added at the top so the most recent work is first
 */
function appendToWorkLog(projectPath: string, entry: WorkLogEntry): void {
    try {
        const logPath = path.join(projectPath, WORK_LOG_FILE);
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').split('.')[0];

        // Extract summary from output (last few meaningful lines)
        const summaryLines = extractSummary(entry.output);

        // Check for screenshots in .agent-screenshots folder
        const screenshotSection = getScreenshotSection(projectPath);

        // Build the new entry
        const newEntry = `
## ${timestamp} - ${entry.agentName} ${entry.agentAvatar}

**티켓:** ${entry.ticketTitle}
**상태:** ${entry.success ? '✅ 성공' : '❌ 실패'}
${entry.commitHash ? `**커밋:** ${entry.commitHash}` : ''}

### 작업 요약
${summaryLines}
${screenshotSection}
---
`;

        // Check if file exists
        if (fs.existsSync(logPath)) {
            // Read existing content
            const existingContent = fs.readFileSync(logPath, 'utf-8');
            // Find the position after the header (after first ---)
            const headerEndPos = existingContent.indexOf('---');
            if (headerEndPos !== -1) {
                const header = existingContent.substring(0, headerEndPos + 3);
                const rest = existingContent.substring(headerEndPos + 3);
                fs.writeFileSync(logPath, header + newEntry + rest, 'utf-8');
            } else {
                // No separator found, append to end
                fs.writeFileSync(logPath, existingContent + newEntry, 'utf-8');
            }
        } else {
            // Create new file with header
            const header = `# Agent Work Log

이 파일은 AI 에이전트들의 작업 기록입니다. 새로운 에이전트는 작업 전 이 파일을 참고하세요.

---
`;
            fs.writeFileSync(logPath, header + newEntry, 'utf-8');
        }

        console.log(`[agent-jobs] Work log updated: ${logPath}`);
    } catch (error) {
        console.error(`[agent-jobs] Failed to update work log:`, error);
    }
}

// Screenshot folder name
const SCREENSHOT_FOLDER = '.agent-screenshots';

/**
 * Get screenshot section for the work log
 * Looks for recent screenshots in .agent-screenshots folder
 */
function getScreenshotSection(projectPath: string): string {
    try {
        const screenshotDir = path.join(projectPath, SCREENSHOT_FOLDER);

        if (!fs.existsSync(screenshotDir)) {
            return '';
        }

        const files = fs.readdirSync(screenshotDir);
        const imageFiles = files.filter(f =>
            /\.(png|jpg|jpeg|gif|webp)$/i.test(f)
        );

        if (imageFiles.length === 0) {
            return '';
        }

        // Get files modified in the last 10 minutes (likely from current work)
        const recentFiles = imageFiles.filter(f => {
            const filePath = path.join(screenshotDir, f);
            const stats = fs.statSync(filePath);
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            return stats.mtimeMs > tenMinutesAgo;
        });

        const filesToInclude = recentFiles.length > 0 ? recentFiles : imageFiles.slice(-3);

        if (filesToInclude.length === 0) {
            return '';
        }

        const screenshotLinks = filesToInclude.map(f =>
            `![${f}](${SCREENSHOT_FOLDER}/${f})`
        ).join('\n');

        return `\n### 스크린샷\n${screenshotLinks}\n`;
    } catch (error) {
        console.error(`[agent-jobs] Failed to get screenshots:`, error);
        return '';
    }
}

/**
 * Extract a meaningful summary from agent output
 */
function extractSummary(output: string): string {
    // Remove ANSI escape codes
    const cleanOutput = output.replace(/\x1B\[[0-9;]*[mK]/g, '');

    // Lines to filter out (git noise, system messages, etc.)
    const noisePatterns = [
        /^changes not staged/i,
        /^use "git/i,
        /^\(use "git/i,
        /^modified:\s+/i,
        /^deleted:\s+/i,
        /^new file:\s+/i,
        /^on branch/i,
        /^your branch/i,
        /^nothing to commit/i,
        /^untracked files/i,
        /^changes to be committed/i,
        /^\s*$/,
        /^#/,
        /^\[.*\]$/,
        /^🚀/,
        /^✅/,
        /^❌/,
        /^Starting/i,
        /^Running/i,
        /^Executing/i,
    ];

    const lines = cleanOutput.split('\n').filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        return !noisePatterns.some(pattern => pattern.test(trimmed));
    });

    // Priority 1: Look for explicit summary section or commit message
    const summaryPatterns = [
        /^#+\s*summary/i,
        /^summary:/i,
        /completed.*:/i,
        /작업.*완료/i,
        /구현.*:/i,
        /변경.*:/i,
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (summaryPatterns.some(pattern => pattern.test(line))) {
            // Found a summary section, grab next few lines
            const summaryLines = [line];
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                if (lines[j].trim()) {
                    summaryLines.push(lines[j].trim());
                }
            }
            return summaryLines.map(l => `- ${l}`).join('\n');
        }
    }

    // Priority 2: Look for action verbs indicating completed work
    const actionPatterns = [
        /^(created|added|updated|fixed|implemented|removed|refactored|modified)/i,
        /^(생성|추가|수정|구현|삭제|변경|완료)/,
    ];

    const actionLines = lines.filter(line =>
        actionPatterns.some(pattern => pattern.test(line.trim()))
    );

    if (actionLines.length > 0) {
        return actionLines.slice(0, 5).map(l => `- ${l.trim()}`).join('\n');
    }

    // Priority 3: Look for file-related actions (but not git status noise)
    const fileActionLines = lines.filter(line => {
        const l = line.toLowerCase();
        return (l.includes('.tsx') || l.includes('.ts') || l.includes('.css') || l.includes('.json'))
            && !l.includes('modified:')
            && !l.includes('use "git');
    });

    if (fileActionLines.length > 0) {
        return fileActionLines.slice(0, 5).map(l => `- ${l.trim()}`).join('\n');
    }

    // Priority 4: Get last meaningful lines as fallback
    const lastMeaningfulLines = lines
        .filter(l => l.trim().length > 10) // Only lines with substantial content
        .slice(-5);

    if (lastMeaningfulLines.length > 0) {
        return lastMeaningfulLines.map(l => `- ${l.trim()}`).join('\n');
    }

    return '- 작업 완료됨';
}

interface StartJobParams {
    jobId: string;
    conversationId: string;
    ticketId: string;
    ticketTitle: string;
    agentId: string;
    agentName: string;
    agentAvatar?: string | null;
    projectPath: string;
    prompt: string;
    provider: AgentProvider;
}

export async function startBackgroundJob(params: StartJobParams): Promise<void> {
    const { jobId, conversationId, ticketId, ticketTitle, agentId, agentName, agentAvatar, projectPath, prompt: originalPrompt, provider } = params;

    // Debug: Log job start with current state
    console.log(`[agent-jobs] Starting job: ${jobId}`);
    console.log(`[agent-jobs]   ticket: ${ticketTitle} (${ticketId})`);
    console.log(`[agent-jobs]   agent: ${agentName} (${agentId})`);
    console.log(`[agent-jobs]   project: ${projectPath}`);
    console.log(`[agent-jobs]   provider: ${provider}`);
    logDebugState('job-start');
    startDebugInterval();

    // Find an available port for the agent to use
    const availablePort = await findAvailablePort(3001);
    console.log(`[agent-jobs] Found available port: ${availablePort}`);

    // Prepend safety instructions to the prompt (with actual port value substituted)
    const safetyInstructions = PORT_SAFETY_INSTRUCTIONS.replace(/\$AVAILABLE_PORT/g, String(availablePort));
    const prompt = safetyInstructions + originalPrompt;

    // Configure command and args based on provider
    let execPath: string;
    let args: string[];
    let startMessage: string;
    let useStdin = true;
    // All providers now use JSON streaming
    const isJsonStream = true;

    const modelLabel = getConfiguredModel(provider) ?? 'default';

    if (provider === 'opencode') {
        execPath = OPENCODE_CMD;
        // Use JSON format for streaming, stdin for prompt
        args = [...OPENCODE_STREAM_ARGS, '-'];
        startMessage = `🚀 Starting OpenCode in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else if (provider === 'codex') {
        execPath = CODEX_CMD;
        // Use JSON format for streaming, stdin for prompt
        const codex = getCodexInvocation();
        args = codex.args;
        useStdin = codex.useStdin;
        startMessage = `🚀 Starting Codex CLI in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else {
        execPath = CLAUDE_CMD;
        // Use stream-json format, stdin for prompt
        args = CLAUDE_STREAM_ARGS;
        startMessage = `🚀 Starting Claude Code in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    }

    // On Windows, shell: true is needed to find commands in PATH
    const isWindows = process.platform === 'win32';

    // Build a clean environment to prevent conflicts with parent app
    // Filter out Next.js, Turbopack, and other app-specific vars
    const excludePatterns = [
        'ELECTRON', 'CHROME', 'NODE_OPTIONS',
        '__NEXT', 'NEXT_', '__CFBundle',
        'ORIGINAL_XDG', 'GIO_', 'DBUS_',
        'TURBOPACK',
    ];

    const spawnEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value && !excludePatterns.some(pattern => key.toUpperCase().includes(pattern))) {
            spawnEnv[key] = value;
        }
    }

    // Set required vars
    // Provide an available port for agents to use (avoids conflicts with Olly Molly on 1234)
    spawnEnv.NODE_ENV = 'development';
    spawnEnv.AVAILABLE_PORT = String(availablePort);
    spawnEnv.DEV_PORT = String(availablePort);
    spawnEnv.PORT = String(availablePort); // Some frameworks use PORT directly

    // For OpenCode, set permission to allow all to skip interactive prompts
    if (provider === 'opencode') {
        spawnEnv.OPENCODE_PERMISSION = 'allow';
        spawnEnv.OPENCODE_AUTO_APPROVE = 'true';
    }

    // Debug: Log spawn details
    console.log(`[agent-jobs] Spawning process...`);
    console.log(`[agent-jobs]   command: ${execPath}`);
    console.log(`[agent-jobs]   args: ${JSON.stringify(args)}`);
    console.log(`[agent-jobs]   cwd: ${projectPath}`);
    console.log(`[agent-jobs]   shell: ${isWindows}`);
    console.log(`[agent-jobs]   envKeys: ${Object.keys(spawnEnv).length}`);

    let agentProcess: ReturnType<typeof spawn>;
    try {
        agentProcess = spawn(execPath, args, {
            cwd: projectPath,
            env: spawnEnv as NodeJS.ProcessEnv,
            shell: isWindows,
            detached: !isWindows, // Detach on Unix to prevent parent termination
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log(`[agent-jobs] Process spawned successfully, pid: ${agentProcess.pid}`);
    } catch (spawnError) {
        console.error(`[agent-jobs] CRITICAL: spawn() threw synchronously:`, spawnError);
        logDebugState('spawn-sync-error');
        throw spawnError;
    }

    // Unref so the parent process can exit independently (but we still capture output)
    if (!isWindows) {
        agentProcess.unref();
    }

    if (useStdin) {
        // Write prompt to stdin
        console.log(`[agent-jobs] Writing prompt to stdin (${prompt.length} chars)...`);
        try {
            agentProcess.stdin?.write(prompt);
            agentProcess.stdin?.end();
            console.log(`[agent-jobs] Stdin write completed`);
        } catch (stdinError) {
            console.error(`[agent-jobs] CRITICAL: stdin write failed:`, stdinError);
            logDebugState('stdin-write-error');
        }
    }

    const job: RunningJob = {
        id: jobId,
        conversationId,
        ticketId,
        agentId,
        agentName,
        projectPath,
        provider,
        startedAt: new Date(),
        process: agentProcess,
        output: startMessage,
        status: 'running',
    };

    runningJobs.set(jobId, job);

    let stdoutBuffer = '';
    let streamedTextBuffer = '';
    let lastFlushTime = Date.now();
    let hasStreamedText = false;
    let resultReceived = false; // Track if we received a result
    let resultIsError = false; // Track if result indicates error

    const flushStreamedText = (force = false) => {
        if (!streamedTextBuffer) return;
        const now = Date.now();
        if (!force && now - lastFlushTime < STREAM_FLUSH_INTERVAL_MS && streamedTextBuffer.length < STREAM_FLUSH_CHARS) {
            return;
        }
        const chunk = streamedTextBuffer;
        streamedTextBuffer = '';
        lastFlushTime = now;
        job.output += chunk;
        // Server stores the message (ComfyUI pattern: server owns all data)
        addMessage(conversationId, chunk, 'log');
    };

    // Extract text content from JSON based on provider
    const extractTextFromJson = (parsed: Record<string, unknown>): string | null => {
        // Claude Code format
        if (parsed?.type === 'stream_event' &&
            (parsed.event as Record<string, unknown>)?.type === 'content_block_delta' &&
            ((parsed.event as Record<string, unknown>)?.delta as Record<string, unknown>)?.type === 'text_delta') {
            return ((parsed.event as Record<string, unknown>)?.delta as Record<string, unknown>)?.text as string;
        }

        // OpenCode JSON format - content events
        if (parsed?.type === 'text' && typeof parsed.text === 'string') {
            return parsed.text;
        }
        if (parsed?.type === 'content' && typeof parsed.content === 'string') {
            return parsed.content;
        }
        // OpenCode message format
        if (parsed?.type === 'message' && typeof parsed.content === 'string') {
            return parsed.content;
        }
        // OpenCode assistant response
        if (parsed?.role === 'assistant' && typeof parsed.content === 'string') {
            return parsed.content;
        }

        // Codex JSONL format - text events
        if (parsed?.type === 'message' && parsed?.role === 'assistant') {
            const content = parsed.content;
            if (typeof content === 'string') {
                return content;
            }
            if (Array.isArray(content)) {
                return content
                    .filter((c: Record<string, unknown>) => c.type === 'text' || c.type === 'output_text')
                    .map((c: Record<string, unknown>) => c.text || c.content)
                    .join('');
            }
        }
        // Codex delta/chunk events
        if (parsed?.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
            return parsed.delta;
        }
        if (parsed?.type === 'content_block_delta' && typeof (parsed.delta as Record<string, unknown>)?.text === 'string') {
            return (parsed.delta as Record<string, unknown>).text as string;
        }
        // Codex tool output
        if (parsed?.type === 'tool_output' && typeof parsed.output === 'string') {
            return `[tool] ${parsed.output}\n`;
        }

        return null;
    };

    // Check if JSON indicates completion/result
    const checkForResult = (parsed: Record<string, unknown>): { isResult: boolean; isError: boolean; text?: string } => {
        // Claude Code result
        if (parsed?.type === 'result') {
            return {
                isResult: true,
                isError: parsed.is_error === true,
                text: typeof parsed.result === 'string' ? parsed.result : undefined,
            };
        }

        // OpenCode completion
        if (parsed?.type === 'done' || parsed?.type === 'complete' || parsed?.type === 'end') {
            return { isResult: true, isError: parsed.error === true || parsed.success === false };
        }
        if (parsed?.event === 'done' || parsed?.event === 'complete') {
            return { isResult: true, isError: parsed.error === true };
        }

        // Codex completion
        if (parsed?.type === 'response.completed' || parsed?.type === 'response.done') {
            return { isResult: true, isError: false };
        }
        if (parsed?.type === 'error') {
            return { isResult: true, isError: true, text: parsed.message as string || 'Unknown error' };
        }

        return { isResult: false, isError: false };
    };

    const handleJsonStreamLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const parsed = JSON.parse(trimmed);

            // Check for completion/result
            const resultCheck = checkForResult(parsed);
            if (resultCheck.isResult) {
                resultReceived = true;
                resultIsError = resultCheck.isError;
                if (resultCheck.text && !hasStreamedText) {
                    streamedTextBuffer += resultCheck.text;
                    hasStreamedText = true;
                    flushStreamedText(true);
                }
                return;
            }

            // Extract text content
            const text = extractTextFromJson(parsed);
            if (text) {
                streamedTextBuffer += text;
                hasStreamedText = true;
                flushStreamedText();
                return;
            }

            // Log unhandled JSON for debugging (only in dev)
            if (process.env.DEBUG_AGENT_STREAM === 'true') {
                console.log(`[agent-jobs:stream] Unhandled JSON: ${trimmed.substring(0, 200)}`);
            }
        } catch {
            // Not JSON, treat as plain text
            streamedTextBuffer += `${line}\n`;
            flushStreamedText();
        }
    };

    // Capture stdout - all providers use JSON streaming now
    agentProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        if (isJsonStream) {
            stdoutBuffer += text;
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                handleJsonStreamLine(line);
            }
            flushStreamedText();
            return;
        }

        // Fallback for non-JSON mode (not used currently)
        job.output += text;
        addMessage(conversationId, text, 'log');
    });

    // Capture stderr
    agentProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        const errorText = `[stderr] ${text}\n`;
        job.output += errorText;
        addMessage(conversationId, errorText, 'error');
    });

    agentProcess.on('close', (code: number | null) => {
        if (isJsonStream) {
            if (stdoutBuffer.trim()) {
                handleJsonStreamLine(stdoutBuffer);
                stdoutBuffer = '';
            }
            flushStreamedText(true);
        }

        // Log exit code for debugging
        console.log(`[agent-jobs] Process exited with code: ${code}, provider: ${provider}, resultReceived: ${resultReceived}, resultIsError: ${resultIsError}`);

        // Extract commit hash from output
        const commitMatch = job.output.match(/commit\s+([a-f0-9]{7,40})/i);
        const commitHash = commitMatch ? commitMatch[1] : undefined;

        // Determine success with multiple criteria:
        // 1. Exit code 0 (normal success)
        // 2. Has a commit hash (work was committed)
        // 3. Output contains success indicators
        // 4. Received a result message with is_error: false
        const hasSuccessIndicators =
            job.output.includes('commit') ||
            job.output.includes('committed') ||
            job.output.includes('completed') ||
            job.output.includes('successfully') ||
            job.output.includes('Created') ||
            job.output.includes('Modified') ||
            job.output.includes('Updated') ||
            job.output.includes('Implemented') ||
            job.output.includes('Fixed') ||
            job.output.includes('✅') ||
            /files?\s+(created|modified|updated|changed)/i.test(job.output);

        // Check for explicit failure indicators (only check stderr lines to avoid false positives from code output)
        // Look for failure patterns that are likely actual errors, not code being written
        const hasFailureIndicators =
            job.output.includes('[stderr] fatal:') ||
            job.output.includes('[stderr] Error:') ||
            job.output.includes('[error]') ||
            job.output.includes('FAILED') ||
            job.output.includes('❌ Task failed');

        // For JSON streaming providers, success if:
        // - We received a result message with is_error: false (most reliable)
        // - OR exit code 0
        // - OR we have success indicators and no clear failure indicators
        const streamSuccess = isJsonStream && (
            (resultReceived && !resultIsError) ||
            hasStreamedText && hasSuccessIndicators && !hasFailureIndicators
        );

        const success = code === 0 ||
            commitHash !== undefined ||
            streamSuccess ||
            (code === null && hasSuccessIndicators && !hasFailureIndicators) ||
            (hasSuccessIndicators && !hasFailureIndicators && job.output.length > 500);

        job.status = success ? 'completed' : 'failed';

        console.log(`[agent-jobs] Task marked as: ${job.status} (code: ${code}, commitHash: ${commitHash}, successIndicators: ${hasSuccessIndicators}, failureIndicators: ${hasFailureIndicators}, streamSuccess: ${streamSuccess}, resultIsError: ${resultIsError})`);
        logDebugState(`job-complete:${job.status}`);

        // Server completes the conversation (ComfyUI pattern: server handles completion)
        completeConversation(conversationId, {
            status: job.status,
            git_commit_hash: commitHash,
        });
        addMessage(
            conversationId,
            job.status === 'completed'
                ? `✅ Task completed successfully${commitHash ? ` (commit: ${commitHash})` : ''}`
                : '❌ Task failed',
            job.status === 'completed' ? 'success' : 'error',
        );

        // Append to work log file in project directory
        appendToWorkLog(job.projectPath, {
            agentName: job.agentName,
            agentAvatar: agentAvatar || '🤖',
            ticketTitle: ticketTitle || 'Unknown Task',
            success,
            commitHash,
            output: job.output,
        });

        // Remove from running jobs after a delay (keep for status check)
        setTimeout(() => {
            runningJobs.delete(jobId);
        }, 60000); // Keep completed job info for 1 minute
    });

    agentProcess.on('error', (error: Error & { code?: string; syscall?: string }) => {
        job.status = 'failed';

        // Provide more detailed error information for debugging
        let errorDetail = error.message;
        if (error.code === 'EINVAL') {
            errorDetail = `EINVAL: Invalid argument when spawning process. Command: ${execPath}, CWD: ${projectPath}`;
            console.error(`[agent-jobs] EINVAL error details:`, {
                command: execPath,
                args: args,
                cwd: projectPath,
                platform: process.platform,
            });
        } else if (error.code === 'ENOENT') {
            errorDetail = `ENOENT: Command not found: ${execPath}. Make sure ${provider} CLI is installed and in PATH.`;
        }

        job.output += `\n[error] ${errorDetail}`;
        console.error(`[agent-jobs] Process error:`, error);
        logDebugState(`job-error:${error.code || 'unknown'}`);

        completeConversation(conversationId, { status: 'failed' });
        addMessage(conversationId, `❌ Process error: ${errorDetail}`, 'error');

        setTimeout(() => {
            runningJobs.delete(jobId);
        }, 60000);
    });
}

export function cancelJob(jobId: string): boolean {
    const job = runningJobs.get(jobId);
    if (!job || job.status !== 'running') {
        return false;
    }

    job.process.kill('SIGTERM');
    job.status = 'failed';
    job.output += '\n[cancelled] Job was cancelled by user';

    completeConversation(job.conversationId, { status: 'cancelled' });
    addMessage(job.conversationId, '⏹ Job was cancelled by user', 'system');

    runningJobs.delete(jobId);
    return true;
}
