'use client';

import type { Conversation } from '@/lib/db';

interface ConversationListProps {
    conversations: Conversation[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
    const parseTimestamp = (value: string) => {
        const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
        const normalized = hasTimezone
            ? value
            : `${value.replace(' ', 'T')}Z`;
        return new Date(normalized);
    };

    const getStatusIcon = (status: Conversation['status']) => {
        switch (status) {
            case 'running':
                return '⏳';
            case 'completed':
                return '✅';
            case 'failed':
                return '❌';
            case 'cancelled':
                return '⏹';
            default:
                return '⏱';
        }
    };

    const getProviderBadge = (provider: Conversation['provider']) => {
        if (provider === 'opencode') return '⚪️ OpenCode';
        if (provider === 'codex') return '🔵 Codex';
        return '🟠 Claude';
    };

    const formatTime = (dateString: string) => {
        const date = parseTimestamp(dateString);
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
        return date.toLocaleDateString();
    };

    if (conversations.length === 0) {
        return (
            <div className="p-4 text-center text-muted">
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Execute AI Agent to create a conversation</p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-primary">
            {conversations.map((conv) => (
                <button
                    key={conv.id}
                    onClick={() => onSelect(conv.id)}
                    className={`w-full p-3 text-left transition-colors hover:bg-tertiary ${selectedId === conv.id ? 'bg-tertiary border-l-2 border-indigo-500' : ''
                        }`}
                >
                    <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{conv.agent?.avatar || '🤖'}</span>
                            <span className="text-sm font-medium text-primary">{conv.agent?.name}</span>
                        </div>
                        <span className="text-xs">{getStatusIcon(conv.status)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">{getProviderBadge(conv.provider)}</span>
                        <span className="text-xs text-muted">{formatTime(conv.started_at)}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}
