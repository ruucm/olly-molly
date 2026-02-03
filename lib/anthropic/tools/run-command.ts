/**
 * run_command tool implementation
 */

import { spawn } from 'child_process';
import type { RunCommandInput, ToolResult, ToolContext } from '../types';
import { validateCommand, sanitizeOutput } from '../security';
import { getToolTimeout } from '../client';

const MAX_OUTPUT_LENGTH = 50000;

export async function runCommand(
    input: RunCommandInput,
    context: ToolContext
): Promise<ToolResult> {
    const { command, timeout: inputTimeout } = input;
    const { projectPath, abortSignal } = context;
    const timeout = inputTimeout ?? context.timeout ?? getToolTimeout();

    // Validate command
    const validation = validateCommand(command);
    if (!validation.valid) {
        return {
            success: false,
            output: '',
            error: validation.error,
        };
    }

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let killed = false;
        let timeoutId: NodeJS.Timeout | null = null;

        // Spawn process with shell
        const proc = spawn(command, [], {
            cwd: projectPath,
            shell: true,
            env: {
                ...process.env,
                // Clean environment for subprocess
                NODE_ENV: 'development',
                FORCE_COLOR: '0',
            },
        });

        // Handle abort signal
        const abortHandler = () => {
            if (!killed) {
                killed = true;
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (!proc.killed) {
                        proc.kill('SIGKILL');
                    }
                }, 1000);
            }
        };

        if (abortSignal) {
            abortSignal.addEventListener('abort', abortHandler);
        }

        // Set timeout
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                if (!killed) {
                    killed = true;
                    proc.kill('SIGTERM');
                    setTimeout(() => {
                        if (!proc.killed) {
                            proc.kill('SIGKILL');
                        }
                    }, 1000);
                }
            }, timeout);
        }

        // Collect stdout
        proc.stdout?.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            if (stdout.length < MAX_OUTPUT_LENGTH) {
                stdout += text;
            }
        });

        // Collect stderr
        proc.stderr?.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            if (stderr.length < MAX_OUTPUT_LENGTH) {
                stderr += text;
            }
        });

        // Handle completion
        proc.on('close', (code) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (abortSignal) {
                abortSignal.removeEventListener('abort', abortHandler);
            }

            // Truncate if needed
            if (stdout.length >= MAX_OUTPUT_LENGTH) {
                stdout = stdout.substring(0, MAX_OUTPUT_LENGTH) + '\n...[output truncated]';
            }
            if (stderr.length >= MAX_OUTPUT_LENGTH) {
                stderr = stderr.substring(0, MAX_OUTPUT_LENGTH) + '\n...[output truncated]';
            }

            // Sanitize output
            stdout = sanitizeOutput(stdout);
            stderr = sanitizeOutput(stderr);

            // Build combined output
            let output = '';
            if (stdout) {
                output += stdout;
            }
            if (stderr) {
                output += (output ? '\n' : '') + `[stderr]\n${stderr}`;
            }

            // Check for abort
            if (abortSignal?.aborted) {
                resolve({
                    success: false,
                    output: output || '',
                    error: 'Command aborted',
                });
                return;
            }

            // Check for timeout kill
            if (killed && code !== 0) {
                resolve({
                    success: false,
                    output: output || '',
                    error: `Command timed out after ${timeout}ms`,
                });
                return;
            }

            // Success based on exit code
            const success = code === 0;
            const warning = validation.warning;

            resolve({
                success,
                output: output || (success ? 'Command completed successfully' : 'Command failed with no output'),
                error: success ? undefined : `Exit code: ${code}${warning ? ` (${warning})` : ''}`,
            });
        });

        // Handle spawn error
        proc.on('error', (error) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (abortSignal) {
                abortSignal.removeEventListener('abort', abortHandler);
            }

            resolve({
                success: false,
                output: '',
                error: `Failed to execute command: ${error.message}`,
            });
        });
    });
}
