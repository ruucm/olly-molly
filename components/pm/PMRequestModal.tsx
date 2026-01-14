'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';

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
    const [result, setResult] = useState<{
        message: string;
        summary?: string;
        tickets: CreatedTicket[];
    } | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);

    const handleSubmitRequest = async () => {
        if (!request.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/pm/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request: request.trim(),
                    project_id: projectId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to process request');
            }

            if (data.success) {
                setResult({
                    message: data.message,
                    summary: data.ai_summary,
                    tickets: data.tickets,
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
    };

    const roleLabels: Record<string, string> = {
        FE_DEV: 'Frontend',
        BACKEND_DEV: 'Backend',
        QA: 'QA',
        DEVOPS: 'DevOps',
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="🤖 PM Agent" size="lg">
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

                            <Textarea
                                label="기능 요청"
                                value={request}
                                onChange={(e) => setRequest(e.target.value)}
                                placeholder="예: 사용자 로그인 기능을 만들어줘. 이메일/비밀번호로 로그인하고 성공하면 대시보드로 이동."
                                rows={4}
                            />

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-red-400 text-sm">❌ {error}</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={handleClose}>취소</Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSubmitRequest}
                                    disabled={!request.trim() || loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                            AI 분석 중...
                                        </>
                                    ) : (
                                        <>🧠 AI로 분석하기</>
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
                            <p className="text-red-400 text-sm">❌ {error}</p>
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
                                <>💬 질문하기</>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
