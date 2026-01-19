import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

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
const STREAM_FLUSH_INTERVAL_MS = 1000;
const STREAM_FLUSH_CHARS = 200;
const CLAUDE_MODEL_ENV_KEYS = ['CLAUDE_MODEL', 'CLAUDE_CODE_MODEL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_MODEL'];
const OPENCODE_MODEL_ENV_KEYS = ['OPENCODE_MODEL', 'OPENCODE_DEFAULT_MODEL'];
const CODEX_MODEL_ENV_KEYS = ['CODEX_MODEL', 'CODEX_DEFAULT_MODEL', 'OPENAI_MODEL', 'OPENAI_DEFAULT_MODEL'];
const CODEX_ARGS_ENV_KEY = 'CODEX_CLI_ARGS';

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

function getCodexInvocation(prompt: string): { args: string[]; useStdin: boolean } {
    const rawArgs = process.env[CODEX_ARGS_ENV_KEY];
    if (!rawArgs) {
        return { args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'], useStdin: true };
    }
    const parsed = rawArgs.split(' ').map(arg => arg.trim()).filter(Boolean);
    if (parsed.length === 0) {
        return { args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'], useStdin: true };
    }
    const hasExec = parsed.includes('exec');
    const baseArgs = hasExec ? parsed : ['exec', ...parsed];
    if (baseArgs.includes('{prompt}')) {
        return { args: baseArgs.map(arg => (arg === '{prompt}' ? prompt : arg)), useStdin: false };
    }
    if (baseArgs.includes('-')) {
        return { args: baseArgs, useStdin: true };
    }
    return { args: [...baseArgs, prompt], useStdin: false };
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

export function startBackgroundJob(params: StartJobParams): void {
    const { jobId, conversationId, ticketId, ticketTitle, agentId, agentName, agentAvatar, projectPath, prompt, provider } = params;

    // Configure command and args based on provider
    let execPath: string;
    let args: string[];
    let startMessage: string;
    let useStdin = true;
    const isClaudeStream = provider === 'claude';

    const modelLabel = getConfiguredModel(provider) ?? 'default';

    if (provider === 'opencode') {
        execPath = OPENCODE_CMD;
        // Use stdin for prompt to avoid shell escaping issues
        args = ['run', '-'];
        startMessage = `🚀 Starting OpenCode in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else if (provider === 'codex') {
        execPath = CODEX_CMD;
        // Use stdin for prompt to avoid shell escaping issues
        const codex = getCodexInvocation(prompt);
        args = codex.args;
        useStdin = codex.useStdin;
        startMessage = `🚀 Starting Codex CLI in ${projectPath}...\nModel: ${modelLabel}\n\n`;
    } else {
        execPath = CLAUDE_CMD;
        // Use stdin for prompt to avoid shell escaping issues
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
    spawnEnv.PORT = '3001';
    spawnEnv.NODE_ENV = 'development';

    // For OpenCode, set permission to allow all to skip interactive prompts
    if (provider === 'opencode') {
        spawnEnv.OPENCODE_PERMISSION = '"allow"';
    }

    const agentProcess = spawn(execPath, args, {
        cwd: projectPath,
        env: spawnEnv as NodeJS.ProcessEnv,
        shell: isWindows,
        detached: !isWindows, // Detach on Unix to prevent parent termination
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Unref so the parent process can exit independently (but we still capture output)
    if (!isWindows) {
        agentProcess.unref();
    }

    if (useStdin) {
        // Write prompt to stdin
        agentProcess.stdin?.write(prompt);
        agentProcess.stdin?.end();
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
    let claudeResultReceived = false; // Track if we received a result from Claude
    let claudeResultIsError = false; // Track is_error field from Claude result

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
    };

    const handleClaudeStreamLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed?.type === 'stream_event' &&
                parsed.event?.type === 'content_block_delta' &&
                parsed.event?.delta?.type === 'text_delta') {
                streamedTextBuffer += parsed.event.delta.text;
                hasStreamedText = true;
                flushStreamedText();
                return;
            }

            if (parsed?.type === 'result') {
                claudeResultReceived = true; // Claude finished and sent result
                claudeResultIsError = parsed.is_error === true; // Track if Claude reported an error
                if (typeof parsed.result === 'string' && !hasStreamedText) {
                    streamedTextBuffer += parsed.result;
                    hasStreamedText = true;
                    flushStreamedText(true);
                }
            }
        } catch {
            streamedTextBuffer += `${line}\n`;
            flushStreamedText();
        }
    };

    // Capture stdout
    agentProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        if (isClaudeStream) {
            stdoutBuffer += text;
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                handleClaudeStreamLine(line);
            }
            flushStreamedText();
            return;
        }

        job.output += text;
        // Output is stored in job.output and polled by the client
    });

    // Capture stderr
    agentProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        const errorText = `[stderr] ${text}\n`;
        job.output += errorText;
        // Output is stored in job.output and polled by the client
    });

    agentProcess.on('close', (code: number | null) => {
        if (isClaudeStream) {
            if (stdoutBuffer.trim()) {
                handleClaudeStreamLine(stdoutBuffer);
                stdoutBuffer = '';
            }
            flushStreamedText(true);
        }

        // Log exit code for debugging
        console.log(`[agent-jobs] Process exited with code: ${code}, provider: ${provider}, claudeResultReceived: ${isClaudeStream ? claudeResultReceived : 'N/A'}, claudeResultIsError: ${isClaudeStream ? claudeResultIsError : 'N/A'}`);

        // Extract commit hash from output
        const commitMatch = job.output.match(/commit\s+([a-f0-9]{7,40})/i);
        const commitHash = commitMatch ? commitMatch[1] : undefined;

        // Determine success with multiple criteria:
        // 1. Exit code 0 (normal success)
        // 2. Has a commit hash (work was committed)
        // 3. Output contains success indicators
        // 4. For Claude: received a result message with is_error: false
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

        // For Claude with stream-json, success if:
        // - We received a result message with is_error: false (most reliable)
        // - OR exit code 0
        // - OR we have success indicators and no clear failure indicators
        const claudeSuccess = isClaudeStream && (
            (claudeResultReceived && !claudeResultIsError) ||
            hasStreamedText && hasSuccessIndicators && !hasFailureIndicators
        );

        const success = code === 0 ||
            commitHash !== undefined ||
            claudeSuccess ||
            (code === null && hasSuccessIndicators && !hasFailureIndicators) ||
            (hasSuccessIndicators && !hasFailureIndicators && job.output.length > 500);

        job.status = success ? 'completed' : 'failed';

        console.log(`[agent-jobs] Task marked as: ${job.status} (code: ${code}, commitHash: ${commitHash}, successIndicators: ${hasSuccessIndicators}, failureIndicators: ${hasFailureIndicators}, claudeSuccess: ${claudeSuccess}, claudeResultIsError: ${claudeResultIsError})`);

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

    agentProcess.on('error', (error: Error) => {
        job.status = 'failed';
        job.output += `\n[error] ${error.message}`;

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

    runningJobs.delete(jobId);
    return true;
}
