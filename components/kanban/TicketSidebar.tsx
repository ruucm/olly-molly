'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import {
    conversationMessageService,
    conversationService,
    projectService,
    useConversationMessages,
    useConversations,
    type Conversation,
} from '@/lib/client-db';
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

interface TicketSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: Ticket | null;
    members: Member[];
    onTicketUpdate: (id: string, data: Partial<Ticket>) => void | Promise<void>;
    onTicketDelete?: (id: string) => void | Promise<void>;
    hasActiveProject?: boolean;
}

const statusOptions = [
    { value: 'TODO', label: 'To Do' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'IN_REVIEW', label: 'In Review' },
    { value: 'NEED_FIX', label: 'Need Fix' },
    { value: 'COMPLETE', label: 'Complete' },
    { value: 'ON_HOLD', label: 'On Hold' },
];

const priorityOptions = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];

// Web Notification helper
function showNotification(title: string, body: string, icon?: string) {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }

    const notificationIcon = icon || '/app-icon.png';

    // Request permission if not granted
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: notificationIcon });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body, icon: notificationIcon });
            }
        });
    }
}

// Role to profile image mapping
const roleProfileImages: Record<string, string> = {
    PM: '/profiles/pm.png',
    FE_DEV: '/profiles/fe.png',
    BACKEND_DEV: '/profiles/be.png',
    QA: '/profiles/qa.png',
    DEVOPS: '/profiles/devops.png',
    BUG_HUNTER: '/profiles/bughunter.png',
};

export function TicketSidebar({
    isOpen,
    onClose,
    ticket,
    members,
    onTicketUpdate,
    onTicketDelete,
    hasActiveProject
}: TicketSidebarProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('TODO');
    const [priority, setPriority] = useState('MEDIUM');
    const [assigneeId, setAssigneeId] = useState('');
    const [feedback, setFeedback] = useState('');
    const [provider, setProvider] = useState<AgentProvider>('opencode');
    const [executing, setExecuting] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);

    // UI state
    const [showTicketDetails, setShowTicketDetails] = useState(true);
    const [showAgentControls, setShowAgentControls] = useState(false);

    // Conversations
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const conversations = useConversations(ticket?.id || '');
    const conversationMessages = useConversationMessages(selectedConversationId);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedProvider = window.localStorage.getItem('agentProvider') as AgentProvider | null;
        if (savedProvider === 'claude' || savedProvider === 'opencode' || savedProvider === 'codex') {
            setProvider(savedProvider);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('agentProvider', provider);
    }, [provider]);

    // Update form fields when ticket changes
    useEffect(() => {
        if (ticket) {
            setTitle(ticket.title);
            setDescription(ticket.description || '');
            setStatus(ticket.status);
            setPriority(ticket.priority);
            setAssigneeId(ticket.assignee_id || '');
            setShowTicketDetails(true);
            // Reset executing state and conversation selection when switching tickets
            setExecuting(false);
            setSelectedConversationId(null);
        }
    }, [ticket?.id]);

    const sortedConversations = useMemo(() => {
        return [...conversations].sort((a, b) => {
            const aTime = new Date(a.started_at).getTime();
            const bTime = new Date(b.started_at).getTime();
            return bTime - aTime;
        });
    }, [conversations]);

    const membersById = useMemo(() => {
        return new Map(members.map((member) => [member.id, member]));
    }, [members]);

    const conversationsWithAgent = useMemo(() => {
        return sortedConversations.map((conversation) => ({
            ...conversation,
            agent: membersById.get(conversation.agent_id),
        }));
    }, [sortedConversations, membersById]);

    useEffect(() => {
        if (!ticket) {
            setSelectedConversationId(null);
            return;
        }
        if (!selectedConversationId && sortedConversations.length > 0) {
            setSelectedConversationId(sortedConversations[0].id);
        }
    }, [ticket, selectedConversationId, sortedConversations]);

    const lastOutputRef = useRef<string>('');

    useEffect(() => {
        if (!currentJobId || !selectedConversationId) return;

        let cancelled = false;

        const pollOutput = async () => {
            try {
                const res = await fetch(`/api/agent/status?job_id=${currentJobId}`);
                const data = await res.json();
                if (cancelled) return;

                const output = typeof data.output === 'string' ? data.output : '';
                const previous = lastOutputRef.current;
                if (output.length > previous.length) {
                    const delta = output.slice(previous.length);
                    conversationMessageService.create(selectedConversationId, delta, 'log');
                    lastOutputRef.current = output;
                }
            } catch (error) {
                console.error('Failed to fetch job output:', error);
            }
        };

        pollOutput();
        const interval = setInterval(pollOutput, 1000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [currentJobId, selectedConversationId]);

    useEffect(() => {
        if (!ticket?.id || !selectedConversationId) return;

        let cancelled = false;
        let wasRunning = false;

        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/agent/status?ticket_id=${ticket.id}`);
                const data = await res.json();
                if (cancelled) return;

                const job = data.job;
                if (!job) {
                    if (wasRunning) {
                        setExecuting(false);
                        setCurrentJobId(null);
                        wasRunning = false;
                    }
                    return;
                }

                const isRunning = job.status === 'running';
                setExecuting(isRunning);
                if (isRunning) {
                    wasRunning = true;
                    if (!currentJobId) {
                        setCurrentJobId(job.id);
                    }
                    return;
                }

                if (wasRunning) {
                    wasRunning = false;
                    const completionStatus = job.status === 'completed'
                        ? 'completed'
                        : job.status === 'failed'
                            ? 'failed'
                            : 'cancelled';
                    const output = typeof job.output === 'string' ? job.output : '';
                    const commitMatch = output.match(/commit\s+([a-f0-9]{7,40})/i);
                    const commitHash = commitMatch ? commitMatch[1] : undefined;
                    conversationService.complete(selectedConversationId, {
                        status: completionStatus,
                        git_commit_hash: commitHash,
                    });
                    conversationMessageService.create(
                        selectedConversationId,
                        completionStatus === 'completed'
                            ? `✅ Task completed successfully${commitHash ? ` (commit: ${commitHash})` : ''}`
                            : completionStatus === 'failed'
                                ? '❌ Task failed'
                                : '⏹ Job was cancelled by user',
                        completionStatus === 'completed' ? 'success' : completionStatus === 'failed' ? 'error' : 'system',
                    );

                    if (completionStatus === 'completed') {
                        setStatus('IN_REVIEW');
                        onTicketUpdate(ticket.id, { status: 'IN_REVIEW' });
                        if (ticket.assignee) {
                            const agentName = ticket.assignee.name;
                            const agentIcon = roleProfileImages[ticket.assignee.role] || '/app-icon.png';
                            showNotification(
                                `✅ ${agentName} 작업 완료!`,
                                `"${ticket.title}" 작업이 완료되어 리뷰 대기 중입니다.`,
                                agentIcon,
                            );
                        }
                    }

                    setCurrentJobId(null);
                }
            } catch (error) {
                console.error('Failed to fetch job status:', error);
            }
        };

        pollStatus();
        const interval = setInterval(pollStatus, 2000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [ticket?.id, selectedConversationId, onTicketUpdate, currentJobId, ticket?.assignee, ticket?.title]);

    const persistTicketDetails = async () => {
        if (!ticket) return;
        await onTicketUpdate(ticket.id, {
            title,
            description: description || null,
            status,
            priority,
            assignee_id: assigneeId || null,
        });
    };

    const handleSave = () => {
        void persistTicketDetails();
    };

    const handleDelete = () => {
        if (!ticket || !onTicketDelete) return;
        if (confirm('Are you sure you want to delete this ticket?')) {
            onTicketDelete(ticket.id);
            onClose();
        }
    };

    const handleExecuteAgent = async () => {
        if (!ticket || !assigneeId) return;

        setExecuting(true);

        try {
            await persistTicketDetails();

            const agent = members.find((member) => member.id === assigneeId);
            const project = projectService.getActive();

            if (!agent || !project) {
                throw new Error('Missing agent or active project for execution');
            }

            const conversation = conversationService.create({
                ticket_id: ticket.id,
                agent_id: agent.id,
                provider,
                feedback: feedback.trim() || undefined,
            });

            conversationMessageService.create(
                conversation.id,
                `🚀 ${agent.name} started working on "${ticket.title}"`,
                'system',
            );

            const res = await fetch('/api/agent/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket: {
                        id: ticket.id,
                        title: ticket.title,
                        description: ticket.description,
                    },
                    agent: {
                        id: agent.id,
                        name: agent.name,
                        role: agent.role,
                        avatar: agent.avatar,
                        system_prompt: agent.system_prompt,
                        can_generate_images: agent.can_generate_images,
                        can_log_screenshots: agent.can_log_screenshots,
                    },
                    project: {
                        id: project.id,
                        name: project.name,
                        path: project.path,
                    },
                    conversation_id: conversation.id,
                    feedback: feedback.trim() || undefined,
                    provider,
                }),
            });

            const data = await res.json();

            if (data.success) {
                if (data.job_id) {
                    setCurrentJobId(data.job_id);
                    lastOutputRef.current = '';
                }

                setSelectedConversationId(conversation.id);
                setFeedback('');
                setStatus('IN_PROGRESS');
                onTicketUpdate(ticket.id, { status: 'IN_PROGRESS' });
                setShowAgentControls(false);
            } else {
                alert(data.error || 'Failed to start agent');
                setExecuting(false);
            }
        } catch (error) {
            alert('Failed to start agent: ' + String(error));
            setExecuting(false);
        }
    };

    const handleStopJob = async () => {
        if (!currentJobId || !selectedConversationId) return;

        try {
            const res = await fetch(`/api/agent/status?job_id=${currentJobId}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (data.success) {
                conversationService.complete(selectedConversationId, { status: 'cancelled' });
                conversationMessageService.create(selectedConversationId, '⏹ Job was cancelled by user', 'system');
                setExecuting(false);
                setCurrentJobId(null);
            }
        } catch (error) {
            console.error('Failed to stop job:', error);
        }
    };

    const memberOptions = [
        { value: '', label: 'Unassigned' },
        ...members
            .filter(m => m.role !== 'PM') // PM은 담당자로 선택 불가
            .map(m => ({ value: m.id, label: `${m.avatar} ${m.name}` }))
    ];

    const selectedConversation = conversationsWithAgent.find(c => c.id === selectedConversationId) || null;
    const isConversationRunning = selectedConversation?.status === 'running';

    if (!isOpen || !ticket) return null;

    return (
        <div className="h-full bg-secondary border-l border-primary flex flex-col overflow-hidden">
            {/* Minimal Header */}
            <div
                className="p-3 border-b border-primary flex items-center justify-between flex-shrink-0 cursor-pointer hover:bg-tertiary/50 transition-colors"
                onClick={() => setShowTicketDetails(!showTicketDetails)}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-primary truncate">{ticket.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-tertiary text-muted">{ticket.status}</span>
                </div>
                <div className="flex items-center gap-1">
                    {/* Menu Button */}
                    <button
                        onClick={() => setShowTicketDetails(!showTicketDetails)}
                        className="p-2 text-tertiary hover:text-primary hover:bg-tertiary rounded-lg transition-colors"
                        title="Ticket Details"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d={showTicketDetails ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                        </svg>
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-tertiary hover:text-primary hover:bg-tertiary rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Collapsible Ticket Details */}
            {showTicketDetails && (
                <div className="p-4 border-b border-primary space-y-3 flex-shrink-0 bg-tertiary">
                    <Input
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-sm"
                    />
                    <Textarea
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                        <Select
                            label="Status"
                            value={status}
                            onChange={setStatus}
                            options={statusOptions}
                            className="text-sm"
                        />
                        <Select
                            label="Priority"
                            value={priority}
                            onChange={setPriority}
                            options={priorityOptions}
                            className="text-sm"
                        />
                        <Select
                            label="Assignee"
                            value={assigneeId}
                            onChange={setAssigneeId}
                            options={memberOptions}
                            className="text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSave} variant="primary" size="sm">Save</Button>
                        {onTicketDelete && (
                            <Button onClick={handleDelete} variant="danger" size="sm">Delete</Button>
                        )}
                        <Button onClick={() => setShowTicketDetails(false)} variant="ghost" size="sm">Close</Button>
                    </div>
                </div>
            )}

            {/* AI Agent Execution Section */}
            {assigneeId && (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Minimal Agent Control Bar */}
                    <div
                        className="p-2 border-b border-primary flex items-center justify-between flex-shrink-0 bg-tertiary/50 cursor-pointer hover:bg-tertiary transition-colors"
                        onClick={() => setShowAgentControls(!showAgentControls)}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-primary">🤖 AI Agent</span>
                            {ticket.assignee && (
                                <span className="text-xs text-muted">
                                    {ticket.assignee.avatar} {ticket.assignee.name}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {!showAgentControls && !executing && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleExecuteAgent();
                                    }}
                                    disabled={!hasActiveProject}
                                >
                                    🚀 Execute
                                </Button>
                            )}
                            {executing && currentJobId && (
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleStopJob();
                                    }}
                                >
                                    ⏹ Stop
                                </Button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAgentControls(!showAgentControls);
                                }}
                                className="p-1.5 text-xs text-tertiary hover:text-primary hover:bg-tertiary rounded transition-colors"
                            >
                                {showAgentControls ? '▲' : '▼'}
                            </button>
                        </div>
                    </div>

                    {/* Collapsible Agent Controls */}
                    {showAgentControls && (
                        <div className="p-3 border-b border-primary space-y-2 flex-shrink-0 bg-tertiary/30">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-tertiary">Provider:</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setProvider('claude')}
                                        disabled={executing}
                                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${provider === 'claude'
                                            ? 'bg-indigo-500 text-white'
                                            : 'bg-tertiary text-tertiary hover:text-primary'
                                            } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        🟠 Claude
                                    </button>
                                    <button
                                        onClick={() => setProvider('codex')}
                                        disabled={executing}
                                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${provider === 'codex'
                                            ? 'bg-orange-500 text-white'
                                            : 'bg-tertiary text-tertiary hover:text-primary'
                                            } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        🔵 Codex
                                    </button>
                                    <button
                                        onClick={() => setProvider('opencode')}
                                        disabled={executing}
                                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${provider === 'opencode'
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-tertiary text-tertiary hover:text-primary'
                                            } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        ⚪️ OpenCode
                                    </button>
                                </div>
                            </div>

                            <Textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Optional feedback or instructions..."
                                rows={2}
                                className="text-xs bg-secondary"
                                disabled={executing}
                            />

                            {!hasActiveProject && (
                                <p className="text-xs text-amber-400">⚠️ Select a project first</p>
                            )}

                            <div className="flex gap-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleExecuteAgent}
                                    disabled={!hasActiveProject || executing}
                                >
                                    🚀 Execute Agent
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAgentControls(false)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Conversations Section - Takes up remaining 90%+ */}
                    <div className="flex-1 flex min-h-0">
                        {/* Conversation List */}
                        <div className="w-56 border-r border-primary overflow-y-auto flex-shrink-0">
                            <div className="p-2 bg-tertiary border-b border-primary">
                                <p className="text-xs font-medium text-muted">Execution History</p>
                            </div>
                            <ConversationList
                                conversations={conversationsWithAgent}
                                selectedId={selectedConversationId}
                                onSelect={setSelectedConversationId}
                            />
                        </div>

                        {/* Conversation View */}
                        <div className="flex-1 min-w-0">
                            <ConversationView
                                conversation={selectedConversation}
                                messages={conversationMessages}
                                isRunning={isConversationRunning}
                                jobId={currentJobId}
                                onStopJob={handleStopJob}
                            />
                        </div>
                    </div>
                </div>
            )}

            {!assigneeId && (
                <div className="flex-1 flex items-center justify-center text-muted">
                    <div className="text-center">
                        <p className="text-lg mb-2">👤</p>
                        <p>Assign an agent to this ticket to execute tasks</p>
                    </div>
                </div>
            )}
        </div>
    );
}
