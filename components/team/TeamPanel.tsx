'use client';

import { useState } from 'react';
import { MemberCard, SystemPromptEditor } from './MemberCard';
import { AddMemberModal } from './AddMemberModal';
import { Button } from '@/components/ui/Button';

interface Member {
    id: string;
    role: string;
    name: string;
    avatar?: string | null;
    system_prompt: string;
    is_default: number;
    can_generate_images: number;
    can_log_screenshots: number;
}

interface TeamPanelProps {
    members: Member[];
    onUpdateMember: (member: Member) => void;
    onCreateMember: (data: { role: string; name: string; avatar: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }) => void;
    onDeleteMember: (id: string) => void;
    onOpenMarket?: () => void;
}

export function TeamPanel({ members, onUpdateMember, onCreateMember, onDeleteMember, onOpenMarket }: TeamPanelProps) {
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const handleMemberClick = (member: Member) => {
        setSelectedMember(member);
        setIsEditorOpen(true);
    };

    const handleSave = (member: Member) => {
        onUpdateMember(member);
    };

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="mb-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Team Members</h2>
                    <div className="flex gap-2">
                        {onOpenMarket && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onOpenMarket}
                            >
                                🏪 Market
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsAddModalOpen(true)}
                        >
                            + Add
                        </Button>
                    </div>
                </div>
                <p className="text-sm text-[var(--text-tertiary)]">Click to edit system prompts</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto min-h-0">
                {members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-4xl mb-3">🏪</div>
                        <p className="text-[var(--text-secondary)] mb-4">
                            팀에 에이전트가 없습니다
                        </p>
                        {onOpenMarket && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onOpenMarket}
                            >
                                Agent Market에서 추가하기
                            </Button>
                        )}
                    </div>
                ) : (
                    members.map((member) => (
                        <MemberCard
                            key={member.id}
                            member={member}
                            onClick={() => handleMemberClick(member)}
                        />
                    ))
                )}
            </div>

            <SystemPromptEditor
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                member={selectedMember}
                onSave={handleSave}
                onDelete={onDeleteMember}
            />

            <AddMemberModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={onCreateMember}
            />
        </div>
    );
}
