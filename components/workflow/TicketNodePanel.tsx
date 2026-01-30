'use client';

import { useState, useMemo } from 'react';
import { Search, GripVertical, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import type { Ticket, Member } from '@/lib/client-db';

interface TicketNodePanelProps {
  tickets: Ticket[];
  members: Member[];
  usedTicketIds: Set<string>;
  onDragStart: (ticket: Ticket, event: React.DragEvent) => void;
  isMobile?: boolean;
  onTapToAdd?: (ticket: Ticket) => void;
  onClose?: () => void;
}

const statusLabels: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  NEED_FIX: 'Need Fix',
  COMPLETE: 'Complete',
  ON_HOLD: 'On Hold',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-500/20 text-gray-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  CRITICAL: 'bg-red-500/20 text-red-400',
};

export function TicketNodePanel({
  tickets,
  members,
  usedTicketIds,
  onDragStart,
  isMobile,
  onTapToAdd,
  onClose,
}: TicketNodePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const membersById = useMemo(() => {
    return new Map(members.map((m) => [m.id, m]));
  }, [members]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      // Filter out already used tickets
      if (usedTicketIds.has(ticket.id)) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !ticket.title.toLowerCase().includes(query) &&
          !(ticket.description?.toLowerCase().includes(query))
        ) {
          return false;
        }
      }

      // Status filter
      if (statusFilter && ticket.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [tickets, usedTicketIds, searchQuery, statusFilter]);

  const getAssigneeAvatar = (ticket: Ticket) => {
    if (ticket.assignee_ids.length === 0) return null;
    const member = membersById.get(ticket.assignee_ids[0]);
    return member?.avatar || member?.name.charAt(0) || '?';
  };

  return (
    <div className="w-full md:w-64 h-full flex flex-col border-l border-[var(--border-primary)] bg-[var(--bg-secondary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Available Tickets
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isMobile ? 'Tap ticket to add to canvas' : 'Drag to canvas to add'}
          </p>
        </div>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-[var(--border-primary)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets..."
            className="pl-8"
          />
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-1 mt-2">
          <button
            onClick={() => setStatusFilter(null)}
            className={`
              text-[10px] px-2 py-0.5 rounded transition-colors
              ${!statusFilter
                ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            All
          </button>
          {['TODO', 'IN_PROGRESS', 'NEED_FIX'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`
                text-[10px] px-2 py-0.5 rounded transition-colors
                ${statusFilter === status
                  ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredTickets.length === 0 && (
          <div className="flex items-center justify-center h-32 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {searchQuery || statusFilter
                ? 'No matching tickets'
                : 'No available tickets'}
            </p>
          </div>
        )}

        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            draggable={!isMobile}
            onDragStart={!isMobile ? (e) => onDragStart(ticket, e) : undefined}
            onClick={isMobile && onTapToAdd ? () => onTapToAdd(ticket) : undefined}
            className={`
              flex items-start gap-2 p-2 mb-2 rounded-lg min-h-[44px]
              bg-[var(--bg-primary)] border border-[var(--border-primary)]
              ${isMobile
                ? 'cursor-pointer active:bg-[var(--bg-tertiary)]'
                : 'cursor-grab active:cursor-grabbing'
              }
              hover:border-[var(--accent-primary)] hover:shadow-sm
              transition-all duration-150
            `}
          >
            {isMobile ? (
              <Plus className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
            ) : (
              <GripVertical className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <span
                  className={`
                    text-[10px] px-1.5 py-0.5 rounded font-medium
                    ${priorityColors[ticket.priority]}
                  `}
                >
                  {ticket.priority}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {statusLabels[ticket.status]}
                </span>
              </div>
              <h4 className="text-xs font-medium text-[var(--text-primary)] line-clamp-2">
                {ticket.title}
              </h4>
            </div>
            {getAssigneeAvatar(ticket) && (
              <div
                className="w-5 h-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[10px] flex-shrink-0"
                title={membersById.get(ticket.assignee_ids[0])?.name}
              >
                {getAssigneeAvatar(ticket)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--border-primary)] text-center">
        <span className="text-xs text-[var(--text-muted)]">
          {filteredTickets.length} tickets available
        </span>
      </div>
    </div>
  );
}
