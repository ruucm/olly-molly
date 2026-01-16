import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT_RELATIVE_PATH = '.';

// Cache external dev server detection results (status polling calls this frequently)
const EXTERNAL_DETECT_CACHE_TTL_MS = 15_000;
const externalDetectCache = new Map<string, { ts: number; result: { running: boolean; port?: number; pid?: number } }>();

// Cache per-PID command line lookups to avoid repeated slow WMIC calls
const PID_INFO_CACHE_TTL_MS = 30_000;
const pidCmdlineCache = new Map<number, { ts: number; cmdlineLower: string }>();

function isLikelyDevPort(port: number): boolean {
    return (
        (port >= 3000 && port < 4000) ||
        (port >= 4000 && port < 5000) ||
        (port >= 5000 && port < 6000) ||
        (port >= 8000 && port < 9000) ||
        port === 5173 ||
        port === 8080 ||
        port === 1234
    );
}

function normalizeRelativePath(relativePath?: string | null): string {
    if (!relativePath) return ROOT_RELATIVE_PATH;
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    return normalized || ROOT_RELATIVE_PATH;
}

function getServerKey(projectId: string, relativePath?: string | null): string {
    return `${projectId}:${normalizeRelativePath(relativePath)}`;
}

function resolveProjectPath(projectRoot: string, relativePath?: string | null): string {
    const root = path.resolve(projectRoot);
    const normalized = normalizeRelativePath(relativePath);
    const resolved = path.resolve(root, normalized);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Invalid path');
    }
    return resolved;
}

// Track running dev servers: projectId+path -> process info
const runningDevServers = new Map<string, {
    process: ChildProcess;
    port: number;
    output: string;
    projectId: string;
    relativePath: string;
}>();

function killProcessTree(pid: number): void {
    if (!pid || pid <= 0) return;
    const isWindows = process.platform === 'win32';
    if (isWindows) {
        // Force-kill the process tree (prevents orphaned node processes / stale Next dev locks)
        execSync(`taskkill /PID ${pid} /T /F`, {
            encoding: 'utf-8',
            timeout: 5000,
            shell: 'cmd.exe',
            stdio: 'ignore',
        });
        return;
    }

    try {
        // Try to kill the process group first
        process.kill(-pid, 'SIGTERM');
    } catch {
        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            // ignore
        }
    }
}

function cleanNextDevLock(projectDir: string): void {
    try {
        const lockPath = path.join(projectDir, '.next', 'dev', 'lock');
        if (fs.existsSync(lockPath)) {
            fs.rmSync(lockPath, { recursive: true, force: true });
        }
    } catch {
        // best-effort cleanup only
    }
}

/**
 * Detect externally running dev server for a project (Windows)
 * Uses wmic/tasklist to find node processes and netstat to check ports
 */
function detectExternalDevServerWindows(targetPath: string): { running: boolean; port?: number; pid?: number } {
    try {
        // Normalize the target path for Windows comparison
        const normalizedTarget = targetPath.replace(/\//g, '\\').toLowerCase();

        // Step 1: Find listening ports using netstat
        // netstat -ano outputs lines like:
        // TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
        let netstatResult: string;
        try {
            // NOTE: netstat output does not include process name; filtering for "node" is unreliable.
            // Keep this single call fast - this endpoint is polled from the UI.
            netstatResult = execSync('netstat -ano | findstr LISTENING', {
                encoding: 'utf-8',
                timeout: 3000,
                shell: 'cmd.exe',
                maxBuffer: 2 * 1024 * 1024,
            });
        } catch {
            return { running: false };
        }

        if (!netstatResult.trim()) return { running: false };

        // Collect PIDs and their listening ports from netstat
        const pidPortMap = new Map<number, number[]>();
        const lines = netstatResult.trim().split('\n');
        for (const line of lines) {
            // Parse: TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
            const match = line.match(/TCP\s+[\d.:]+:(\d+)\s+.*LISTENING\s+(\d+)/i);
            if (match) {
                const port = parseInt(match[1], 10);
                const pid = parseInt(match[2], 10);
                // Only keep ports that are plausibly dev servers to avoid scanning every PID on the machine
                if (!isNaN(port) && !isNaN(pid) && pid > 0 && isLikelyDevPort(port)) {
                    if (!pidPortMap.has(pid)) {
                        pidPortMap.set(pid, []);
                    }
                    pidPortMap.get(pid)!.push(port);
                }
            }
        }

        if (pidPortMap.size === 0) return { running: false };

        // Step 2: Check candidate PIDs to see if they match our target directory
        // WMIC is slow on Windows; keep the scan bounded and cached.
        const now = Date.now();
        const candidates = Array.from(pidPortMap.entries()).slice(0, 25);
        for (const [pid, ports] of candidates) {
            try {
                let cmdLower: string | null = null;
                const cached = pidCmdlineCache.get(pid);
                if (cached && now - cached.ts < PID_INFO_CACHE_TTL_MS) {
                    cmdLower = cached.cmdlineLower;
                } else {
                    const wmicResult = execSync(
                        `wmic process where "ProcessId=${pid}" get CommandLine /format:list`,
                        {
                            encoding: 'utf-8',
                            timeout: 800,
                            shell: 'cmd.exe',
                            maxBuffer: 512 * 1024,
                        }
                    );
                    cmdLower = wmicResult.toLowerCase();
                    pidCmdlineCache.set(pid, { ts: now, cmdlineLower: cmdLower });
                }

                if (!cmdLower) continue;

                // Must contain the target path to be considered "our" dev server
                if (cmdLower.includes(normalizedTarget)) {
                    // Found a node process in our target directory
                    // Return the first common dev server port (3000-3999, 4000-4999, 5000-5999, 8000-8999)
                    const devPort = ports.find(p =>
                        (p >= 3000 && p < 4000) ||
                        (p >= 4000 && p < 5000) ||
                        (p >= 5000 && p < 6000) ||
                        (p >= 8000 && p < 9000)
                    ) || ports[0];

                    return { running: true, port: devPort, pid };
                }

            } catch {
                // This PID check failed, try next
                continue;
            }
        }

        return { running: false };
    } catch (error) {
        console.error('Error detecting external dev server (Windows):', error);
        return { running: false };
    }
}

/**
 * Detect externally running dev server for a project (macOS/Linux)
 * Uses lsof to find node processes with cwd matching the project path
 * and then checks which port they are listening on
 */
function detectExternalDevServerUnix(targetPath: string): { running: boolean; port?: number; pid?: number } {
    try {
        // Step 1: Find node processes with cwd matching target path
        // lsof -c node -a -d cwd outputs lines like:
        // node    95847 user  cwd    DIR   1,13  544 96780203 /path/to/project
        let cwdResult: string;
        try {
            cwdResult = execSync('lsof -c node -a -d cwd 2>/dev/null', {
                encoding: 'utf-8',
                timeout: 5000,
            });
        } catch {
            return { running: false };
        }

        if (!cwdResult.trim()) return { running: false };

        const lines = cwdResult.trim().split('\n');
        const pids = new Set<number>();
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const pid = parseInt(parts[1], 10);
                if (isNaN(pid)) continue;
                const cwdMatch = line.match(/\s(\/.*)$/);
                const cwdPath = cwdMatch ? cwdMatch[1] : parts[parts.length - 1];
                if (cwdPath === targetPath) {
                    pids.add(pid);
                }
            }
        }

        if (pids.size === 0) {
            return { running: false };
        }

        // Step 2: Find which port these processes are listening on
        for (const pid of pids) {
            try {
                const listenResult = execSync(`lsof -i -P -n -a -p ${pid} 2>/dev/null | grep LISTEN`, {
                    encoding: 'utf-8',
                    timeout: 5000,
                });

                // Parse port from output like:
                // node    95847 user   13u  IPv6 ... TCP *:3001 (LISTEN)
                const portMatch = listenResult.match(/:(\d+)\s+\(LISTEN\)/);
                if (portMatch) {
                    const port = parseInt(portMatch[1], 10);
                    if (!isNaN(port)) {
                        return { running: true, port, pid };
                    }
                }
            } catch {
                // This PID is not listening on any port, try next
                continue;
            }
        }

        // Processes found but no listening port detected
        return { running: true, pid: Array.from(pids)[0] };
    } catch (error) {
        console.error('Error detecting external dev server:', error);
        return { running: false };
    }
}

/**
 * Detect externally running dev server for a project
 * Cross-platform: uses different methods for Windows vs Unix-like systems
 */
function detectExternalDevServer(targetPath: string): { running: boolean; port?: number; pid?: number } {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
        return detectExternalDevServerWindows(targetPath);
    } else {
        return detectExternalDevServerUnix(targetPath);
    }
}

// Find available port
async function findAvailablePort(startPort: number = 3000): Promise<number> {
    const net = await import('net');
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = (server.address() as { port: number }).port;
            server.close(() => resolve(port));
        });
        server.on('error', () => {
            resolve(findAvailablePort(startPort + 1));
        });
    });
}

// Create new Next.js project
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, projectId, projectName, parentPath, projectPath, path: relativePath, killExternal, cleanNextLock } = body;

        if (action === 'create') {
            // Create new Next.js project
            if (!projectName) {
                return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
            }

            // Use home directory + Projects folder as default
            const basePath = parentPath || path.join(os.homedir(), 'Projects');

            // Ensure base path exists
            if (!fs.existsSync(basePath)) {
                fs.mkdirSync(basePath, { recursive: true });
            }

            const projectPath = path.join(basePath, projectName);

            // Check if project already exists
            if (fs.existsSync(projectPath)) {
                return NextResponse.json({ error: 'Project already exists at this location' }, { status: 400 });
            }

            // Run npx create-next-app with default settings (non-interactive)
            return new Promise<NextResponse>((resolve) => {
                // Use -- to separate npx args from create-next-app args
                const fullCommand = `npx -y create-next-app@latest "${projectPath}" --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`;

                const npxProcess = spawn(fullCommand, [], {
                    cwd: basePath,
                    shell: true,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                // Answer any prompts with enter (use defaults)
                npxProcess.stdin?.write('\n\n\n\n\n');
                npxProcess.stdin?.end();

                let output = '';
                let errorOutput = '';

                npxProcess.stdout?.on('data', (data) => {
                    output += data.toString();
                });

                npxProcess.stderr?.on('data', (data) => {
                    errorOutput += data.toString();
                });

                npxProcess.on('close', async (code) => {
                    if (code === 0) {
                        // Register the project
                        resolve(NextResponse.json({
                            success: true,
                            project: {
                                name: projectName,
                                path: projectPath,
                                description: 'Next.js project',
                            },
                            output,
                        }));
                    } else {
                        resolve(NextResponse.json({
                            error: 'Failed to create project',
                            output: errorOutput || output,
                        }, { status: 500 }));
                    }
                });

                npxProcess.on('error', (err) => {
                    resolve(NextResponse.json({
                        error: 'Failed to start create-next-app',
                        details: err.message,
                    }, { status: 500 }));
                });
            });

        } else if (action === 'start') {
            // Start dev server
            if (!projectId) {
                return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
            }
            if (!projectPath) {
                return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
            }

            const normalizedPath = normalizeRelativePath(relativePath);
            const serverKey = getServerKey(projectId, normalizedPath);

            // Check if already running
            if (runningDevServers.has(serverKey)) {
                const server = runningDevServers.get(serverKey)!;
                return NextResponse.json({
                    success: true,
                    running: true,
                    port: server.port,
                    url: `http://localhost:${server.port}`,
                });
            }

            let workingDir: string;
            try {
                workingDir = resolveProjectPath(projectPath, normalizedPath);
            } catch {
                return NextResponse.json({ error: 'Invalid project path' }, { status: 400 });
            }

            if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
                return NextResponse.json({ error: 'Target path is not a directory' }, { status: 400 });
            }

            const packageJsonPath = path.join(workingDir, 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                return NextResponse.json({ error: 'package.json not found in target path' }, { status: 400 });
            }
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (!packageJson?.scripts?.dev) {
                    return NextResponse.json({ error: 'No dev script found in package.json' }, { status: 400 });
                }
            } catch {
                return NextResponse.json({ error: 'Failed to read package.json' }, { status: 400 });
            }

            const port = await findAvailablePort(3001);

            // Start npm run dev via the user's shell so PATH/NVM matches terminal runs.
            // Use interactive login shells where possible to load nvm/asdf configs
            // (many setups only initialize in .zshrc/.bashrc).
            const userShell = process.env.SHELL || '/bin/zsh';
            const shellName = path.basename(userShell);
            const shellArgs = (() => {
                if (process.platform === 'win32') return ['/c'];
                if (shellName === 'zsh' || shellName === 'bash') return ['-lic'];
                return ['-lc'];
            })();
            const npmCommand = process.platform === 'win32'
                ? { cmd: 'cmd.exe', args: [...shellArgs, `npm run dev -- --port ${port}`] }
                : { cmd: userShell, args: [...shellArgs, `npm run dev -- --port ${port}`] };

            const devProcess = spawn(npmCommand.cmd, npmCommand.args, {
                cwd: workingDir,
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                env: {
                    ...process.env,
                    NODE_ENV: 'development',
                    // Ensure FORCE_COLOR is set for better DX if it wasn't already
                    FORCE_COLOR: '1',
                },
            });

            const serverInfo = {
                process: devProcess,
                port,
                output: '',
                projectId,
                relativePath: normalizedPath,
            };

            runningDevServers.set(serverKey, serverInfo);

            devProcess.stdout?.on('data', (data) => {
                serverInfo.output += data.toString();
            });

            devProcess.stderr?.on('data', (data) => {
                serverInfo.output += data.toString();
            });

            devProcess.on('close', () => {
                runningDevServers.delete(serverKey);
            });

            devProcess.on('error', () => {
                runningDevServers.delete(serverKey);
            });

            // If the process exits immediately, return the captured output so the UI can show the reason.
            const earlyExit = await new Promise<{ code: number | null } | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), 1500);
                devProcess.once('close', (code) => {
                    clearTimeout(timer);
                    resolve({ code });
                });
                devProcess.once('error', () => {
                    clearTimeout(timer);
                    resolve({ code: null });
                });
            });

            if (earlyExit) {
                const output = serverInfo.output.slice(-4000);
                return NextResponse.json(
                    {
                        success: false,
                        running: false,
                        error: `Dev server exited immediately (code: ${earlyExit.code ?? 'unknown'})`,
                        output,
                    },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                running: true,
                port,
                url: `http://localhost:${port}`,
            });

        } else if (action === 'stop') {
            // Stop dev server
            if (!projectId) {
                return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
            }
            if (!projectPath) {
                return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
            }

            const normalizedPath = normalizeRelativePath(relativePath);
            const serverKey = getServerKey(projectId, normalizedPath);
            const server = runningDevServers.get(serverKey);
            if (server) {
                if (server.process.pid) {
                    try {
                        killProcessTree(server.process.pid);
                    } catch {
                        // ignore
                    }
                }
                runningDevServers.delete(serverKey);
                if (cleanNextLock) {
                    try {
                        const workingDir = resolveProjectPath(projectPath, normalizedPath);
                        cleanNextDevLock(workingDir);
                    } catch {
                        // ignore
                    }
                }
                return NextResponse.json({ success: true, running: false });
            }

            // Optionally skip killing externally started servers
            if (killExternal === false) {
                return NextResponse.json({ success: true, running: false });
            }

            // Check for externally running server and kill it
            let targetPath: string;
            try {
                targetPath = resolveProjectPath(projectPath, normalizedPath);
            } catch {
                return NextResponse.json({ error: 'Invalid project path' }, { status: 400 });
            }
            // For stop we should NOT use the cache (avoid killing a stale PID)
            const externalServer = detectExternalDevServer(targetPath);
            if (externalServer.running && externalServer.pid) {
                try {
                    // Kill the external process
                    killProcessTree(externalServer.pid);
                    if (cleanNextLock) {
                        cleanNextDevLock(targetPath);
                    }
                    return NextResponse.json({ success: true, running: false });
                } catch (error) {
                    console.error('Failed to kill external dev server:', error);
                    return NextResponse.json({ error: 'Failed to stop external server' }, { status: 500 });
                }
            }

            return NextResponse.json({ success: true, running: false });

        } else if (action === 'status') {
            // Check if dev server is running
            if (!projectId) {
                return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
            }

            const normalizedPath = normalizeRelativePath(relativePath);
            const serverKey = getServerKey(projectId, normalizedPath);
            const server = runningDevServers.get(serverKey);
            if (server) {
                return NextResponse.json({
                    running: true,
                    port: server.port,
                    url: `http://localhost:${server.port}`,
                    output: server.output.slice(-2000), // Last 2000 chars
                });
            }

            return NextResponse.json({ running: false });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Dev server error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const projectPath = searchParams.get('projectPath');
    const relativePath = searchParams.get('path');
    const skipExternal = searchParams.get('external') === '0';

    if (!projectId) {
        // Return all running servers
        const servers: { projectId: string; path: string; port: number; url: string }[] = [];
        runningDevServers.forEach((info, id) => {
            servers.push({
                projectId: info.projectId,
                path: info.relativePath === ROOT_RELATIVE_PATH ? '' : info.relativePath,
                port: info.port,
                url: `http://localhost:${info.port}`,
            });
        });
        return NextResponse.json({ servers });
    }

    const normalizedPath = normalizeRelativePath(relativePath);
    const serverKey = getServerKey(projectId, normalizedPath);
    const server = runningDevServers.get(serverKey);
    if (server) {
        return NextResponse.json({
            running: true,
            port: server.port,
            url: `http://localhost:${server.port}`,
            external: false,
        });
    }

    // Check for externally running dev server
    if (projectPath && !skipExternal) {
        let targetPath: string;
        try {
            targetPath = resolveProjectPath(projectPath, normalizedPath);
        } catch {
            return NextResponse.json({ running: false });
        }

        const cacheKey = `${process.platform}:${targetPath}`;
        const now = Date.now();
        const cached = externalDetectCache.get(cacheKey);
        if (cached && now - cached.ts < EXTERNAL_DETECT_CACHE_TTL_MS) {
            const r = cached.result;
            if (r.running && r.port) {
                return NextResponse.json({
                    running: true,
                    port: r.port,
                    url: `http://localhost:${r.port}`,
                    external: true,
                    pid: r.pid,
                });
            }
            return NextResponse.json({ running: false });
        }

        const externalServer = detectExternalDevServer(targetPath);
        externalDetectCache.set(cacheKey, { ts: now, result: externalServer });
        if (externalServer.running && externalServer.port) {
            return NextResponse.json({
                running: true,
                port: externalServer.port,
                url: `http://localhost:${externalServer.port}`,
                external: true,
                pid: externalServer.pid,
            });
        }
    }

    return NextResponse.json({ running: false });
}
