'use client';

import { useState } from 'react';
import { X, Play, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import type { AgentProvider } from '@/lib/agent-jobs';

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

interface BatchExecuteModalProps {
    isOpen: boolean;
    onClose: () => void;
    tickets: Ticket[];
    onExecute: (ticketIds: string[], provider: AgentProvider) => Promise<void>;
}

const roleImages: Record<string, string> = {
    PM: '/profiles/pm.png',
    FE_DEV: '/profiles/dev-frontend.png',
    BACKEND_DEV: '/profiles/dev-backend.png',
    QA: '/profiles/qa.png',
    BUG_HUNTER: '/profiles/dev-bughunter.jpg',
};

export function BatchExecuteModal({ isOpen, onClose, tickets, onExecute }: BatchExecuteModalProps) {
    const [provider, setProvider] = useState<AgentProvider>('claude');
    const [executing, setExecuting] = useState(false);

    if (!isOpen) return null;

    const ticketsWithAssignee = tickets.filter(t => t.assignee);
    const ticketsWithoutAssignee = tickets.filter(t => !t.assignee);

    const handleExecute = async () => {
        if (ticketsWithAssignee.length === 0) return;

        setExecuting(true);
        try {
            await onExecute(ticketsWithAssignee.map(t => t.id), provider);
            onClose();
        } catch (error) {
            console.error('Failed to execute batch:', error);
            alert('Failed to start batch execution: ' + String(error));
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
                    <h2 className="text-sm font-medium text-[var(--text-primary)]">
                        Execute {tickets.length} Tickets
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Warning for unassigned tickets */}
                    {ticketsWithoutAssignee.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-600 dark:text-amber-400">
                                <strong>{ticketsWithoutAssignee.length} ticket(s)</strong> without assigned agents will be skipped:
                                <ul className="mt-1 list-disc list-inside text-[var(--text-muted)]">
                                    {ticketsWithoutAssignee.map(t => (
                                        <li key={t.id} className="truncate">{t.title}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Provider Selection */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                            Agent Provider
                        </label>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as AgentProvider)}
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="claude">Claude Code</option>
                            <option value="opencode">OpenCode</option>
                            <option value="codex">Codex CLI</option>
                        </select>
                    </div>

                    {/* Ticket List */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                            Tickets to Execute ({ticketsWithAssignee.length})
                        </label>
                        <div className="border border-[var(--border-primary)] rounded-lg divide-y divide-[var(--border-primary)] max-h-[240px] overflow-y-auto">
                            {ticketsWithAssignee.map(ticket => {
                                const profileImage = ticket.assignee ? roleImages[ticket.assignee.role] : undefined;
                                return (
                                    <div key={ticket.id} className="flex items-center gap-3 px-3 py-2">
                                        <div className="flex-shrink-0">
                                            {ticket.assignee && (
                                                <Avatar
                                                    name={ticket.assignee.name}
                                                    src={profileImage}
                                                    emoji={!profileImage ? ticket.assignee.avatar : undefined}
                                                    size="sm"
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--text-primary)] truncate">
                                                {ticket.title}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {ticket.assignee?.name} ({ticket.assignee?.role})
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}

                            {ticketsWithAssignee.length === 0 && (
                                <div className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">
                                    No tickets with assigned agents
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border-primary)]">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExecute}
                        disabled={ticketsWithAssignee.length === 0 || executing}
                    >
                        {executing ? (
                            <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                                Starting...
                            </>
                        ) : (
                            <>
                                <Play className="w-3.5 h-3.5 mr-1.5" />
                                Execute {ticketsWithAssignee.length} Agents
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
