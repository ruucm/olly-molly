'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationMessage } from '@/lib/db';

interface ConversationViewProps {
    conversation: Conversation | null;
    messages: ConversationMessage[];
    isRunning?: boolean;
    jobId?: string | null;
    onStopJob?: () => void;
}

export function ConversationView({ conversation, messages, isRunning = false, jobId = null, onStopJob }: ConversationViewProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
    const prevConversationId = useRef<string | null>(null);

    // Reset scroll flag when conversation changes
    useEffect(() => {
        if (conversation?.id !== prevConversationId.current) {
            prevConversationId.current = conversation?.id || null;
            setHasInitiallyScrolled(false);
        }
    }, [conversation?.id]);

    // Scroll to bottom: once on initial load, then only when running
    useEffect(() => {
        if (!hasInitiallyScrolled && messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
            setHasInitiallyScrolled(true);
        } else if (isRunning) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isRunning, hasInitiallyScrolled]);

    if (!conversation) {
        return (
            <div className="flex items-center justify-center h-full text-tertiary">
                <div className="text-center">
                    <p className="text-lg mb-2">💬</p>
                    <p>Select a conversation to view details</p>
                </div>
            </div>
        );
    }

    const getStatusColor = (status: Conversation['status']) => {
        switch (status) {
            case 'running':
                return 'text-blue-400';
            case 'completed':
                return 'text-emerald-400';
            case 'failed':
                return 'text-red-400';
            case 'cancelled':
                return 'text-gray-400';
            default:
                return 'text-gray-400';
        }
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

    const getMessageTypeClass = (type: ConversationMessage['message_type']) => {
        switch (type) {
            case 'error':
                return 'text-muted border-transparent hover:bg-black/5';
            case 'success':
                return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'system':
                return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            default:
                return 'text-primary bg-secondary/50 border-primary/10';
        }
    };

    const parseTimestamp = (value: string) => {
        const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
        const normalized = hasTimezone
            ? value
            : `${value.replace(' ', 'T')}Z`;
        return new Date(normalized);
    };

    const getProviderLabel = (provider: Conversation['provider']) => {
        if (provider === 'opencode') return '⚪️ OpenCode';
        if (provider === 'codex') return '🔵 Codex';
        return '🟠 Claude';
    };

    const formatDuration = (start: Date, end: Date) => {
        const durationMs = Math.max(0, end.getTime() - start.getTime());
        const totalSeconds = Math.floor(durationMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-primary flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{conversation.agent?.avatar || '🤖'}</span>
                    <div>
                        <h3 className="font-medium text-primary">{conversation.agent?.name || 'Agent'}</h3>
                        <p className="text-xs text-muted">
                            {getProviderLabel(conversation.provider)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${getStatusColor(conversation.status)}`}>
                        {getStatusIcon(conversation.status)} {conversation.status}
                    </span>
                    {isRunning && (
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    )}
                    {isRunning && jobId && onStopJob && (
                        <button
                            onClick={onStopJob}
                            className="ml-2 px-3 py-1 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                            title="Stop running agent"
                        >
                            ⏹ Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted">
                        <p>No messages yet...</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`pmargin-bottom: 2px; rounded-lg border p-2 font-mono text-xs whitespace-pre-wrap break-words ${getMessageTypeClass(message.message_type)}`}
                        >
                            {message.content}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Footer Info */}
            {conversation.completed_at && (
                <div className="p-3 border-t border-primary bg-tertiary flex-shrink-0">
                    <div className="flex items-center justify-between text-xs text-muted">
                        <span>Started: {parseTimestamp(conversation.started_at).toLocaleString()}</span>
                        <span>Completed: {parseTimestamp(conversation.completed_at).toLocaleString()}</span>
                        <span>
                            Duration: {formatDuration(
                                parseTimestamp(conversation.started_at),
                                parseTimestamp(conversation.completed_at)
                            )}
                        </span>
                    </div>
                    {conversation.git_commit_hash && (
                        <div className="mt-1 text-xs text-emerald-400">
                            📦 Commit: {conversation.git_commit_hash}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
