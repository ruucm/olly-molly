'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MemberCard } from './MemberCard';

interface Member {
    id: string;
    role: string;
    name: string;
    avatar?: string | null;
    profile_image?: string | null;
    system_prompt: string;
    is_default: number;
    can_generate_images: number;
    can_log_screenshots: number;
}

interface SortableMemberCardProps {
    member: Member;
    onClick: () => void;
}

export function SortableMemberCard({ member, onClick }: SortableMemberCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: member.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            <MemberCard
                member={member}
                onClick={() => !isDragging && onClick()}
            />
        </div>
    );
}
