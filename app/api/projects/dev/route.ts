import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

// Store running dev servers (in-memory, per process)
const runningServers: Map<string, { process: ChildProcess; port?: number }> = new Map();

// Detect OS
const isWin = process.platform === 'win32';

// Find available port starting from 3001
async function findAvailablePort(startPort: number = 3001): Promise<number> {
    const net = await import('net');
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            server.close(() => resolve(startPort));
        });
        server.on('error', () => {
            resolve(findAvailablePort(startPort + 1));
        });
    });
}

// POST: Manage dev server (create, start, stop, status)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { projectPath, action } = body;

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        // Expand ~ to home directory (Works on both Mac and Windows)
        const homeDir = os.homedir();
        const expandedPath = projectPath.startsWith('~')
            ? path.join(homeDir, projectPath.slice(1))
            : projectPath;

        if (action === 'start') {
            // Check if already running
            if (runningServers.has(expandedPath)) {
                const existing = runningServers.get(expandedPath);
                return NextResponse.json({
                    success: true,
                    message: 'Dev server already running',
                    port: existing?.port,
                    alreadyRunning: true,
                });
            }

            // Find available port
            const port = await findAvailablePort();

            // Determine command based on OS (npm for Unix, npm.cmd for Windows)
            const cmd = isWin ? 'npm.cmd' : 'npm';

            // Log environment info for debugging
            console.log('=== Dev Server Start Debug Info ===');
            console.log('Node Path (process.execPath):', process.execPath);
            console.log('Node Version:', process.version);
            console.log('PATH env:', process.env.PATH);
            console.log('Project Path:', expandedPath);
            console.log('Command:', cmd, ['run', 'dev', '--', '-p', String(port)].join(' '));
            console.log('===================================');

            // Start the dev server
            // On macOS/Linux, we use detached: true to create a new process group for clean killing.
            const devProcess = spawn(cmd, ['run', 'dev', '--', '-p', String(port)], {
                cwd: expandedPath,
                env: { ...process.env, BROWSER: 'none' },
                detached: !isWin, // Only detach on Unix to enable group killing (-pid)
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let output = '';

            devProcess.stdout?.on('data', (data) => {
                output += data.toString();
                console.log(`[${path.basename(expandedPath)}] ${data.toString()}`);
            });

            devProcess.stderr?.on('data', (data) => {
                output += data.toString();
                console.error(`[${path.basename(expandedPath)}] ${data.toString()}`);
            });

            devProcess.on('error', (err) => {
                console.error(`Failed to start dev server: ${err.message}`);
                runningServers.delete(expandedPath);
            });

            devProcess.on('close', (code) => {
                console.log(`Dev server for ${path.basename(expandedPath)} exited with code ${code}`);
                runningServers.delete(expandedPath);
            });

            // Store the running server
            runningServers.set(expandedPath, { process: devProcess, port });

            // Unref so it doesn't block the parent process
            devProcess.unref();

            // Wait a bit to ensure server initialization
            await new Promise((resolve) => setTimeout(resolve, 2000));

            return NextResponse.json({
                success: true,
                message: 'Dev server started',
                port,
                pid: devProcess.pid,
            });
        } else if (action === 'stop') {
            const server = runningServers.get(expandedPath);
            if (server && server.process.pid) {
                try {
                    if (isWin) {
                        // Windows: Use taskkill to kill the process tree forcefully
                        spawn('taskkill', ['/pid', server.process.pid.toString(), '/f', '/t']);
                    } else {
                        // macOS/Linux: Kill the process group (negative PID)
                        process.kill(-server.process.pid, 'SIGTERM');
                    }
                } catch (e) {
                    console.error('Error stopping process:', e);
                }
                runningServers.delete(expandedPath);
                return NextResponse.json({ success: true, message: 'Dev server stopped' });
            }
            return NextResponse.json({ success: true, message: 'No server running' });
        } else if (action === 'status') {
            const server = runningServers.get(expandedPath);
            if (server) {
                return NextResponse.json({
                    running: true,
                    port: server.port,
                    pid: server.process.pid,
                });
            }
            return NextResponse.json({ running: false });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Dev server API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to manage dev server' },
            { status: 500 }
        );
    }
}

// GET: List all running dev servers
export async function GET() {
    const servers: { path: string; port?: number; pid?: number }[] = [];
    runningServers.forEach((value, key) => {
        servers.push({
            path: key,
            port: value.port,
            pid: value.process.pid,
        });
    });
    return NextResponse.json({ servers });
}
