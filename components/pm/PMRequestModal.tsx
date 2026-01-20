'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { memberService, ticketService, useProjects, useMembers } from '@/lib/client-db';
import type { AgentProvider } from '@/lib/agent-jobs';

interface TeamMember {
    id: string;
    role: string;
    name: string;
    avatar: string | null;
}

interface CreatedTicket {
    id: string;
    title: string;
    description: string;
    priority: string;
    assigned_role: string;
    assignee?: {
        name: string;
        avatar: string;
    };
}

interface PMRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTicketsCreated: () => void;
    projectId?: string;
}

type TabType = 'request' | 'ask';

export function PMRequestModal({ isOpen, onClose, onTicketsCreated, projectId }: PMRequestModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>('request');
    const [request, setRequest] = useState('');
    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [provider, setProvider] = useState<AgentProvider>('claude');
    const [providerLoaded, setProviderLoaded] = useState(false);
    const [result, setResult] = useState<{
        message: string;
        summary?: string;
        tickets: CreatedTicket[];
    } | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

    const projects = useProjects();
    const project = useMemo(() => projects.find((item) => item.id === projectId) || null, [projects, projectId]);

    // Get all members except PM (PM is the assigner, not assignee)
    const allMembers = useMembers();
    const assignableMembers = useMemo(() => allMembers.filter(m => m.role !== 'PM'), [allMembers]);

    // Initialize selected members when modal opens
    useEffect(() => {
        if (isOpen && selectedMemberIds.length === 0 && assignableMembers.length > 0) {
            setSelectedMemberIds(assignableMembers.map(m => m.id));
        }
    }, [isOpen, assignableMembers, selectedMemberIds.length]);

    const toggleMember = (memberId: string) => {
        setSelectedMemberIds(prev =>
            prev.includes(memberId)
                ? prev.filter(id => id !== memberId)
                : [...prev, memberId]
        );
    };

    const selectedMembers = useMemo(() =>
        assignableMembers.filter(m => selectedMemberIds.includes(m.id)),
        [assignableMembers, selectedMemberIds]
    );

    // Match TicketModal behavior: persist provider selection
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedProvider = window.localStorage.getItem('agentProvider') as AgentProvider | null;
        if (savedProvider === 'claude' || savedProvider === 'opencode' || savedProvider === 'codex') {
            setProvider(savedProvider);
        }
        setProviderLoaded(true);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !providerLoaded) return;
        window.localStorage.setItem('agentProvider', provider);
    }, [provider, providerLoaded]);

    const handleSubmitRequest = async () => {
        if (!request.trim()) return;

        setLoading(true);
        setError(null);

        try {
            // 현재 프로젝트의 기존 티켓 가져오기
            const existingTickets = ticketService.getAll(undefined, projectId).map(t => ({
                title: t.title,
                status: t.status,
                priority: t.priority,
            }));

            // Prepare team members info for the prompt
            const teamMembers = selectedMembers.map(m => ({
                role: m.role,
                name: m.name,
            }));

            const res = await fetch('/api/pm/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request: request.trim(),
                    project_id: projectId,
                    project_path: project?.path,
                    provider,
                    existing_tickets: existingTickets,
                    team_members: teamMembers,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                const detailText = typeof data?.details === 'string' && data.details.trim() ? `\n\n${data.details.trim()}` : '';
                const attemptsText = Array.isArray(data?.attempts) && data.attempts.length > 0
                    ? `\n\n(attempts: ${data.attempts.map((a: any) => `${a.cli}:${a.status}`).join(', ')})`
                    : '';
                throw new Error(`[${res.status}] ${data.error || 'Failed to process request'}${attemptsText}${detailText}`);
            }

            if (data.success) {
                const createdTickets: CreatedTicket[] = [];
                for (const task of data.tasks || []) {
                    const assigneeId = memberService.getByRole(task.assignee_role)?.id || null;
                    const ticket = ticketService.create({
                        title: task.title,
                        description: task.description,
                        priority: task.priority,
                        assignee_ids: assigneeId ? [assigneeId] : [],
                        project_id: projectId,
                        created_by: memberService.getByRole('PM')?.id || undefined,
                    });
                    const assignee = assigneeId ? memberService.getById(assigneeId) : undefined;
                    createdTickets.push({
                        id: ticket.id,
                        title: ticket.title,
                        description: ticket.description || '',
                        priority: ticket.priority,
                        assigned_role: task.assignee_role,
                        assignee: assignee ? { name: assignee.name, avatar: assignee.avatar || '' } : undefined,
                    });
                }

                setResult({
                    message: data.message || `PM이 AI를 사용해 "${request.trim()}" 요청을 분석하여 ${createdTickets.length}개의 태스크를 생성했습니다.`,
                    summary: data.ai_summary,
                    tickets: createdTickets,
                });
                onTicketsCreated();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitQuestion = async () => {
        if (!question.trim()) return;

        setLoading(true);
        setError(null);
        setAnswer(null);

        try {
            const res = await fetch('/api/pm/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: question.trim(),
                    project_path: project?.path,
                    provider,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to process question');
            }

            if (data.success) {
                setAnswer(data.answer);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRequest('');
        setQuestion('');
        setResult(null);
        setAnswer(null);
        setError(null);
        onClose();
    };

    const roleColors: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
        FE_DEV: 'info',
        BACKEND_DEV: 'success',
        QA: 'warning',
        DEVOPS: 'default',
        BUG_HUNTER: 'default',
    };

    const roleLabels: Record<string, string> = {
        FE_DEV: 'Frontend',
        BACKEND_DEV: 'Backend',
        QA: 'QA',
        DEVOPS: 'DevOps',
        BUG_HUNTER: 'Bug Hunter',
    };

    const providerLabel = provider === 'opencode'
        ? 'OpenCode'
        : provider === 'codex'
            ? 'Codex'
            : 'Claude';

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="🤖 PM Agent" size="lg">
            {/* Provider Selection (same style as TicketModal) */}
            <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-sm text-[var(--text-tertiary)]">
                    Provider: <span className="text-[var(--text-primary)] font-medium">{providerLabel}</span>
                </p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setProvider('claude')}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'claude'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        🟠 Claude
                    </button>
                    <button
                        type="button"
                        onClick={() => setProvider('codex')}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'codex'
                            ? 'bg-orange-500 text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        🔵 Codex
                    </button>
                    <button
                        type="button"
                        onClick={() => setProvider('opencode')}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'opencode'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        ⚪️ OpenCode
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4 border-b border-[var(--border-primary)]">
                <button
                    onClick={() => { setActiveTab('request'); setError(null); }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'request'
                        ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                >
                    🛠️ 작업 요청
                </button>
                <button
                    onClick={() => { setActiveTab('ask'); setError(null); }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'ask'
                        ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                >
                    💬 질문하기
                </button>
            </div>

            {/* Request Tab */}
            {activeTab === 'request' && (
                <>
                    {!result ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                                <Avatar name="PM Agent" emoji="👔" size="md" />
                                <div>
                                    <p className="font-medium text-[var(--text-primary)]">PM Agent</p>
                                    <p className="text-sm text-[var(--text-tertiary)]">
                                        어떤 기능을 만들고 싶으신가요? 기술적으로 자세히 쓰지 않아도 되고, AI가 간단한 태스크로 나눠 팀원에게 할당해 드릴게요.
                                    </p>
                                </div>
                            </div>

                            {/* Team Member Selection */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                                    작업 분배 대상
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {assignableMembers.map(member => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => toggleMember(member.id)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border ${
                                                selectedMemberIds.includes(member.id)
                                                    ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                                                    : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border-primary)] hover:border-[var(--accent-primary)]'
                                            }`}
                                        >
                                            <span>{member.avatar}</span>
                                            <span>{member.name}</span>
                                        </button>
                                    ))}
                                </div>
                                {selectedMemberIds.length === 0 && (
                                    <p className="text-xs text-amber-400">⚠️ 최소 1명의 멤버를 선택해주세요</p>
                                )}
                            </div>

                            <Textarea
                                label="기능 요청"
                                value={request}
                                onChange={(e) => setRequest(e.target.value)}
                                placeholder="예: 사용자 로그인 기능을 만들어줘. 이메일/비밀번호로 로그인하고 성공하면 대시보드로 이동."
                                rows={4}
                            />

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-red-400 text-sm whitespace-pre-wrap">❌ {error}</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={handleClose}>취소</Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSubmitRequest}
                                    disabled={!request.trim() || loading || selectedMemberIds.length === 0}
                                >
                                    {loading ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                            AI 분석 중...
                                        </>
                                    ) : (
                                        <>🧠 {providerLabel}로 분석하기</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                <p className="text-emerald-400 font-medium">✅ {result.message}</p>
                            </div>

                            {result.summary && (
                                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        <span className="font-medium">🤖 AI 분석: </span>
                                        {result.summary}
                                    </p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <h4 className="text-sm font-medium text-[var(--text-secondary)]">생성된 태스크:</h4>
                                {result.tickets.map((ticket) => (
                                    <div
                                        key={ticket.id}
                                        className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)]"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[var(--text-primary)] text-sm">
                                                    {ticket.title}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                                                    {ticket.description}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant={roleColors[ticket.assigned_role]} size="sm">
                                                        {roleLabels[ticket.assigned_role]}
                                                    </Badge>
                                                    {ticket.assignee && (
                                                        <span className="text-xs text-[var(--text-tertiary)]">
                                                            → {ticket.assignee.avatar} {ticket.assignee.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end">
                                <Button variant="primary" onClick={handleClose}>확인</Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Ask Tab */}
            {activeTab === 'ask' && (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <Avatar name="PM Agent" emoji="👔" size="md" />
                        <div>
                            <p className="font-medium text-[var(--text-primary)]">PM Agent</p>
                            <p className="text-sm text-[var(--text-tertiary)]">
                                프로젝트에 대해 궁금한 것을 물어보세요. AGENT_WORK_LOG.md와 프로젝트 파일을 참고해서 답변해 드릴게요.
                            </p>
                        </div>
                    </div>

                    <Textarea
                        label="질문"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="예: 지금까지 어떤 작업들이 완료됐어? / 프론트엔드는 어디까지 진행됐어? / 최근에 수정된 파일이 뭐야?"
                        rows={3}
                    />

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-sm whitespace-pre-wrap">❌ {error}</p>
                        </div>
                    )}

                    {answer && (
                        <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] max-h-64 overflow-y-auto">
                            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">💬 답변:</p>
                            <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                                {answer}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={handleClose}>닫기</Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmitQuestion}
                            disabled={!question.trim() || loading}
                        >
                            {loading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                    답변 생성 중...
                                </>
                            ) : (
                                <>💬 {providerLabel}로 질문하기</>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
