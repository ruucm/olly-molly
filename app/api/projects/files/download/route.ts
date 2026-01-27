import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const SKIP_DIRECTORIES = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'out',
    '.turbo',
    '.cache',
    '.pnpm-store',
    'coverage',
    '.nyc_output',
]);

const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function shouldSkip(name: string, isDirectory: boolean): boolean {
    if (isDirectory) {
        return SKIP_DIRECTORIES.has(name);
    }
    return SKIP_FILES.has(name);
}

function addDirectoryToArchive(
    archive: archiver.Archiver,
    dirPath: string,
    relativePath: string = ''
): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (shouldSkip(entry.name, entry.isDirectory())) {
            continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            addDirectoryToArchive(archive, fullPath, entryRelativePath);
        } else if (entry.isFile()) {
            archive.file(fullPath, { name: entryRelativePath });
        }
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectPath = searchParams.get('projectPath');
        const subPath = searchParams.get('path') || '';

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        const resolvedProjectPath = path.resolve(projectPath);
        const targetPath = subPath
            ? path.resolve(resolvedProjectPath, subPath)
            : resolvedProjectPath;

        // Security check: ensure target is within project
        if (!targetPath.startsWith(resolvedProjectPath)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }

        if (!fs.existsSync(targetPath)) {
            return NextResponse.json({ error: 'Path not found' }, { status: 404 });
        }

        const stats = fs.statSync(targetPath);
        const isDirectory = stats.isDirectory();

        // Generate filename
        const baseName = subPath
            ? path.basename(targetPath)
            : path.basename(resolvedProjectPath);
        const zipFileName = `${baseName}.zip`;

        // Create archive and collect buffer
        const buffer = await new Promise<Buffer>((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 6 },
            });

            const chunks: Buffer[] = [];

            archive.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            archive.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            archive.on('error', (err) => {
                reject(err);
            });

            if (isDirectory) {
                addDirectoryToArchive(archive, targetPath, '');
            } else {
                archive.file(targetPath, { name: path.basename(targetPath) });
            }

            archive.finalize();
        });

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`,
                'Content-Length': buffer.length.toString(),
            },
        });
    } catch (error) {
        console.error('Error creating zip:', error);
        return NextResponse.json(
            { error: 'Failed to create zip file' },
            { status: 500 }
        );
    }
}
