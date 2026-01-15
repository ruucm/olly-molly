import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
};

function normalizeRelativePath(relativePath?: string | null): string {
    if (!relativePath) return '';
    return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
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

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectPath = searchParams.get('projectPath');
        const relativePath = searchParams.get('path');

        if (!relativePath) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        let targetPath: string;
        try {
            targetPath = resolveProjectPath(projectPath, relativePath);
        } catch {
            return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }

        if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const extension = path.extname(targetPath).slice(1).toLowerCase();
        const contentType = MIME_TYPES[extension] || 'application/octet-stream';
        const buffer = fs.readFileSync(targetPath);

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error serving file:', error);
        return NextResponse.json({ error: 'Failed to load file' }, { status: 500 });
    }
}
