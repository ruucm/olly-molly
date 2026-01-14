import { NextRequest, NextResponse } from 'next/server';
import { ticketService, activityService } from '@/lib/db';

export const dynamic = 'force-static';


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const status = searchParams.get('status') || undefined;
        const projectId = searchParams.get('projectId') || undefined;

        if (id) {
            const ticket = ticketService.getById(id);
            if (!ticket) {
                return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
            }

            // Include activity logs
            const logs = activityService.getByTicketId(id);

            return NextResponse.json({ ...ticket, logs });
        }

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

export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const body = await request.json();
        const { updated_by, ...data } = body;

        const ticket = ticketService.update(id, data, updated_by);
        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }
        return NextResponse.json(ticket);
    } catch (error) {
        console.error('Error updating ticket:', error);
        return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const deleted = ticketService.delete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
    }
}
