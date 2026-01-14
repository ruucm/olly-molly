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
}

export function TeamPanel({ members, onUpdateMember, onCreateMember, onDeleteMember }: TeamPanelProps) {
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
        <div className="h-full flex flex-col">
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Team Members</h2>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setIsAddModalOpen(true)}
                    >
                        + Add Member
                    </Button>
                </div>
                <p className="text-sm text-[var(--text-tertiary)]">Click to edit system prompts</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto">
                {members.map((member) => (
                    <MemberCard
                        key={member.id}
                        member={member}
                        onClick={() => handleMemberClick(member)}
                    />
                ))}
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
