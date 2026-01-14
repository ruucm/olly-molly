'use client';

import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ActivityLog } from '@/components/activity/ActivityLog';
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
    created_at?: string;
    updated_at?: string;
}

interface WorkLog {
    id: string;
    status: string;
    command: string;
    output: string | null;
    git_commit_hash: string | null;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    agent_name?: string;
    agent_avatar?: string;
}

interface RunningJob {
    id: string;
    ticketId: string;
    agentName: string;
    status: 'running' | 'completed' | 'failed';
    output: string;
    startedAt: string;
}

interface TicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket?: Ticket | null;
    members: Member[];
    onSave: (data: Partial<Ticket>) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
    hasActiveProject?: boolean;
    onTicketStatusChange?: () => void;
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

export function TicketModal({ isOpen, onClose, ticket, members, onSave, onDelete, hasActiveProject, onTicketStatusChange }: TicketModalProps) {
    const [title, setTitle] = useState(ticket?.title || '');
    const [description, setDescription] = useState(ticket?.description || '');
    const [status, setStatus] = useState(ticket?.status || 'TODO');
    const [priority, setPriority] = useState(ticket?.priority || 'MEDIUM');
    const [assigneeId, setAssigneeId] = useState(ticket?.assignee_id || '');
    const [showLogs, setShowLogs] = useState(false);
    const [showWorkLogs, setShowWorkLogs] = useState(false);
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [executing, setExecuting] = useState(false);
    const [runningJob, setRunningJob] = useState<RunningJob | null>(null);
    const [feedback, setFeedback] = useState('');
    const [provider, setProvider] = useState<AgentProvider>('opencode');
    const [expandedLog, setExpandedLog] = useState(false);

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
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const outputRef = useRef<HTMLPreElement>(null);

    const isEditing = !!ticket;

    // Reset state when ticket changes
    useEffect(() => {
        if (ticket) {
            setTitle(ticket.title);
            setDescription(ticket.description || '');
            setStatus(ticket.status);
            setPriority(ticket.priority);
            setAssigneeId(ticket.assignee_id || '');
        }
    }, [ticket]);

    // Poll for job status when executing
    useEffect(() => {
        if (!ticket) return;

        const checkJobStatus = async () => {
            try {
                const res = await fetch(`/api/agent/status?ticket_id=${ticket.id}`);
                const data = await res.json();

                if (data.job) {
                    setRunningJob(data.job);
                    setExecuting(data.job.status === 'running');

                    // Auto-scroll output
                    if (outputRef.current) {
                        outputRef.current.scrollTop = outputRef.current.scrollHeight;
                    }

                    // If job completed, update status and stop polling
                    if (data.job.status !== 'running') {
                        setStatus(data.job.status === 'completed' ? 'IN_REVIEW' : status);
                        onTicketStatusChange?.();
                    }
                } else {
                    setRunningJob(null);
                    setExecuting(false);
                }
            } catch (error) {
                console.error('Failed to check job status:', error);
            }
        };

        // Check immediately when modal opens or ticket changes
        checkJobStatus();

        // Poll every 500ms for real-time log updates
        pollIntervalRef.current = setInterval(checkJobStatus, 500);

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [ticket, status, onTicketStatusChange]);

    // Fetch work logs
    useEffect(() => {
        if (ticket && showWorkLogs) {
            fetch(`/api/tickets/${ticket.id}/work-logs`)
                .then(res => res.json())
                .then(setWorkLogs)
                .catch(console.error);
        }
    }, [ticket, showWorkLogs]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            title,
            description: description || null,
            status,
            priority,
            assignee_id: assigneeId || null,
        });
    };

    const handleExecuteAgent = async () => {
        if (!ticket || !ticket.assignee_id) return;

        setExecuting(true);

        try {
            const res = await fetch('/api/agent/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: ticket.id,
                    feedback: feedback.trim() || undefined,
                    provider,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setStatus('IN_PROGRESS');
                // Job polling will pick up the running job
            } else {
                setExecuting(false);
                alert(data.error || 'Failed to start agent');
            }
        } catch (error) {
            setExecuting(false);
            alert('Failed to start agent: ' + String(error));
        }
    };

    const handleCancelJob = async () => {
        if (!runningJob) return;

        try {
            await fetch(`/api/agent/status?job_id=${runningJob.id}`, { method: 'DELETE' });
            setRunningJob(null);
            setExecuting(false);
        } catch (error) {
            console.error('Failed to cancel job:', error);
        }
    };

    const memberOptions = [
        { value: '', label: 'Unassigned' },
        ...members
            .filter(m => m.role !== 'PM') // PM은 담당자로 선택 불가
            .map(m => ({ value: m.id, label: `${m.avatar} ${m.name}` }))
    ];

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const getElapsedTime = (startedAt: string) => {
        const elapsed = Date.now() - new Date(startedAt).getTime();
        return formatDuration(elapsed);
    };

    const providerLabel = provider === 'opencode'
        ? 'OpenCode'
        : provider === 'codex'
            ? 'Codex'
            : 'Claude';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Ticket' : 'Create Ticket'}
            size="xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter ticket title"
                    required
                />

                <Textarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter ticket description"
                    rows={4}
                />

                <div className="grid grid-cols-2 gap-4">
                    <Select
                        label="Status"
                        value={status}
                        onChange={setStatus}
                        options={statusOptions}
                    />
                    <Select
                        label="Priority"
                        value={priority}
                        onChange={setPriority}
                        options={priorityOptions}
                    />
                </div>

                <Select
                    label="Assignee"
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={memberOptions}
                />

                {/* Agent Execution Section */}
                {isEditing && ticket && ticket.assignee_id && (
                    <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🤖</span>
                                <span className="font-medium text-[var(--text-primary)]">AI Agent 실행</span>
                                {executing && (
                                    <Badge variant="info" size="sm">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-1" />
                                        실행 중
                                    </Badge>
                                )}
                            </div>
                            {!executing ? (
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={handleExecuteAgent}
                                    disabled={!hasActiveProject}
                                >
                                    {status === 'NEED_FIX' ? '🔁 피드백 반영 및 재시도' : `🚀 ${providerLabel}로 작업 실행`}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={handleCancelJob}
                                >
                                    ⏹ 작업 취소
                                </Button>
                            )}
                        </div>

                        {/* Provider Selection */}
                        <div className="flex items-center gap-3">
                            <label className="text-sm text-[var(--text-tertiary)]">Agent Provider:</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setProvider('claude')}
                                    disabled={executing}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'claude'
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    🟠 Claude
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProvider('codex')}
                                    disabled={executing}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'codex'
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    🔵 Codex
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProvider('opencode')}
                                    disabled={executing}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'opencode'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        } ${executing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    ⚪️ OpenCode
                                </button>
                            </div>
                        </div>

                        {/* Feedback Input */}
                        <div className="mt-3">
                            <Textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="에이전트에게 전달할 피드백이나 수정 요청사항을 입력하세요... (선택)"
                                rows={2}
                                className="text-sm bg-[var(--bg-secondary)]"
                            />
                        </div>

                        {!hasActiveProject && (
                            <p className="text-sm text-amber-400">
                                ⚠️ 프로젝트를 먼저 선택해주세요
                            </p>
                        )}

                        {/* Running Job Output */}
                        {runningJob && (
                            <div className={`p-3 rounded-lg border transition-all ${runningJob.status === 'running'
                                ? 'bg-blue-500/10 border-blue-500/20'
                                : runningJob.status === 'completed'
                                    ? 'bg-emerald-500/10 border-emerald-500/20'
                                    : 'bg-red-500/10 border-red-500/20'
                                }`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {runningJob.status === 'running' ? (
                                            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                        ) : runningJob.status === 'completed' ? (
                                            <span>✅</span>
                                        ) : (
                                            <span>❌</span>
                                        )}
                                        <span className="text-sm font-medium text-[var(--text-primary)]">
                                            {runningJob.agentName}
                                        </span>
                                        <Badge variant="default" size="sm">
                                            {runningJob.output.split('\n').length} lines
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {runningJob.status === 'running'
                                                ? `⏱ ${getElapsedTime(runningJob.startedAt)}`
                                                : runningJob.status === 'completed' ? '완료' : '실패'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedLog(!expandedLog)}
                                            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            {expandedLog ? '🔽 축소' : '🔼 확대'}
                                        </button>
                                    </div>
                                </div>
                                <pre
                                    ref={outputRef}
                                    className={`text-xs text-[var(--text-tertiary)] overflow-auto whitespace-pre-wrap bg-black/30 rounded p-3 font-mono transition-all ${expandedLog ? 'max-h-[60vh]' : 'max-h-48'}`}
                                >
                                    {runningJob.output || 'Starting...'}
                                </pre>
                                {runningJob.status === 'running' && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                                        실시간 로그 스트리밍 중...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {isEditing && ticket && (
                    <div className="pt-4 border-t border-[var(--border-primary)] space-y-3">
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => { setShowLogs(!showLogs); setShowWorkLogs(false); }}
                                className={`text-sm transition-colors ${showLogs ? 'text-indigo-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                📋 Activity Log
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowWorkLogs(!showWorkLogs); setShowLogs(false); }}
                                className={`text-sm transition-colors ${showWorkLogs ? 'text-indigo-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                🤖 Work Logs
                            </button>
                        </div>

                        {showLogs && (
                            <div className="max-h-48 overflow-y-auto">
                                <ActivityLog ticketId={ticket.id} />
                            </div>
                        )}

                        {showWorkLogs && (
                            <div className="max-h-48 overflow-y-auto space-y-2">
                                {workLogs.length === 0 ? (
                                    <p className="text-sm text-[var(--text-muted)] text-center py-4">
                                        아직 AI 작업 기록이 없습니다
                                    </p>
                                ) : (
                                    workLogs.map((log) => (
                                        <div
                                            key={log.id}
                                            className={`p-3 rounded-lg border ${log.status === 'SUCCESS'
                                                ? 'bg-emerald-500/5 border-emerald-500/20'
                                                : log.status === 'FAILED'
                                                    ? 'bg-red-500/5 border-red-500/20'
                                                    : 'bg-[var(--bg-tertiary)] border-[var(--border-primary)]'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 text-sm">
                                                <span>{log.status === 'SUCCESS' ? '✅' : log.status === 'FAILED' ? '❌' : '🔄'}</span>
                                                <span className="text-[var(--text-primary)]">{log.agent_name || 'Agent'}</span>
                                                {log.git_commit_hash && (
                                                    <Badge variant="default" size="sm">
                                                        {log.git_commit_hash.slice(0, 7)}
                                                    </Badge>
                                                )}
                                                {log.duration_ms && (
                                                    <span className="text-xs text-[var(--text-muted)]">
                                                        {formatDuration(log.duration_ms)}
                                                    </span>
                                                )}
                                            </div>
                                            {log.output && (
                                                <pre className="mt-2 text-xs text-[var(--text-tertiary)] max-h-20 overflow-auto whitespace-pre-wrap">
                                                    {log.output.slice(0, 500)}
                                                    {log.output.length > 500 && '...'}
                                                </pre>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-3 pt-4">
                    {isEditing && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete}>
                            Delete
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary">
                        {isEditing ? 'Save Changes' : 'Create Ticket'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
