import { NextRequest, NextResponse } from 'next/server';
import { ticketService } from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || undefined;
        const projectId = searchParams.get('projectId') || undefined;
        const tickets = ticketService.getAll(status, projectId);
        return NextResponse.json(tickets);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body.title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        const ticket = ticketService.create({
            title: body.title,
            description: body.description,
            priority: body.priority,
            assignee_id: body.assignee_id,
            project_id: body.project_id,
            created_by: body.created_by,
        });
        return NextResponse.json(ticket, { status: 201 });
    } catch (error) {
        console.error('Error creating ticket:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}

