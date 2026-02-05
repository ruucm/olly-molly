'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DirectCLITerminal } from './DirectCLITerminal';
import { DirectCLIInput } from './DirectCLIInput';

interface DirectCLIMessage {
    id: string;
    content: string;
    message_type: 'log' | 'error' | 'success' | 'system';
    created_at: string;
}

interface DirectCLIConversation {
    id: string;
    project_path: string;
    provider: 'claude' | 'opencode' | 'codex';
    prompt: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    started_at: string;
    completed_at: string | null;
}

interface DirectCLIModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultProjectPath?: string;
}

export function DirectCLIModal({ isOpen, onClose, defaultProjectPath }: DirectCLIModalProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversation, setConversation] = useState<DirectCLIConversation | null>(null);
    const [messages, setMessages] = useState<DirectCLIMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Poll for status updates
    const pollStatus = useCallback(async () => {
        if (!conversationId) return;

        try {
            const res = await fetch(`/api/direct-cli/status?conversation_id=${conversationId}&job_id=${jobId}`);
            const data = await res.json();

            if (data.success) {
                if (data.conversation) {
                    setConversation(data.conversation);
                    // Check if execution completed
                    if (data.conversation.status !== 'running') {
                        setIsExecuting(false);
                    }
                }
                if (data.messages) {
                    setMessages(data.messages);
                }
            }
        } catch (err) {
            console.error('Failed to poll status:', err);
        }
    }, [conversationId, jobId]);

    // Set up polling when executing
    useEffect(() => {
        if (isExecuting && conversationId) {
            pollStatus();
            pollIntervalRef.current = setInterval(pollStatus, 1000);
        } else {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [isExecuting, conversationId, pollStatus]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            // Only reset if not executing
            if (!isExecuting) {
                setJobId(null);
                setConversationId(null);
                setConversation(null);
                setMessages([]);
                setError(null);
            }
        }
    }, [isOpen, isExecuting]);

    const handleExecute = async (params: {
        projectPath: string;
        prompt: string;
        provider: 'claude' | 'opencode' | 'codex';
    }) => {
        setError(null);
        setIsExecuting(true);
        setMessages([]);
        setConversation(null);

        try {
            const res = await fetch('/api/direct-cli/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_path: params.projectPath,
                    prompt: params.prompt,
                    provider: params.provider,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to start execution');
            }

            setJobId(data.job_id);
            setConversationId(data.conversation_id);
            setConversation(data.conversation);
        } catch (err) {
            console.error('Execution error:', err);
            setError(err instanceof Error ? err.message : 'Failed to execute');
            setIsExecuting(false);
        }
    };

    const handleStop = async () => {
        if (!jobId) return;

        try {
            const res = await fetch(`/api/direct-cli/status?job_id=${jobId}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (data.success) {
                setIsExecuting(false);
                // Poll one more time to get final state
                setTimeout(pollStatus, 500);
            }
        } catch (err) {
            console.error('Stop error:', err);
        }
    };

    const formatDuration = (start: string, end: string | null) => {
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date();
        const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
        const totalSeconds = Math.floor(durationMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    const getStatusColor = (status: DirectCLIConversation['status']) => {
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

    const getStatusIcon = (status: DirectCLIConversation['status']) => {
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

    const getProviderLabel = (provider: DirectCLIConversation['provider']) => {
        if (provider === 'opencode') return '⚪️ OpenCode';
        if (provider === 'codex') return '🔵 Codex';
        return '🟠 Claude';
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⌨️ Direct CLI" size="full">
            <div className="h-full flex flex-col">
                {/* Status bar when conversation exists */}
                {conversation && (
                    <div className="px-4 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] flex flex-wrap items-center gap-4 text-xs">
                        <span className="text-[var(--text-muted)]">
                            {getProviderLabel(conversation.provider)}
                        </span>
                        <span className="text-[var(--text-muted)] truncate max-w-[200px]" title={conversation.project_path}>
                            📁 {conversation.project_path.split('/').pop()}
                        </span>
                        <span className={`font-medium ${getStatusColor(conversation.status)}`}>
                            {getStatusIcon(conversation.status)} {conversation.status}
                        </span>
                        <span className="text-[var(--text-muted)]">
                            ⏱ {formatDuration(conversation.started_at, conversation.completed_at)}
                        </span>
                    </div>
                )}

                {/* Error display */}
                {error && (
                    <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-500">
                        {error}
                    </div>
                )}

                {/* Terminal output */}
                <div className="flex-1 overflow-hidden">
                    <DirectCLITerminal messages={messages} isRunning={isExecuting} />
                </div>

                {/* Input area */}
                <DirectCLIInput
                    onExecute={handleExecute}
                    onStop={handleStop}
                    isExecuting={isExecuting}
                    defaultProjectPath={defaultProjectPath}
                />
            </div>
        </Modal>
    );
}
