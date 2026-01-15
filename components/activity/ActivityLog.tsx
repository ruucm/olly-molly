'use client';

import { useMemo } from 'react';
import { useActivityLogs, useMembers } from '@/lib/client-db';

interface ActivityLog {
    id: string;
    ticket_id: string;
    member_id?: string;
    action: string;
    old_value?: string | null;
    new_value?: string | null;
    details?: string | null;
    created_at: string;
    member?: {
        id: string;
        name: string;
        avatar?: string | null;
        role?: string;
    };
}

interface ActivityLogProps {
    ticketId: string;
}

export function ActivityLog({ ticketId }: ActivityLogProps) {
    const logs = useActivityLogs(ticketId);
    const members = useMembers();
    const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

    const hydratedLogs = useMemo(() => {
        return logs.map((log) => ({
            ...log,
            member: log.member_id ? membersById.get(log.member_id) : undefined,
        }));
    }, [logs, membersById]);

    if (hydratedLogs.length === 0) {
        return (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No activity yet</p>
        );
    }

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'CREATED': return '✨';
            case 'STATUS_CHANGED': return '🔄';
            case 'ASSIGNED': return '👤';
            case 'PRIORITY_CHANGED': return '⚡';
            case 'COMMENTED': return '💬';
            default: return '📝';
        }
    };

    const formatDate = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="space-y-3">
            {hydratedLogs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm">
                    <span className="text-lg">{getActionIcon(log.action)}</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-secondary)]">{log.details}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {log.member?.name && <span className="text-[var(--text-tertiary)]">{log.member.name} · </span>}
                            {formatDate(log.created_at)}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
