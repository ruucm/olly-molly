import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/db';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

const DEFAULT_LOG_LIMIT = 80;
const MAX_LOG_LIMIT = 200;

interface ParsedGitStatus {
    head: string;
    branch: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
    isDirty: boolean;
    isDetached: boolean;
}

interface ParsedGitCommit {
    hash: string;
    shortHash: string;
    parents: string[];
    author: string;
    date: string;
    relativeDate: string;
    subject: string;
    refs: string[];
}

function extractGitError(error: unknown): string {
    if (error && typeof error === 'object') {
        const err = error as { stderr?: string; message?: string };
        if (err.stderr && err.stderr.trim()) {
            return err.stderr.trim();
        }
        if (err.message) {
            return err.message;
        }
    }
    return 'Git command failed';
}

async function runGit(projectPath: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', ['--no-pager', '-C', projectPath, ...args], {
        maxBuffer: 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
    });
    return stdout.trimEnd();
}

async function isGitRepository(projectPath: string): Promise<boolean> {
    try {
        const output = await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
        return output.trim() === 'true';
    } catch (error) {
        const message = extractGitError(error).toLowerCase();
        if (message.includes('not a git repository')) {
            return false;
        }
        throw error;
    }
}

function parseGitStatus(output: string): ParsedGitStatus {
    const status: ParsedGitStatus = {
        head: '',
        branch: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        isDirty: false,
        isDetached: false,
    };

    const lines = output.split('\n').filter(Boolean);
    for (const line of lines) {
        if (line.startsWith('# ')) {
            const content = line.slice(2);
            if (content.startsWith('branch.oid ')) {
                const headValue = content.slice('branch.oid '.length).trim();
                status.head = headValue === '(initial)' ? '' : headValue;
            } else if (content.startsWith('branch.head ')) {
                const branch = content.slice('branch.head '.length).trim();
                if (branch === '(detached)') {
                    status.isDetached = true;
                    status.branch = null;
                } else {
                    status.branch = branch || null;
                }
            } else if (content.startsWith('branch.upstream ')) {
                const upstream = content.slice('branch.upstream '.length).trim();
                status.upstream = upstream || null;
            } else if (content.startsWith('branch.ab ')) {
                const match = content.match(/\+(\d+)\s-(\d+)/);
                if (match) {
                    status.ahead = Number.parseInt(match[1], 10);
                    status.behind = Number.parseInt(match[2], 10);
                }
            }
        } else {
            status.isDirty = true;
        }
    }

    if (!status.branch && !status.isDetached) {
        status.isDetached = true;
    }

    return status;
}

function parseGitLog(output: string): ParsedGitCommit[] {
    if (!output) return [];
    return output
        .split('\x1e')
        .map(record => record.trim())
        .filter(Boolean)
        .map(record => {
            const [hash, shortHash, parentsRaw, author, date, relativeDate, subject, refsRaw] = record.split('\x1f');
            const parents = parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [];
            const refs = refsRaw
                ? refsRaw.split(',').map(ref => ref.trim()).filter(Boolean)
                : [];
            return {
                hash,
                shortHash,
                parents,
                author,
                date,
                relativeDate,
                subject,
                refs,
            };
        });
}

async function resolveGraphRef(projectPath: string, status: ParsedGitStatus): Promise<string> {
    if (status.branch) {
        return status.branch;
    }
    if (!status.head) {
        return 'HEAD';
    }
    try {
        const output = await runGit(projectPath, ['branch', '--contains', status.head, '--format=%(refname:short)']);
        const branches = output.split('\n').map(branch => branch.trim()).filter(Boolean);
        if (branches.length === 0) {
            return status.head;
        }
        const preferred = branches.find(branch => branch === 'main' || branch === 'master');
        return preferred || branches[0];
    } catch {
        return status.head;
    }
}

function resolveProject(projectId: string | null) {
    const project = projectId ? projectService.getById(projectId) : projectService.getActive();
    if (!project) {
        return null;
    }
    if (!fs.existsSync(project.path) || !fs.statSync(project.path).isDirectory()) {
        return null;
    }
    return project;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const limitParam = searchParams.get('limit');
        const limit = Math.min(
            Math.max(Number.parseInt(limitParam || String(DEFAULT_LOG_LIMIT), 10) || DEFAULT_LOG_LIMIT, 1),
            MAX_LOG_LIMIT
        );

        const project = resolveProject(projectId);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const repoExists = await isGitRepository(project.path);
        if (!repoExists) {
            return NextResponse.json({ isGitRepo: false });
        }

        const statusOutput = await runGit(project.path, ['status', '--porcelain=2', '--branch']);
        const status = parseGitStatus(statusOutput);

        if (!status.head) {
            try {
                status.head = (await runGit(project.path, ['rev-parse', 'HEAD'])).trim();
            } catch {
                status.head = '';
            }
        }

        if (!status.head) {
            return NextResponse.json({
                isGitRepo: true,
                graphRef: status.branch || 'HEAD',
                status,
                commits: [],
            });
        }

        const graphRef = await resolveGraphRef(project.path, status);
        const logOutput = await runGit(project.path, [
            'log',
            graphRef,
            '--max-count',
            String(limit),
            '--date=iso',
            '--decorate=short',
            '--no-color',
            '--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ad%x1f%ar%x1f%s%x1f%D%x1e',
        ]);
        const commits = parseGitLog(logOutput);

        return NextResponse.json({
            isGitRepo: true,
            graphRef,
            status,
            commits,
        });
    } catch (error) {
        console.error('Error fetching git history:', error);
        return NextResponse.json({ error: extractGitError(error) }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const projectId = typeof body.projectId === 'string' ? body.projectId : null;
        const action = typeof body.action === 'string' ? body.action : 'checkout';
        const target = typeof body.target === 'string' ? body.target.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';

        const project = resolveProject(projectId);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (action === 'init') {
            await runGit(project.path, ['init']);
            return NextResponse.json({ ok: true });
        }

        const repoExists = await isGitRepository(project.path);
        if (!repoExists) {
            return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
        }

        if (action === 'checkout') {
            if (!target) {
                return NextResponse.json({ error: 'Target commit is required' }, { status: 400 });
            }
            if (target.startsWith('-')) {
                return NextResponse.json({ error: 'Invalid checkout target' }, { status: 400 });
            }
            await runGit(project.path, ['checkout', target]);
            return NextResponse.json({ ok: true });
        }

        if (action === 'commit') {
            if (!message) {
                return NextResponse.json({ error: 'Commit message is required' }, { status: 400 });
            }
            const statusOutput = await runGit(project.path, ['status', '--porcelain']);
            if (!statusOutput.trim()) {
                return NextResponse.json({ error: 'No changes to commit' }, { status: 400 });
            }
            await runGit(project.path, ['add', '-A']);
            await runGit(project.path, ['commit', '-m', message]);
            return NextResponse.json({ ok: true });
        }

        if (action === 'stash') {
            const statusOutput = await runGit(project.path, ['status', '--porcelain']);
            if (!statusOutput.trim()) {
                return NextResponse.json({ error: 'No changes to stash' }, { status: 400 });
            }
            const args = ['stash', 'push', '-u'];
            if (message) {
                args.push('-m', message);
            }
            await runGit(project.path, args);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Unsupported git action' }, { status: 400 });

    } catch (error) {
        console.error('Error running git action:', error);
        return NextResponse.json({ error: extractGitError(error) }, { status: 400 });
    }
}
