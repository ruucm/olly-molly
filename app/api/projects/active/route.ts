import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/db';

export async function GET() {
    try {
        const project = projectService.getActive();
        if (!project) {
            return NextResponse.json({ error: 'No active project' }, { status: 404 });
        }
        return NextResponse.json(project);
    } catch (error) {
        console.error('Error fetching active project:', error);
        return NextResponse.json({ error: 'Failed to fetch active project' }, { status: 500 });
    }
}
