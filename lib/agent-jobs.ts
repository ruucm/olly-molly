import { spawn, ChildProcess, execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
import https from 'https';
import { addMessage, completeConversation, addDirectCliMessage, completeDirectCliConversation } from './server-store';

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

// ─── OAuth Token (env → Keychain → file) ─────────────────────────────

function readClaudeCodeToken(): string | null {
    // 1. Explicit env var (highest priority, works on all platforms)
    if (process.env.ANTHROPIC_API_KEY) {
        const key = process.env.ANTHROPIC_API_KEY;
        console.log(`[readClaudeCodeToken] Using ANTHROPIC_API_KEY env var (${key.slice(0, 15)}...${key.slice(-4)})`);
        return key;
    }

    // 2. macOS Keychain
    if (process.platform === 'darwin') {
        try {
            const result = execSync(
                'security find-generic-password -s "Claude Code-credentials" -w',
                { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            const data = JSON.parse(result.trim());
            if (data?.claudeAiOauth?.accessToken) {
                const token = data.claudeAiOauth.accessToken;
                console.log(`[readClaudeCodeToken] Using macOS Keychain token (${token.slice(0, 15)}...${token.slice(-4)})`);
                return token;
            }
        } catch {}
    }

    // 3. Windows Credential Manager
    if (process.platform === 'win32') {
        try {
            const result = execSync(
                'powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((Get-StoredCredential -Target \'Claude Code-credentials\' -AsCredentialObject).Password))"',
                { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            if (result.trim()) {
                const data = JSON.parse(result.trim());
                if (data?.claudeAiOauth?.accessToken) {
                    const token = data.claudeAiOauth.accessToken;
                    console.log(`[readClaudeCodeToken] Using Windows Credential Manager token (${token.slice(0, 15)}...${token.slice(-4)})`);
                    return token;
                }
            }
        } catch {}
    }

    // 4. ~/.claude/.credentials.json (cross-platform)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        try {
            const credPath = path.join(homeDir, '.claude', '.credentials.json');
            const raw = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
            if (raw?.claudeAiOauth?.accessToken) {
                const token = raw.claudeAiOauth.accessToken;
                console.log(`[readClaudeCodeToken] Using credentials.json token (${token.slice(0, 15)}...${token.slice(-4)})`);
                return token;
            }
        } catch {}
    }

    console.log(`[readClaudeCodeToken] No token found from any source`);
    return null;
}

// ─── Tool Definitions (sent to Claude API) ───────────────────────────

const AGENT_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file at the given path.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path to read (absolute or relative to project root)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write content to a file, replacing its entire contents. Creates parent directories if needed.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path to write' },
                content: { type: 'string', description: 'Full file content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Replace an exact string in a file with new content. The old_string must match exactly (including whitespace and indentation).',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path to edit' },
                old_string: { type: 'string', description: 'Exact string to find in the file' },
                new_string: { type: 'string', description: 'String to replace it with' },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    {
        name: 'list_files',
        description: 'List files and directories in a given path.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Directory path to list' },
            },
            required: ['path'],
        },
    },
    {
        name: 'bash',
        description: 'Execute a shell command. Use this for git, npm, running dev servers, testing, and any other CLI operations. Commands run in the project root directory.',
        input_schema: {
            type: 'object' as const,
            properties: {
                command: { type: 'string', description: 'Shell command to execute' },
                timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
            },
            required: ['command'],
        },
    },
];

// ─── Tool Execution ──────────────────────────────────────────────────

function resolvePath(filePath: string, projectPath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(projectPath, filePath);
}

async function executeTool(
    name: string,
    input: Record<string, unknown>,
    projectPath: string,
    env?: Record<string, string | undefined>
): Promise<{ content: string }> {
    try {
        switch (name) {
            case 'read_file': {
                const filePath = resolvePath(input.path as string, projectPath);
                const content = fs.readFileSync(filePath, 'utf-8');
                return { content };
            }
            case 'write_file': {
                const filePath = resolvePath(input.path as string, projectPath);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, input.content as string, 'utf-8');
                return { content: `File written: ${filePath} (${(input.content as string).length} chars)` };
            }
            case 'edit_file': {
                const filePath = resolvePath(input.path as string, projectPath);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const oldStr = input.old_string as string;
                if (!fileContent.includes(oldStr)) {
                    return { content: `Error: String not found in file. The old_string must match exactly (including whitespace).` };
                }
                const newContent = fileContent.replace(oldStr, input.new_string as string);
                fs.writeFileSync(filePath, newContent, 'utf-8');
                return { content: `Edit applied to ${filePath}` };
            }
            case 'list_files': {
                const dirPath = resolvePath(input.path as string, projectPath);
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                const list = entries.map(e => (e.isDirectory() ? e.name + '/' : e.name));
                return { content: list.join('\n') };
            }
            case 'bash': {
                const command = input.command as string;
                const timeout = (input.timeout as number) || 120000;

                // For background commands (ending with &), use nohup + redirect
                // so the child process is fully detached and doesn't block
                const isBackground = /&\s*$/.test(command.trim());
                const actualCommand = isBackground
                    ? `nohup bash -c ${JSON.stringify(command.replace(/&\s*$/, ''))} > /dev/null 2>&1 & echo "Background process started (pid: $!)"`
                    : command;

                return new Promise((resolve) => {
                    exec(actualCommand, {
                        cwd: projectPath,
                        timeout: isBackground ? 10000 : timeout,
                        maxBuffer: 10 * 1024 * 1024,
                        env: { ...process.env, ...env } as NodeJS.ProcessEnv,
                    }, (error, stdout, stderr) => {
                        const parts: string[] = [];
                        if (stdout) parts.push(stdout.toString());
                        if (stderr) parts.push(`stderr: ${stderr.toString()}`);
                        if (error && error.killed) parts.push(`(command timed out after ${timeout}ms)`);
                        else if (error) parts.push(`exit code: ${error.code}`);
                        resolve({ content: parts.join('\n') || '(no output)' });
                    });
                });
            }
            default:
                return { content: `Error: Unknown tool: ${name}` };
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: `Error: ${msg}` };
    }
}

// ─── Anthropic API Call ──────────────────────────────────────────────

interface AnthropicResponse {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
    error?: { message: string };
}

const MAX_API_RETRIES = 3;
const RETRY_STATUS_CODES = [429, 529, 503];

function callAnthropicOnce(apiKey: string, bodyObj: Record<string, unknown>, isOAuth: boolean): Promise<AnthropicResponse> {
    return new Promise((resolve, reject) => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };
        if (isOAuth) {
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['anthropic-beta'] = 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14';
            headers['user-agent'] = 'claude-cli/2.1.75';
            headers['x-app'] = 'cli';
        } else {
            headers['x-api-key'] = apiKey;
        }

        const postData = Buffer.from(JSON.stringify(bodyObj), 'utf-8');
        headers['Content-Length'] = String(postData.length);

        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers,
        }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => data += chunk.toString());
            res.on('end', () => {
                console.log(`[callAnthropic] HTTP ${res.statusCode} | response: ${data.slice(0, 300)}`);
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'error' && parsed.error) {
                        const err = new Error(`Anthropic API error (${res.statusCode}): [${parsed.error.type}] ${parsed.error.message}`);
                        (err as Error & { statusCode?: number }).statusCode = res.statusCode || 0;
                        reject(err);
                        return;
                    }
                    if (res.statusCode && res.statusCode >= 400) {
                        const err = new Error(`Anthropic API HTTP ${res.statusCode}: ${data.slice(0, 300)}`);
                        (err as Error & { statusCode?: number }).statusCode = res.statusCode;
                        reject(err);
                        return;
                    }
                    resolve(parsed);
                } catch {
                    reject(new Error(`API parse error (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function callAnthropic(apiKey: string, body: object): Promise<AnthropicResponse> {
    const isOAuth = apiKey.includes('sk-ant-oat');

    // For OAuth tokens, prepend Claude Code identity to system prompt
    const bodyObj = { ...(body as Record<string, unknown>) };
    if (isOAuth) {
        const originalSystem = bodyObj.system as string || '';
        bodyObj.system = [
            {
                type: 'text',
                text: "You are Claude Code, Anthropic's official CLI for Claude.",
                cache_control: { type: 'ephemeral' },
            },
            ...(originalSystem ? [{
                type: 'text',
                text: originalSystem,
                cache_control: { type: 'ephemeral' },
            }] : []),
        ];
    }

    console.log(`[callAnthropic] isOAuth=${isOAuth}, model=${bodyObj.model}`);

    for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
        try {
            return await callAnthropicOnce(apiKey, bodyObj, isOAuth);
        } catch (err: unknown) {
            const statusCode = (err as Error & { statusCode?: number }).statusCode || 0;
            const isRetryable = RETRY_STATUS_CODES.includes(statusCode);

            if (!isRetryable || attempt === MAX_API_RETRIES) {
                throw err;
            }

            const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
            console.log(`[callAnthropic] Retryable error (${statusCode}), attempt ${attempt + 1}/${MAX_API_RETRIES}, waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Unreachable');
}

// ─── Agent Loop (Tool Use Loop) ──────────────────────────────────────

const MAX_AGENT_TURNS = 30;

interface AgentLoopCallbacks {
    onTurn: (turn: number) => void;
    onTool: (name: string, input: string) => void;
    onText: (text: string) => void;
}

async function runAgentLoop(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    projectPath: string,
    callbacks: AgentLoopCallbacks,
    env?: Record<string, string | undefined>,
    abortSignal?: { aborted: boolean },
): Promise<{ summary: string; turns: number }> {
    const model = getConfiguredModel('claude') || 'claude-sonnet-4-20250514';
    const messages: Array<{ role: string; content: unknown }> = [
        { role: 'user', content: userPrompt },
    ];

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
        if (abortSignal?.aborted) {
            return { summary: 'Job was cancelled', turns: turn };
        }

        callbacks.onTurn(turn + 1);

        const response = await callAnthropic(apiKey, {
            model,
            max_tokens: 16384,
            system: systemPrompt,
            tools: AGENT_TOOLS,
            messages,
        });

        if (response.error) {
            console.error(`[runAgentLoop] API returned error object:`, JSON.stringify(response.error));
            console.error(`[runAgentLoop] Full response:`, JSON.stringify(response).slice(0, 1000));
            throw new Error(response.error.message || JSON.stringify(response.error));
        }

        if (!response.content) {
            console.error(`[runAgentLoop] No content in response:`, JSON.stringify(response).slice(0, 1000));
            throw new Error(`Unexpected API response (no content): ${JSON.stringify(response).slice(0, 500)}`);
        }

        // Add assistant response to messages
        messages.push({ role: 'assistant', content: response.content });

        // Extract text blocks for streaming
        const textBlocks = response.content.filter(b => b.type === 'text');
        for (const block of textBlocks) {
            if (block.text) callbacks.onText(block.text);
        }

        // Check for tool_use blocks
        const toolUses = response.content.filter(b => b.type === 'tool_use');

        if (toolUses.length === 0) {
            // No tool calls → final response
            const finalText = textBlocks.map(b => b.text || '').join('\n');
            return { summary: finalText, turns: turn + 1 };
        }

        // Execute tools and collect results
        const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
        for (const toolUse of toolUses) {
            const inputSummary = toolUse.name === 'bash'
                ? (toolUse.input?.command as string || '').slice(0, 100)
                : (toolUse.input?.path as string || '');
            callbacks.onTool(toolUse.name!, inputSummary);

            const result = await executeTool(
                toolUse.name!,
                toolUse.input || {},
                projectPath,
                env as Record<string, string | undefined>,
            );

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id!,
                content: result.content,
            });
        }

        messages.push({ role: 'user', content: toolResults });

        // If stop_reason is end_turn (not tool_use), we're done
        if (response.stop_reason === 'end_turn') {
            const finalText = textBlocks.map(b => b.text || '').join('\n');
            return { summary: finalText || 'Task completed', turns: turn + 1 };
        }
    }

    return { summary: `Reached max turns (${MAX_AGENT_TURNS})`, turns: MAX_AGENT_TURNS };
}

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
    process?: ChildProcess;       // CLI-based jobs
    abortSignal?: { aborted: boolean }; // API-based jobs
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

function cleanupAttachments(projectPath: string, ticketId: string): void {
    try {
        const attachDir = path.join(projectPath, '.agent-attachments', ticketId);
        if (fs.existsSync(attachDir)) {
            fs.rmSync(attachDir, { recursive: true, force: true });
            console.log(`[agent-jobs] Cleaned up attachments: ${attachDir}`);
        }
    } catch (error) {
        console.error(`[agent-jobs] Failed to cleanup attachments:`, error);
    }
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

// ─── API-based Job Runner (for Claude provider) ─────────────────────

async function startClaudeApiJob(params: StartJobParams): Promise<void> {
    const { jobId, conversationId, ticketId, ticketTitle, agentId, agentName, agentAvatar, projectPath, prompt } = params;

    console.log(`[agent-jobs:api] Starting API-based job: ${jobId}`);
    console.log(`[agent-jobs:api]   ticket: ${ticketTitle} (${ticketId})`);
    console.log(`[agent-jobs:api]   agent: ${agentName} (${agentId})`);
    console.log(`[agent-jobs:api]   project: ${projectPath}`);
    logDebugState('api-job-start');
    startDebugInterval();

    const availablePort = await findAvailablePort(3001);
    console.log(`[agent-jobs:api] Found available port: ${availablePort}`);

    const apiKey = readClaudeCodeToken();
    if (!apiKey) {
        throw new Error('Claude Code 인증 토큰을 찾을 수 없습니다. Keychain, ~/.claude/.credentials.json, 또는 ANTHROPIC_API_KEY 환경변수를 확인하세요.');
    }

    const modelLabel = getConfiguredModel('claude') || 'claude-sonnet-4-20250514';
    const startMessage = `🚀 Starting Claude API agent in ${projectPath}...\nModel: ${modelLabel}\n\n`;

    const abortSignal = { aborted: false };

    const job: RunningJob = {
        id: jobId,
        conversationId,
        ticketId,
        agentId,
        agentName,
        projectPath,
        provider: 'claude',
        startedAt: new Date(),
        abortSignal,
        output: startMessage,
        status: 'running',
    };

    runningJobs.set(jobId, job);

    // Build env for bash tool
    const agentEnv: Record<string, string | undefined> = {
        AVAILABLE_PORT: String(availablePort),
        DEV_PORT: String(availablePort),
        PORT: String(availablePort),
    };

    // Build system prompt
    const safetyInstructions = PORT_SAFETY_INSTRUCTIONS.replace(/\$AVAILABLE_PORT/g, String(availablePort));
    const systemPrompt = `You are a coding agent that completes development tasks. You have tools to read, write, and edit files, list directories, and execute shell commands (bash).

${safetyInstructions}

IMPORTANT RULES:
1. Always read relevant files before making changes.
2. Use edit_file for precise changes (preferred over write_file for existing files).
3. Use bash for git commands, package management, running tests, starting dev servers, etc.
4. After completing all changes, create a git commit with a descriptive message.
5. Provide a brief summary of what you did when finished.
6. Your assigned dev port is ${availablePort}. Use it for any dev servers.
7. Before finishing, stop any dev servers you started on port ${availablePort}.`;

    // Fire and forget the agent loop
    (async () => {
        try {
            const result = await runAgentLoop(
                apiKey,
                systemPrompt,
                prompt,
                projectPath,
                {
                    onTurn: (turn) => {
                        console.log(`[agent-jobs:api] Turn ${turn} for job ${jobId}`);
                    },
                    onTool: (name, input) => {
                        const logMsg = `[tool] ${name}: ${input}\n`;
                        job.output += logMsg;
                        addMessage(conversationId, logMsg, 'log');
                    },
                    onText: (text) => {
                        job.output += text;
                        addMessage(conversationId, text, 'log');
                    },
                },
                agentEnv,
                abortSignal,
            );

            // Extract commit hash from output
            const commitMatch = job.output.match(/commit\s+([a-f0-9]{7,40})/i);
            const commitHash = commitMatch ? commitMatch[1] : undefined;

            job.status = 'completed';
            console.log(`[agent-jobs:api] Job ${jobId} completed. Turns: ${result.turns}, commit: ${commitHash || 'none'}`);
            logDebugState('api-job-complete');

            completeConversation(conversationId, {
                status: 'completed',
                git_commit_hash: commitHash,
            });
            addMessage(
                conversationId,
                `✅ Task completed successfully${commitHash ? ` (commit: ${commitHash})` : ''}`,
                'success',
            );

            appendToWorkLog(projectPath, {
                agentName,
                agentAvatar: agentAvatar || '🤖',
                ticketTitle: ticketTitle || 'Unknown Task',
                success: true,
                commitHash,
                output: job.output,
            });

            cleanupAttachments(projectPath, ticketId);

            setTimeout(() => { runningJobs.delete(jobId); }, 60000);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[agent-jobs:api] Job ${jobId} failed:`, errorMessage);
            logDebugState('api-job-error');

            job.status = 'failed';
            job.output += `\n[error] ${errorMessage}`;

            completeConversation(conversationId, { status: 'failed' });
            addMessage(conversationId, `❌ Task failed: ${errorMessage}`, 'error');

            appendToWorkLog(projectPath, {
                agentName,
                agentAvatar: agentAvatar || '🤖',
                ticketTitle: ticketTitle || 'Unknown Task',
                success: false,
                output: job.output,
            });

            cleanupAttachments(projectPath, ticketId);

            setTimeout(() => { runningJobs.delete(jobId); }, 60000);
        }
    })();
}

export async function startBackgroundJob(params: StartJobParams): Promise<void> {
    const { jobId, conversationId, ticketId, ticketTitle, agentId, agentName, agentAvatar, projectPath, prompt: originalPrompt, provider } = params;

    // Use direct API for Claude provider
    if (provider === 'claude') {
        return startClaudeApiJob(params);
    }

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

        // Cleanup image attachments
        cleanupAttachments(projectPath, ticketId);

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

    // Cancel API-based or process-based job
    if (job.abortSignal) {
        job.abortSignal.aborted = true;
    }
    if (job.process) {
        job.process.kill('SIGTERM');
    }

    job.status = 'failed';
    job.output += '\n[cancelled] Job was cancelled by user';

    completeConversation(job.conversationId, { status: 'cancelled' });
    addMessage(job.conversationId, '⏹ Job was cancelled by user', 'system');

    // Cleanup image attachments
    cleanupAttachments(job.projectPath, job.ticketId);

    runningJobs.delete(jobId);
    return true;
}

// ─── DirectCLI Job Management ────────────────────────────────────────

interface DirectCliJob {
    id: string;
    conversationId: string;
    projectPath: string;
    provider: AgentProvider;
    startedAt: Date;
    process?: ChildProcess;
    abortSignal?: { aborted: boolean };
    output: string;
    status: 'running' | 'completed' | 'failed';
}

const directCliJobs = new Map<string, DirectCliJob>();

export function getDirectCliJob(jobId: string): Omit<DirectCliJob, 'process'> | null {
    const job = directCliJobs.get(jobId);
    if (!job) return null;
    return {
        id: job.id,
        conversationId: job.conversationId,
        projectPath: job.projectPath,
        provider: job.provider,
        startedAt: job.startedAt,
        output: job.output,
        status: job.status,
    };
}

export function getDirectCliJobByConversationId(conversationId: string): Omit<DirectCliJob, 'process'> | null {
    for (const job of directCliJobs.values()) {
        if (job.conversationId === conversationId) {
            return {
                id: job.id,
                conversationId: job.conversationId,
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

interface StartDirectCliJobParams {
    jobId: string;
    conversationId: string;
    projectPath: string;
    prompt: string;
    provider: AgentProvider;
}

export async function startDirectCliJob(params: StartDirectCliJobParams): Promise<void> {
    const { jobId, conversationId, projectPath, prompt, provider } = params;

    // Use direct API for Claude provider
    if (provider === 'claude') {
        console.log(`[agent-jobs:api] Starting DirectCLI API job: ${jobId}`);

        const apiKey = readClaudeCodeToken();
        if (!apiKey) {
            throw new Error('Claude Code 인증 토큰을 찾을 수 없습니다.');
        }

        const availablePort = await findAvailablePort(3001);
        const modelLabel = getConfiguredModel('claude') || 'claude-sonnet-4-20250514';
        const abortSignal = { aborted: false };

        const job: DirectCliJob = {
            id: jobId,
            conversationId,
            projectPath,
            provider: 'claude',
            startedAt: new Date(),
            abortSignal,
            output: `🚀 Starting Claude API agent in ${projectPath}...\nModel: ${modelLabel}\n\n`,
            status: 'running',
        };
        directCliJobs.set(jobId, job);

        const systemPrompt = `You are a coding agent. You have tools to read, write, edit files, list directories, and execute shell commands. Complete the task and provide a brief summary.`;
        const agentEnv: Record<string, string | undefined> = {
            AVAILABLE_PORT: String(availablePort),
            DEV_PORT: String(availablePort),
            PORT: String(availablePort),
        };

        (async () => {
            try {
                const result = await runAgentLoop(apiKey, systemPrompt, prompt, projectPath, {
                    onTurn: (turn) => console.log(`[agent-jobs:api] DirectCLI turn ${turn}`),
                    onTool: (name, input) => {
                        const msg = `[tool] ${name}: ${input}\n`;
                        job.output += msg;
                        addDirectCliMessage(conversationId, msg, 'log');
                    },
                    onText: (text) => {
                        job.output += text;
                        addDirectCliMessage(conversationId, text, 'log');
                    },
                }, agentEnv, abortSignal);

                job.status = 'completed';
                completeDirectCliConversation(conversationId, { status: 'completed' });
                addDirectCliMessage(conversationId, '✅ Execution completed successfully', 'success');
                setTimeout(() => { directCliJobs.delete(jobId); }, 60000);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                job.status = 'failed';
                job.output += `\n[error] ${msg}`;
                completeDirectCliConversation(conversationId, { status: 'failed' });
                addDirectCliMessage(conversationId, `❌ Execution failed: ${msg}`, 'error');
                setTimeout(() => { directCliJobs.delete(jobId); }, 60000);
            }
        })();

        return;
    }

    console.log(`[agent-jobs] Starting DirectCLI job: ${jobId}`);
    console.log(`[agent-jobs]   project: ${projectPath}`);
    console.log(`[agent-jobs]   provider: ${provider}`);

    // Find an available port for the agent to use
    const availablePort = await findAvailablePort(3001);
    console.log(`[agent-jobs] Found available port: ${availablePort}`);

    // Configure command and args based on provider
    let execPath: string;
    let args: string[];
    let startMessage: string;
    let useStdin = true;

    const modelLabel = getConfiguredModel(provider) ?? 'default';

    if (provider === 'opencode') {
        execPath = OPENCODE_CMD;
        args = [...OPENCODE_STREAM_ARGS, '-'];
        startMessage = `🚀 Starting OpenCode in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else if (provider === 'codex') {
        execPath = CODEX_CMD;
        const codex = getCodexInvocation();
        args = codex.args;
        useStdin = codex.useStdin;
        startMessage = `🚀 Starting Codex CLI in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else {
        execPath = OPENCODE_CMD; // fallback (shouldn't reach here)
        args = [...OPENCODE_STREAM_ARGS, '-'];
        startMessage = `🚀 Starting in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    }

    const isWindows = process.platform === 'win32';

    // Build clean environment
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

    spawnEnv.NODE_ENV = 'development';
    spawnEnv.AVAILABLE_PORT = String(availablePort);
    spawnEnv.DEV_PORT = String(availablePort);
    spawnEnv.PORT = String(availablePort);

    if (provider === 'opencode') {
        spawnEnv.OPENCODE_PERMISSION = 'allow';
        spawnEnv.OPENCODE_AUTO_APPROVE = 'true';
    }

    console.log(`[agent-jobs] Spawning DirectCLI process...`);
    console.log(`[agent-jobs]   command: ${execPath}`);
    console.log(`[agent-jobs]   args: ${JSON.stringify(args)}`);

    let agentProcess: ReturnType<typeof spawn>;
    try {
        agentProcess = spawn(execPath, args, {
            cwd: projectPath,
            env: spawnEnv as NodeJS.ProcessEnv,
            shell: isWindows,
            detached: !isWindows,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log(`[agent-jobs] DirectCLI process spawned, pid: ${agentProcess.pid}`);
    } catch (spawnError) {
        console.error(`[agent-jobs] CRITICAL: DirectCLI spawn() failed:`, spawnError);
        throw spawnError;
    }

    if (!isWindows) {
        agentProcess.unref();
    }

    if (useStdin) {
        console.log(`[agent-jobs] Writing prompt to stdin (${prompt.length} chars)...`);
        try {
            agentProcess.stdin?.write(prompt);
            agentProcess.stdin?.end();
            console.log(`[agent-jobs] Stdin write completed`);
        } catch (stdinError) {
            console.error(`[agent-jobs] CRITICAL: stdin write failed:`, stdinError);
        }
    }

    const job: DirectCliJob = {
        id: jobId,
        conversationId,
        projectPath,
        provider,
        startedAt: new Date(),
        process: agentProcess,
        output: startMessage,
        status: 'running',
    };

    directCliJobs.set(jobId, job);

    let stdoutBuffer = '';
    let streamedTextBuffer = '';
    let lastFlushTime = Date.now();
    let hasStreamedText = false;
    let resultReceived = false;
    let resultIsError = false;

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
        addDirectCliMessage(conversationId, chunk, 'log');
    };

    const extractTextFromJson = (parsed: Record<string, unknown>): string | null => {
        if (parsed?.type === 'stream_event' &&
            (parsed.event as Record<string, unknown>)?.type === 'content_block_delta' &&
            ((parsed.event as Record<string, unknown>)?.delta as Record<string, unknown>)?.type === 'text_delta') {
            return ((parsed.event as Record<string, unknown>)?.delta as Record<string, unknown>)?.text as string;
        }
        if (parsed?.type === 'text' && typeof parsed.text === 'string') {
            return parsed.text;
        }
        if (parsed?.type === 'content' && typeof parsed.content === 'string') {
            return parsed.content;
        }
        if (parsed?.type === 'message' && typeof parsed.content === 'string') {
            return parsed.content;
        }
        if (parsed?.role === 'assistant' && typeof parsed.content === 'string') {
            return parsed.content;
        }
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
        if (parsed?.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
            return parsed.delta;
        }
        if (parsed?.type === 'content_block_delta' && typeof (parsed.delta as Record<string, unknown>)?.text === 'string') {
            return (parsed.delta as Record<string, unknown>).text as string;
        }
        if (parsed?.type === 'tool_output' && typeof parsed.output === 'string') {
            return `[tool] ${parsed.output}\n`;
        }
        return null;
    };

    const checkForResult = (parsed: Record<string, unknown>): { isResult: boolean; isError: boolean; text?: string } => {
        if (parsed?.type === 'result') {
            return {
                isResult: true,
                isError: parsed.is_error === true,
                text: typeof parsed.result === 'string' ? parsed.result : undefined,
            };
        }
        if (parsed?.type === 'done' || parsed?.type === 'complete' || parsed?.type === 'end') {
            return { isResult: true, isError: parsed.error === true || parsed.success === false };
        }
        if (parsed?.event === 'done' || parsed?.event === 'complete') {
            return { isResult: true, isError: parsed.error === true };
        }
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
            const text = extractTextFromJson(parsed);
            if (text) {
                streamedTextBuffer += text;
                hasStreamedText = true;
                flushStreamedText();
                return;
            }
        } catch {
            streamedTextBuffer += `${line}\n`;
            flushStreamedText();
        }
    };

    agentProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stdoutBuffer += text;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
            handleJsonStreamLine(line);
        }
        flushStreamedText();
    });

    agentProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        const errorText = `[stderr] ${text}\n`;
        job.output += errorText;
        addDirectCliMessage(conversationId, errorText, 'error');
    });

    agentProcess.on('close', (code: number | null) => {
        if (stdoutBuffer.trim()) {
            handleJsonStreamLine(stdoutBuffer);
            stdoutBuffer = '';
        }
        flushStreamedText(true);

        console.log(`[agent-jobs] DirectCLI process exited with code: ${code}`);

        const hasSuccessIndicators =
            job.output.includes('completed') ||
            job.output.includes('successfully') ||
            job.output.includes('✅');

        const hasFailureIndicators =
            job.output.includes('[stderr] fatal:') ||
            job.output.includes('[stderr] Error:') ||
            job.output.includes('[error]') ||
            job.output.includes('FAILED');

        const streamSuccess = (resultReceived && !resultIsError) ||
            (hasStreamedText && hasSuccessIndicators && !hasFailureIndicators);

        const success = code === 0 || streamSuccess ||
            (code === null && hasSuccessIndicators && !hasFailureIndicators);

        job.status = success ? 'completed' : 'failed';

        console.log(`[agent-jobs] DirectCLI job marked as: ${job.status}`);

        completeDirectCliConversation(conversationId, { status: job.status });
        addDirectCliMessage(
            conversationId,
            job.status === 'completed'
                ? '✅ Execution completed successfully'
                : '❌ Execution failed',
            job.status === 'completed' ? 'success' : 'error',
        );

        setTimeout(() => {
            directCliJobs.delete(jobId);
        }, 60000);
    });

    agentProcess.on('error', (error: Error & { code?: string }) => {
        job.status = 'failed';

        let errorDetail = error.message;
        if (error.code === 'ENOENT') {
            errorDetail = `ENOENT: Command not found: ${execPath}. Make sure ${provider} CLI is installed and in PATH.`;
        }

        job.output += `\n[error] ${errorDetail}`;
        console.error(`[agent-jobs] DirectCLI process error:`, error);

        completeDirectCliConversation(conversationId, { status: 'failed' });
        addDirectCliMessage(conversationId, `❌ Process error: ${errorDetail}`, 'error');

        setTimeout(() => {
            directCliJobs.delete(jobId);
        }, 60000);
    });
}

export function cancelDirectCliJob(jobId: string): boolean {
    const job = directCliJobs.get(jobId);
    if (!job || job.status !== 'running') {
        return false;
    }

    if (job.abortSignal) {
        job.abortSignal.aborted = true;
    }
    if (job.process) {
        job.process.kill('SIGTERM');
    }

    job.status = 'failed';
    job.output += '\n[cancelled] Job was cancelled by user';

    completeDirectCliConversation(job.conversationId, { status: 'cancelled' });
    addDirectCliMessage(job.conversationId, '⏹ Job was cancelled by user', 'system');

    directCliJobs.delete(jobId);
    return true;
}
