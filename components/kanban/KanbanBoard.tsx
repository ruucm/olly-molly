'use client';

import { useState, useCallback, useEffect } from 'react';
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
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { TicketCard } from './TicketCard';
import { CheckSquare, X, Play } from 'lucide-react';

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
    assignee_id?: string | null;
    assignee?: Member | null;
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
    onTicketCreate: (data: Partial<Ticket>) => void | Promise<Ticket | null>;
    onTicketDelete: (id: string) => void | Promise<void>;
    onTicketsReorder?: (tickets: Ticket[]) => void;
    hasActiveProject?: boolean;
    onRefresh?: () => void;
    onTicketSelect?: (ticket: Ticket) => void;
    onBatchExecute?: (ticketIds: string[]) => void;
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
    onBatchExecute
}: KanbanBoardProps) {
    const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
    const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());

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
        if (selectionMode) return;
        const ticket = tickets.find(t => t.id === event.active.id);
        if (ticket) setActiveTicket(ticket);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        if (selectionMode) return;
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

        // Check if reordering within the same column
        const draggedTicket = tickets.find(t => t.id === ticketId);
        const overTicket = tickets.find(t => t.id === overId);

        if (draggedTicket && overTicket && draggedTicket.status === overTicket.status) {
            const columnTickets = tickets.filter(t => t.status === draggedTicket.status);
            const otherTickets = tickets.filter(t => t.status !== draggedTicket.status);

            const oldIndex = columnTickets.findIndex(t => t.id === ticketId);
            const newIndex = columnTickets.findIndex(t => t.id === overId);

            if (oldIndex !== newIndex) {
                const reorderedColumnTickets = arrayMove(columnTickets, oldIndex, newIndex);
                const newTickets = [...otherTickets, ...reorderedColumnTickets];
                onTicketsReorder?.(newTickets);
            }
        }
    };

    const handleTicketClick = useCallback((ticket: Ticket) => {
        if (!selectionMode) {
            onTicketSelect?.(ticket);
        }
    }, [onTicketSelect, selectionMode]);

    const handleTicketSelect = useCallback((ticketId: string, selected: boolean) => {
        setSelectedTicketIds(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(ticketId);
            } else {
                newSet.delete(ticketId);
            }
            return newSet;
        });
    }, []);

    const handleToggleSelectionMode = useCallback(() => {
        if (selectionMode) {
            // Exiting selection mode - clear selections
            setSelectedTicketIds(new Set());
        }
        setSelectionMode(!selectionMode);
    }, [selectionMode]);

    const handleClearSelection = useCallback(() => {
        setSelectedTicketIds(new Set());
    }, []);

    const handleExecuteSelected = useCallback(() => {
        if (selectedTicketIds.size === 0) return;
        onBatchExecute?.(Array.from(selectedTicketIds));
    }, [selectedTicketIds, onBatchExecute]);

    const selectedCount = selectedTicketIds.size;

    return (
        <div className="flex flex-col h-full">
            {/* Selection Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <button
                    onClick={handleToggleSelectionMode}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                        transition-colors duration-150
                        ${selectionMode
                            ? 'bg-blue-500 text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }
                    `}
                >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectionMode ? 'Exit Selection' : 'Select'}
                </button>

                {selectionMode && (
                    <>
                        <span className="text-xs text-[var(--text-muted)]">
                            {selectedCount} selected
                        </span>

                        {selectedCount > 0 && (
                            <>
                                <button
                                    onClick={handleClearSelection}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Clear
                                </button>
                                <button
                                    onClick={handleExecuteSelected}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                                >
                                    <Play className="w-3.5 h-3.5" />
                                    Execute Selected
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Board */}
            <div className="flex-1 border-t border-[var(--border-primary)]">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-4 overflow-x-auto pb-4 h-full">
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
                                selectionMode={selectionMode}
                                selectedTicketIds={selectedTicketIds}
                                onTicketSelect={handleTicketSelect}
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
