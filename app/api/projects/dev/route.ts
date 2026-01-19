import { NextResponse } from 'next/server';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Store running dev servers (in-memory, per process)
const runningServers: Map<string, { process: ChildProcess; port?: number }> = new Map();

// Detect OS
const isWin = process.platform === 'win32';

// Kill all node processes running in a specific project directory
function killExistingNodeProcesses(projectPath: string): void {
    try {
        if (isWin) {
            // Windows: Use WMIC to find and kill node processes with the project path
            execSync(`wmic process where "name='node.exe' and commandline like '%${projectPath.replace(/\\/g, '\\\\')}%'" call terminate`, {
                stdio: 'ignore',
            });
        } else {
            // macOS/Linux: Find and kill node processes running from the project directory
            // Using pgrep + pkill with full command line matching
            try {
                // Kill node processes with the project path in their command
                execSync(`pkill -f "node.*${projectPath}"`, { stdio: 'ignore' });
            } catch {
                // pkill returns non-zero if no processes found, which is fine
            }

            // Also try to kill any npm processes for this project
            try {
                execSync(`pkill -f "npm.*${projectPath}"`, { stdio: 'ignore' });
            } catch {
                // pkill returns non-zero if no processes found, which is fine
            }

            // Give processes time to clean up
            execSync('sleep 0.5', { stdio: 'ignore' });
        }
        console.log(`Killed existing node processes for: ${projectPath}`);
    } catch (e) {
        console.log('No existing node processes found or error killing:', e);
    }
}

// Determine which npm script to use (dev or start)
function getRunScript(projectPath: string): { script: string; args: string[] } {
    try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const scripts = packageJson.scripts || {};

            if (scripts.dev) {
                return { script: 'dev', args: ['run', 'dev'] };
            } else if (scripts.start) {
                return { script: 'start', args: ['run', 'start'] };
            }
        }
    } catch (e) {
        console.error('Error reading package.json:', e);
    }
    // Default to dev
    return { script: 'dev', args: ['run', 'dev'] };
}

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
            // Kill any existing node processes in this project directory first
            killExistingNodeProcesses(expandedPath);

            // Also clean up our tracked server if it exists
            const existingServer = runningServers.get(expandedPath);
            if (existingServer && existingServer.process.pid) {
                try {
                    if (isWin) {
                        spawn('taskkill', ['/pid', existingServer.process.pid.toString(), '/f', '/t']);
                    } else {
                        process.kill(-existingServer.process.pid, 'SIGTERM');
                    }
                } catch {
                    // Process may already be dead
                }
                runningServers.delete(expandedPath);
            }

            // Find available port
            const port = await findAvailablePort();

            // Determine command based on OS (npm for Unix, npm.cmd for Windows)
            const cmd = isWin ? 'npm.cmd' : 'npm';

            // Determine which script to run (dev or start)
            const { script, args } = getRunScript(expandedPath);
            const fullArgs = [...args, '--', '-p', String(port)];

            // Log environment info for debugging
            console.log('=== Dev Server Start Debug Info ===');
            console.log('Node Path (process.execPath):', process.execPath);
            console.log('Node Version:', process.version);
            console.log('PATH env:', process.env.PATH);
            console.log('Project Path:', expandedPath);
            console.log('Script:', script);
            console.log('Command:', cmd, fullArgs.join(' '));
            console.log('===================================');

            // Create clean environment, filtering out Electron/app-specific vars that can interfere with Next.js
            const cleanEnv: Record<string, string> = {};
            const excludePatterns = [
                'ELECTRON', 'CHROME', 'NODE_OPTIONS',
                '__NEXT', 'NEXT_', '__CFBundle',
                'ORIGINAL_XDG', 'GIO_', 'DBUS_',
                'TURBOPACK',
            ];

            for (const [key, value] of Object.entries(process.env)) {
                if (value && !excludePatterns.some(pattern => key.toUpperCase().includes(pattern))) {
                    cleanEnv[key] = value;
                }
            }

            // Explicitly set required vars
            cleanEnv['NODE_ENV'] = 'development';
            cleanEnv['BROWSER'] = 'none';
            cleanEnv['HOME'] = homeDir;
            cleanEnv['PATH'] = process.env.PATH || '';

            // Start the dev server
            // On macOS/Linux: use detached: true for process group killing
            // On Windows: use shell: true for .cmd files
            const devProcess = spawn(cmd, fullArgs, {
                cwd: expandedPath,
                env: cleanEnv as NodeJS.ProcessEnv,
                shell: isWin, // Windows needs shell: true for .cmd files
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
