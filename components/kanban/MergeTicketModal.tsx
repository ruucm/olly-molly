'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';

interface Member {
    id: string;
    name: string;
    avatar?: string | null;
    role: string;
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

interface MergeTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    tickets: Ticket[];
    members: Member[];
    onMerge: (data: {
        title: string;
        description: string;
        priority: string;
        assignee_id: string | null;
        deleteOriginals: boolean;
    }) => void;
}

const priorityOptions = [
    { value: 'LOW', label: 'Low', weight: 1 },
    { value: 'MEDIUM', label: 'Medium', weight: 2 },
    { value: 'HIGH', label: 'High', weight: 3 },
    { value: 'CRITICAL', label: 'Critical', weight: 4 },
];

export function MergeTicketModal({ isOpen, onClose, tickets, members, onMerge }: MergeTicketModalProps) {
    // Calculate default values based on selected tickets
    const defaultTitle = useMemo(() => {
        if (tickets.length === 0) return '';
        return `[Merged] ${tickets.map(t => t.title).join(' + ')}`;
    }, [tickets]);

    const defaultPriority = useMemo(() => {
        if (tickets.length === 0) return 'MEDIUM';
        const maxWeight = Math.max(...tickets.map(t => {
            const opt = priorityOptions.find(p => p.value === t.priority);
            return opt?.weight || 2;
        }));
        const priority = priorityOptions.find(p => p.weight === maxWeight);
        return priority?.value || 'MEDIUM';
    }, [tickets]);

    const defaultAssigneeId = useMemo(() => {
        if (tickets.length === 0) return '';
        const assignedTicket = tickets.find(t => t.assignee_id);
        return assignedTicket?.assignee_id || '';
    }, [tickets]);

    const [title, setTitle] = useState(defaultTitle);
    const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
    const [priority, setPriority] = useState(defaultPriority);
    const [deleteOriginals, setDeleteOriginals] = useState(true);

    // Update defaults when tickets change
    useMemo(() => {
        setTitle(defaultTitle);
        setAssigneeId(defaultAssigneeId);
        setPriority(defaultPriority);
    }, [defaultTitle, defaultAssigneeId, defaultPriority]);

    // Build merged description
    const mergedDescription = useMemo(() => {
        const parts = tickets.map(ticket => {
            const assigneeInfo = ticket.assignee
                ? `> **담당자**: ${ticket.assignee.avatar || ''} ${ticket.assignee.name}`
                : '';
            const priorityInfo = `> **우선순위**: ${ticket.priority}`;

            return `## 📋 ${ticket.title}\n\n${assigneeInfo}\n${priorityInfo}\n\n${ticket.description || '*(설명 없음)*'}`;
        });

        return `# Merged Ticket Summary\n\n이 티켓은 ${tickets.length}개의 티켓을 병합하여 생성되었습니다.\n\n---\n\n${parts.join('\n\n---\n\n')}`;
    }, [tickets]);

    const memberOptions = [
        { value: '', label: 'Unassigned' },
        ...members
            .filter(m => m.role !== 'PM')
            .map(m => ({ value: m.id, label: `${m.avatar} ${m.name}` }))
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onMerge({
            title,
            description: mergedDescription,
            priority,
            assignee_id: assigneeId || null,
            deleteOriginals,
        });
        onClose();
    };

    if (tickets.length < 2) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="🔀 Merge Tickets"
            size="xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Selected tickets preview */}
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                        병합할 티켓 ({tickets.length}개 선택됨)
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                className="px-2 py-1 text-xs bg-[var(--bg-secondary)] rounded border border-[var(--border-primary)] flex items-center gap-1"
                            >
                                {ticket.assignee && (
                                    <span>{ticket.assignee.avatar}</span>
                                )}
                                <span className="text-[var(--text-primary)] max-w-[150px] truncate">
                                    {ticket.title}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Merge result configuration */}
                <Input
                    label="병합된 티켓 제목"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="병합된 티켓의 제목을 입력하세요"
                    required
                />

                <div className="grid grid-cols-2 gap-4">
                    <Select
                        label="대표 담당자"
                        value={assigneeId}
                        onChange={setAssigneeId}
                        options={memberOptions}
                    />
                    <Select
                        label="우선순위"
                        value={priority}
                        onChange={setPriority}
                        options={priorityOptions}
                    />
                </div>

                {/* Description preview */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                        병합된 설명 미리보기
                    </label>
                    <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] max-h-48 overflow-y-auto">
                        <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
                            {mergedDescription}
                        </pre>
                    </div>
                </div>

                {/* Options */}
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                    <input
                        type="checkbox"
                        checked={deleteOriginals}
                        onChange={(e) => setDeleteOriginals(e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                    />
                    원본 티켓 삭제
                </label>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-[var(--border-primary)]">
                    <div className="flex-1" />
                    <Button type="button" variant="ghost" onClick={onClose}>
                        취소
                    </Button>
                    <Button type="submit" variant="primary">
                        🔀 Merge & Create
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
