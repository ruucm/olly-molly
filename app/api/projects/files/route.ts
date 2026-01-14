import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { projectService } from '@/lib/db';

const SKIP_DIRECTORIES = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'out',
    '.turbo',
    '.cache',
]);

const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

const BINARY_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
    'pdf', 'zip', 'gz', 'tar', 'tgz', '7z', 'rar',
    'mp4', 'mov', 'webm', 'mp3', 'wav', 'ogg',
]);

const MAX_TEXT_SIZE = 512 * 1024; // 512 KB

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

function toRelativePath(projectRoot: string, fullPath: string): string {
    const relative = path.relative(projectRoot, fullPath);
    return relative.split(path.sep).join('/');
}

function isBinaryExtension(extension: string): boolean {
    return BINARY_EXTENSIONS.has(extension);
}

function looksBinary(buffer: Buffer): boolean {
    for (const byte of buffer) {
        if (byte === 0) return true;
    }
    return false;
}

function readFilePreview(filePath: string, size: number): { buffer: Buffer; truncated: boolean } {
    const readSize = Math.min(size, MAX_TEXT_SIZE);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    try {
        fs.readSync(fd, buffer, 0, readSize, 0);
    } finally {
        fs.closeSync(fd);
    }
    return { buffer, truncated: size > MAX_TEXT_SIZE };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const relativePath = searchParams.get('path');

        const project = projectId ? projectService.getById(projectId) : projectService.getActive();
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        let targetPath: string;
        try {
            targetPath = resolveProjectPath(project.path, relativePath);
        } catch {
            return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }

        if (!fs.existsSync(targetPath)) {
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
        }

        const stats = fs.statSync(targetPath);
        const normalizedPath = normalizeRelativePath(relativePath);

        if (stats.isDirectory()) {
            const entries = fs.readdirSync(targetPath, { withFileTypes: true });
            const items = entries
                .filter(entry => {
                    if (entry.isDirectory()) {
                        return !SKIP_DIRECTORIES.has(entry.name);
                    }
                    if (entry.isFile()) {
                        return !SKIP_FILES.has(entry.name);
                    }
                    return false;
                })
                .map(entry => {
                    const entryPath = path.join(targetPath, entry.name);
                    const entryStats = fs.statSync(entryPath);
                    const relativeEntryPath = toRelativePath(project.path, entryPath);
                    return {
                        name: entry.name,
                        path: relativeEntryPath,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: entryStats.size,
                        modifiedAt: entryStats.mtime.toISOString(),
                        extension: entry.isDirectory() ? undefined : path.extname(entry.name).slice(1).toLowerCase(),
                    };
                })
                .sort((a, b) => {
                    if (a.type !== b.type) {
                        return a.type === 'directory' ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                });

            return NextResponse.json({
                type: 'directory',
                path: normalizedPath,
                entries: items,
            });
        }

        const extension = path.extname(targetPath).slice(1).toLowerCase();
        const { buffer, truncated } = readFilePreview(targetPath, stats.size);
        const binaryByExtension = isBinaryExtension(extension);
        const isBinary = binaryByExtension || looksBinary(buffer);

        return NextResponse.json({
            type: 'file',
            path: normalizedPath,
            entry: {
                name: path.basename(targetPath),
                path: normalizedPath,
                type: 'file',
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                extension,
            },
            content: isBinary ? null : buffer.toString('utf-8'),
            isBinary,
            truncated: !isBinary && truncated,
        });
    } catch (error) {
        console.error('Error reading project files:', error);
        return NextResponse.json({ error: 'Failed to read files' }, { status: 500 });
    }
}
