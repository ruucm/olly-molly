'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TicketCard } from './TicketCard';

interface Ticket {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assignee?: {
        id: string;
        name: string;
        avatar?: string | null;
        role: string;
        system_prompt: string;
        is_default: number;
        can_generate_images: number;
        can_log_screenshots: number;
    } | null;
}

interface SortableTicketProps {
    ticket: Ticket;
    onTicketClick: (ticket: Ticket) => void;
    isRunning?: boolean;
}

export function SortableTicket({ ticket, onTicketClick, isRunning }: SortableTicketProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: ticket.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            <TicketCard
                ticket={ticket}
                onClick={() => !isDragging && onTicketClick(ticket)}
                isDragging={isDragging}
                isRunning={isRunning}
            />
        </div>
    );
}
