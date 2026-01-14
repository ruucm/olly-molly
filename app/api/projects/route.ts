import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/db';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const dynamic = 'force-static';


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const project = projectService.getById(id);
            if (!project) {
                return NextResponse.json({ error: 'Project not found' }, { status: 404 });
            }
            return NextResponse.json(project);
        }

        const projects = projectService.getAll();
        return NextResponse.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const isCreateEmpty = body.action === 'create_empty' || body.createEmpty === true;

        if (isCreateEmpty) {
            if (!body.name || typeof body.name !== 'string') {
                return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
            }

            const basePath = typeof body.parentPath === 'string' && body.parentPath.trim()
                ? body.parentPath.trim()
                : path.join(os.homedir(), 'Projects');
            const projectPath = typeof body.path === 'string' && body.path.trim()
                ? body.path.trim()
                : path.join(basePath, body.name.trim());

            if (fs.existsSync(projectPath)) {
                return NextResponse.json({ error: 'Project already exists at this location' }, { status: 400 });
            }

            fs.mkdirSync(projectPath, { recursive: true });

            const project = projectService.create({
                name: body.name.trim(),
                path: projectPath,
                description: body.description || 'Empty project',
            });

            return NextResponse.json({ ...project, created: true }, { status: 201 });
        }

        if (!body.path) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        // Validate that the path exists and is a directory
        const projectPath = body.path;
        if (!fs.existsSync(projectPath)) {
            return NextResponse.json({ error: 'Path does not exist' }, { status: 400 });
        }

        const stats = fs.statSync(projectPath);
        if (!stats.isDirectory()) {
            return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
        }

        // Check if it's a git repository
        const gitPath = path.join(projectPath, '.git');
        const isGitRepo = fs.existsSync(gitPath);

        // Extract project name from path if not provided
        const name = body.name || path.basename(projectPath);

        const project = projectService.create({
            name,
            path: projectPath,
            description: body.description || (isGitRepo ? 'Git repository' : 'Local project'),
        });

        return NextResponse.json({ ...project, is_git_repo: isGitRepo }, { status: 201 });
    } catch (error) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const deleted = projectService.delete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const body = await request.json();

        if (body.is_active) {
            const project = projectService.setActive(id);
            return NextResponse.json(project);
        }

        return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
    } catch (error) {
        console.error('Error updating project:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}
