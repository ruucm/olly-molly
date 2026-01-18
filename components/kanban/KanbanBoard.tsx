'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { TicketCard } from './TicketCard';
import { ticketService, memberService } from '@/lib/client-db';

interface Member {
    id: string;
    name: string;
    avatar?: string | null;
    role: string;
    system_prompt: string;
    is_default: number;
    can_generate_images: number;
    can_log_screenshots: number;
}

interface Ticket {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assignee_ids: string[];
    assignees: Member[];
}

interface RunningJob {
    id: string;
    ticketId: string;
    agentName: string;
    status: 'running' | 'completed' | 'failed';
}

interface KanbanBoardProps {
    tickets: Ticket[];
    members: Member[];
    onTicketUpdate: (id: string, data: Partial<Ticket>) => void | Promise<void>;
    onTicketCreate: (data: Partial<Ticket>) => void;
    onTicketDelete: (id: string) => void | Promise<void>;
    onTicketsReorder?: (tickets: Ticket[]) => void;
    hasActiveProject?: boolean;
    onRefresh?: () => void;
    onTicketSelect?: (ticket: Ticket) => void;
    selectionMode: boolean;
    selectedTicketIds: Set<string>;
    onTicketCheck: (id: string) => void;
}

const columns = [
    { id: 'TODO', title: 'To Do', color: 'text-[var(--text-secondary)]', icon: '📋' },
    { id: 'IN_PROGRESS', title: 'In Progress', color: 'text-blue-500', icon: '🔄' },
    { id: 'IN_REVIEW', title: 'In Review', color: 'text-purple-500', icon: '👀' },
    { id: 'NEED_FIX', title: 'Need Fix', color: 'text-orange-500', icon: '🛠️' },
    { id: 'COMPLETE', title: 'Complete', color: 'text-emerald-500', icon: '✅' },
    { id: 'ON_HOLD', title: 'On Hold', color: 'text-amber-500', icon: '⏸️' },
];

export function KanbanBoard({
    tickets,
    members,
    onTicketUpdate,
    onTicketCreate,
    onTicketDelete,
    onTicketsReorder,
    hasActiveProject,
    onRefresh,
    onTicketSelect,
    selectionMode,
    selectedTicketIds,
    onTicketCheck
}: KanbanBoardProps) {
    const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
    const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Poll for running jobs
    useEffect(() => {
        const fetchRunningJobs = async () => {
            try {
                const res = await fetch('/api/agent/status');
                const data = await res.json();
                setRunningJobs(data.jobs || []);

                // If any job just completed, refresh the board
                const hasCompleted = data.jobs?.some((job: RunningJob) => job.status !== 'running');
                if (hasCompleted) {
                    onRefresh?.();
                }
            } catch (error) {
                console.error('Failed to fetch running jobs:', error);
            }
        };

        fetchRunningJobs();
        const interval = setInterval(fetchRunningJobs, 3000);
        return () => clearInterval(interval);
    }, [onRefresh]);

    const isTicketRunning = useCallback((ticketId: string) => {
        return runningJobs.some(job => job.ticketId === ticketId && job.status === 'running');
    }, [runningJobs]);

    const handleDragStart = (event: DragStartEvent) => {
        const ticket = tickets.find(t => t.id === event.active.id);
        if (ticket) setActiveTicket(ticket);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTicket(null);

        if (!over) return;

        const ticketId = active.id as string;
        const overId = over.id as string;

        // Check if dropped on a column
        const targetColumn = columns.find(col => col.id === overId);
        if (targetColumn) {
            const ticket = tickets.find(t => t.id === ticketId);
            if (ticket && ticket.status !== targetColumn.id) {
                onTicketUpdate(ticketId, { status: targetColumn.id });
            }
            return;
        }

        const draggedTicket = tickets.find(t => t.id === ticketId);
        const overTicket = tickets.find(t => t.id === overId);

        if (!draggedTicket || !overTicket) return;

        // Moving to a different column (dropped on a ticket in another column)
        if (draggedTicket.status !== overTicket.status) {
            onTicketUpdate(ticketId, { status: overTicket.status });
            return;
        }

        // Reordering within the same column
        const columnTickets = tickets.filter(t => t.status === draggedTicket.status);
        const otherTickets = tickets.filter(t => t.status !== draggedTicket.status);

        const oldIndex = columnTickets.findIndex(t => t.id === ticketId);
        const newIndex = columnTickets.findIndex(t => t.id === overId);

        if (oldIndex !== newIndex) {
            const reorderedColumnTickets = arrayMove(columnTickets, oldIndex, newIndex);
            const newTickets = [...otherTickets, ...reorderedColumnTickets];
            onTicketsReorder?.(newTickets);
        }
    };

    const handleTicketClick = useCallback((ticket: Ticket) => {
        onTicketSelect?.(ticket);
    }, [onTicketSelect]);

    const handleCreateClick = () => {
        // For now, creating tickets still uses inline approach or can be added to sidebar
        // We'll create a minimal ticket and open sidebar
        onTicketCreate({ title: 'New Ticket', status: 'TODO', priority: 'MEDIUM' });
    };

    const runningCount = runningJobs.filter(j => j.status === 'running').length;

    return (
        <div className="flex flex-col h-full relative">
            {/* Board */}
            <div className="flex-1 flex border-t border-[var(--border-primary)]">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-4 overflow-x-auto pb-4">
                        {columns.map((column) => (
                            <KanbanColumn
                                key={column.id}
                                id={column.id}
                                title={column.title}
                                color={column.color}
                                icon={column.icon}
                                tickets={tickets.filter(t => t.status === column.id)}
                                onTicketClick={handleTicketClick}
                                runningTicketIds={runningJobs.filter(j => j.status === 'running').map(j => j.ticketId)}
                                selectedTicketIds={selectionMode ? selectedTicketIds : undefined}
                                onTicketSelect={selectionMode ? onTicketCheck : undefined}
                            />
                        ))}
                    </div>

                    <DragOverlay>
                        {activeTicket && (
                            <TicketCard
                                ticket={activeTicket}
                                onClick={() => { }}
                                isDragging
                                isRunning={isTicketRunning(activeTicket.id)}
                            />
                        )}
                    </DragOverlay>
                </DndContext>
            </div>
        </div>
    );
}
