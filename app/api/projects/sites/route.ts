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

const MAX_DEPTH = 6;

function toRelativePath(projectRoot: string, fullPath: string): string {
    const relative = path.relative(projectRoot, fullPath);
    return relative.split(path.sep).join('/');
}

function scanForPackageJsons(projectRoot: string): { dir: string; name?: string; hasDevScript: boolean }[] {
    const results: { dir: string; name?: string; hasDevScript: boolean }[] = [];
    const stack: Array<{ dir: string; depth: number }> = [{ dir: projectRoot, depth: 0 }];

    while (stack.length > 0) {
        const { dir, depth } = stack.pop()!;
        if (depth > MAX_DEPTH) continue;

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (SKIP_DIRECTORIES.has(entry.name)) continue;
                stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
                continue;
            }

            if (entry.isFile() && entry.name === 'package.json') {
                const packagePath = path.join(dir, entry.name);
                try {
                    const raw = fs.readFileSync(packagePath, 'utf-8');
                    const data = JSON.parse(raw);
                    const hasDevScript = Boolean(data?.scripts?.dev);
                    if (hasDevScript) {
                        results.push({
                            dir,
                            name: typeof data?.name === 'string' ? data.name : undefined,
                            hasDevScript,
                        });
                    }
                } catch {
                    continue;
                }
            }
        }
    }

    return results;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        const project = projectId ? projectService.getById(projectId) : projectService.getActive();
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const packages = scanForPackageJsons(project.path);
        const sites = packages
            .map(pkg => {
                const relativePath = toRelativePath(project.path, pkg.dir);
                return {
                    id: relativePath || '.',
                    name: pkg.name,
                    path: relativePath,
                };
            })
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

        return NextResponse.json({
            project: {
                id: project.id,
                name: project.name,
                path: project.path,
            },
            sites,
        });
    } catch (error) {
        console.error('Error scanning project sites:', error);
        return NextResponse.json({ error: 'Failed to scan sites' }, { status: 500 });
    }
}
