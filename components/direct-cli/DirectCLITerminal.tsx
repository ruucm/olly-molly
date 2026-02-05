'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

function stripAnsi(input: string): string {
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

interface Message {
    id: string;
    content: string;
    message_type: 'log' | 'error' | 'success' | 'system';
    created_at: string;
}

interface DirectCLITerminalProps {
    messages: Message[];
    isRunning: boolean;
}

export function DirectCLITerminal({ messages, isRunning }: DirectCLITerminalProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
    const autoScrollEnabledRef = useRef(true);

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

    const getMessageTypeClass = (type: Message['message_type']) => {
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

    const renderLogContent = (raw: string) => {
        const cleaned = stripAnsi(raw);
        const lines = cleaned.split('\n');
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

    return (
        <div className="flex flex-col h-full bg-[var(--bg-secondary)]">
            {/* Header */}
            <div className="px-4 py-2 border-b border-primary flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">Terminal Output</span>
                    {isRunning && (
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    )}
                </div>
                <span className="text-xs text-muted">
                    {sortedMessages.length} messages
                </span>
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
                        <p>Waiting for output...</p>
                    </div>
                ) : (
                    sortedMessages.map((message) => (
                        <div
                            key={message.id}
                            className={`rounded-lg border p-2 font-mono text-xs ${getMessageTypeClass(message.message_type)}`}
                        >
                            {renderLogContent(message.content)}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
