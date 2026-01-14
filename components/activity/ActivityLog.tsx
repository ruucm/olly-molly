'use client';

import { useState, useEffect } from 'react';

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
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLogs() {
            try {
                const res = await fetch(`/api/tickets/logs?ticketId=${encodeURIComponent(ticketId)}`);
                const data = await res.json();
                setLogs(data);
            } catch (error) {
                console.error('Failed to fetch logs:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchLogs();
    }, [ticketId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (logs.length === 0) {
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
            {logs.map((log) => (
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
