'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ConversationMessage } from '@/lib/client-db';

function stripAnsi(input: string): string {
    // Covers CSI + OSC sequences commonly emitted by CLIs (colors, hyperlinks, etc.)
    // CSI: ESC [ ... cmd
    // OSC: ESC ] ... (BEL | ESC \)
    return input
        .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

function classifyLogLine(line: string): 'stderr' | 'error' | 'normal' {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('[stderr]')) return 'stderr';
    if (trimmed.startsWith('[error]')) return 'error';
    if (/^\s*(error:|fatal:)/i.test(trimmed)) return 'error';
    return 'normal';
}

type ConversationWithAgent = Conversation & {
    agent?: {
        id: string;
        name: string;
        avatar?: string | null;
        role?: string;
    };
};

interface ConversationViewProps {
    conversation: ConversationWithAgent | null;
    messages: ConversationMessage[];
    isRunning?: boolean;
    jobId?: string | null;
    onStopJob?: () => void;
}

export function ConversationView({ conversation, messages, isRunning = false, jobId = null, onStopJob }: ConversationViewProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
    const autoScrollEnabledRef = useRef(true);
    const prevConversationId = useRef<string | null>(null);

    // Reset scroll flag when conversation changes
    useEffect(() => {
        if (conversation?.id !== prevConversationId.current) {
            prevConversationId.current = conversation?.id || null;
            setHasInitiallyScrolled(false);
            autoScrollEnabledRef.current = true;
        }
    }, [conversation?.id]);

    const sortedMessages = useMemo(() => {
        return [...messages].sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            if (timeA !== timeB) {
                return timeA - timeB;
            }
            return a.id.localeCompare(b.id);
        });
    }, [messages]);

    // Group consecutive log messages into single blocks for readable display
    const groupedMessages = useMemo(() => {
        const groups: Array<{
            id: string;
            type: ConversationMessage['message_type'];
            content: string;
        }> = [];

        for (const msg of sortedMessages) {
            const lastGroup = groups[groups.length - 1];
            // Merge consecutive 'log' messages into one group
            if (msg.message_type === 'log' && lastGroup?.type === 'log') {
                lastGroup.content += msg.content;
            } else {
                groups.push({
                    id: msg.id,
                    type: msg.message_type,
                    content: msg.content,
                });
            }
        }

        return groups;
    }, [sortedMessages]);

    // Scroll to bottom: once on initial load, then only when running
    useEffect(() => {
        if (!hasInitiallyScrolled && sortedMessages.length > 0) {
            if (autoScrollEnabledRef.current) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
            }
            setHasInitiallyScrolled(true);
        } else if (isRunning && autoScrollEnabledRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [sortedMessages, isRunning, hasInitiallyScrolled]);

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
                return 'text-red-300 bg-red-500/10 border-red-500/30';
            case 'success':
                return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'system':
                return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            default:
                return 'text-primary bg-secondary/50 border-primary/10';
        }
    };

    const renderLogContent = (raw: string, isError = false) => {
        const cleaned = stripAnsi(raw);
        const lines = cleaned.split('\n');

        // For error messages, split at "--- Debug Info ---" separator
        if (isError) {
            const debugIdx = lines.findIndex(l => l.includes('--- Debug Info ---'));
            if (debugIdx !== -1) {
                const mainLines = lines.slice(0, debugIdx);
                const debugLines = lines.slice(debugIdx);
                return (
                    <div className="space-y-2">
                        <div className="space-y-0.5">
                            {mainLines.map((line, idx) => (
                                <div key={idx} className="whitespace-pre-wrap break-words">
                                    {line}
                                </div>
                            ))}
                        </div>
                        <details className="mt-2">
                            <summary className="cursor-pointer text-red-400/70 hover:text-red-300 text-[10px] uppercase tracking-wider select-none">
                                Debug Info
                            </summary>
                            <div className="mt-1 pl-2 border-l-2 border-red-500/30 text-red-400/60 space-y-0.5">
                                {debugLines.slice(1).map((line, idx) => (
                                    <div key={idx} className="whitespace-pre-wrap break-words">
                                        {line}
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                );
            }
        }

        return (
            <div className="space-y-0.5">
                {lines.map((line, idx) => {
                    const kind = classifyLogLine(line);
                    const lineClass =
                        kind === 'stderr' || kind === 'error'
                            ? 'text-red-300'
                            : 'text-[inherit]';
                    return (
                        <div key={idx} className={`whitespace-pre-wrap break-words ${lineClass}`}>
                            {line}
                        </div>
                    );
                })}
            </div>
        );
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
            <div
                ref={scrollContainerRef}
                onScroll={() => {
                    if (!scrollContainerRef.current) return;
                    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
                    autoScrollEnabledRef.current = scrollHeight - scrollTop - clientHeight < 8;
                }}
                className="flex-1 overflow-y-auto p-4 space-y-2"
            >
                {sortedMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted">
                        <p>No messages yet...</p>
                    </div>
                ) : (
                    groupedMessages.map((group) => (
                        <div
                            key={group.id}
                            className={`rounded-lg border p-2 font-mono text-xs ${getMessageTypeClass(group.type)}`}
                        >
                            {renderLogContent(group.content, group.type === 'error')}
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
