'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { Ticket, Member } from '@/lib/client-db';

const roleImages: Record<string, string> = {
  PM: '/profiles/pm.png',
  FE_DEV: '/profiles/dev-frontend.png',
  BACKEND_DEV: '/profiles/dev-backend.png',
  QA: '/profiles/qa.png',
  BUG_HUNTER: '/profiles/dev-bughunter.jpg',
};

export type WorkflowNodeStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowNodeData {
  ticket: Ticket;
  assignees: Member[];
  status: WorkflowNodeStatus;
}

const statusStyles: Record<WorkflowNodeStatus, string> = {
  idle: 'border-[var(--border-secondary)]',
  running: 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
  completed: 'border-green-500',
  failed: 'border-red-500',
};

const priorityBadgeStyles: Record<string, string> = {
  LOW: 'bg-gray-500/20 text-gray-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  CRITICAL: 'bg-red-500/20 text-red-400',
};

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNodeData>) {
  const { ticket, assignees, status } = data;

  return (
    <div
      className={`
        min-w-[200px] max-w-[280px] bg-[var(--bg-secondary)] rounded-lg border-2
        transition-all duration-200
        ${statusStyles[status]}
        ${selected ? 'ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-primary)]' : ''}
        ${status === 'running' ? 'animate-pulse' : ''}
      `}
    >
      {/* Input Handle - Left */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[var(--text-muted)] !border-2 !border-[var(--bg-primary)] hover:!bg-[var(--accent-primary)]"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 min-w-0">
          {/* Status Icon */}
          {status === 'running' && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
          )}
          {status === 'completed' && (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          )}
          {status === 'failed' && (
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          )}

          {/* Priority Badge */}
          <span
            className={`
              text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0
              ${priorityBadgeStyles[ticket.priority] || priorityBadgeStyles.MEDIUM}
            `}
          >
            {ticket.priority}
          </span>
        </div>

        {/* Assignees */}
        {assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 2).map((member, index) => {
              const profileImage = roleImages[member.role];
              return (
                <div
                  key={member.id}
                  className="relative"
                  style={{ zIndex: assignees.slice(0, 2).length - index }}
                  title={member.name}
                >
                  <Avatar
                    name={member.name}
                    src={profileImage}
                    emoji={!profileImage ? member.avatar : undefined}
                    badge={profileImage ? member.avatar : undefined}
                    size="sm"
                  />
                </div>
              );
            })}
            {assignees.length > 2 && (
              <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--text-muted)] border border-[var(--bg-secondary)]">
                +{assignees.length - 2}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        <h4 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
          {ticket.title}
        </h4>
        {ticket.description && (
          <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
            {ticket.description}
          </p>
        )}
      </div>

      {/* Footer - Status text */}
      {status !== 'idle' && (
        <div className="px-3 py-1.5 border-t border-[var(--border-primary)]">
          <span
            className={`
              text-[10px] font-medium
              ${status === 'running' ? 'text-blue-400' : ''}
              ${status === 'completed' ? 'text-green-400' : ''}
              ${status === 'failed' ? 'text-red-400' : ''}
            `}
          >
            {status === 'running' && 'Running...'}
            {status === 'completed' && 'Completed'}
            {status === 'failed' && 'Failed'}
          </span>
        </div>
      )}

      {/* Output Handle - Right */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[var(--text-muted)] !border-2 !border-[var(--bg-primary)] hover:!bg-[var(--accent-primary)]"
      />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
