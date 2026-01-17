import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function runCreateNextApp(targetPath: string): Promise<void> {
    const isWin = process.platform === 'win32';
    const cmd = 'npx';
    const args = [
        'create-next-app@latest',
        targetPath,
        '--yes',
        '--use-npm',
    ];

    await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
            cwd: os.homedir(),
            shell: isWin,
            windowsHide: true,
        });

        let output = '';

        child.stdout?.on('data', (data) => {
            output += data.toString();
        });

        child.stderr?.on('data', (data) => {
            output += data.toString();
        });

        child.on('error', (err) => {
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(output.trim() || `create-next-app failed with code ${code}`));
            }
        });
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const trimmedName = typeof body.projectName === 'string' ? body.projectName.trim() : '';

        if (!trimmedName) {
            return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        }
        if (path.basename(trimmedName) !== trimmedName) {
            return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
        }

        const basePath = path.join(os.homedir(), 'Projects');
        const targetPath = path.join(basePath, trimmedName);

        if (fs.existsSync(targetPath)) {
            return NextResponse.json({ error: 'Project already exists at this location' }, { status: 400 });
        }

        fs.mkdirSync(basePath, { recursive: true });

        await runCreateNextApp(targetPath);

        return NextResponse.json({
            success: true,
            project: {
                name: trimmedName,
                path: targetPath,
                description: 'Next.js project',
            },
            path: targetPath,
        }, { status: 201 });
    } catch (error) {
        console.error('Create project API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create project' },
            { status: 500 }
        );
    }
}
