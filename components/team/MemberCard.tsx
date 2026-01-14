'use client';

import { useState, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ProfileImageModal } from './ProfileImageModal';

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

interface MemberCardProps {
    member: Member;
    onClick: () => void;
}

const roleImages: Record<string, string> = {
    PM: '/profiles/pm.png',
    FE_DEV: '/profiles/dev-frontend.png',
    BACKEND_DEV: '/profiles/dev-backend.png',
    QA: '/profiles/qa.png',
    BUG_HUNTER: '/profiles/dev-bughunter.jpg',
};

const roleLabels: Record<string, string> = {
    PM: 'Project Manager',
    FE_DEV: 'Frontend Developer',
    BACKEND_DEV: 'Backend Developer',
    QA: 'QA Engineer',
    DEVOPS: 'DevOps Engineer',
    BUG_HUNTER: 'Bug Hunter',
};

const roleColors: Record<string, 'default' | 'info' | 'success' | 'warning' | 'purple' | 'danger'> = {
    PM: 'purple',
    FE_DEV: 'info',
    BACKEND_DEV: 'success',
    QA: 'warning',
    DEVOPS: 'default',
    BUG_HUNTER: 'danger',
};

function getProfileImage(member: Member): string | undefined {
    // Custom profile image takes priority over default role image
    if (member.profile_image) {
        return member.profile_image;
    }
    return roleImages[member.role];
}

export function MemberCard({ member, onClick }: MemberCardProps) {
    const profileImage = getProfileImage(member);

    return (
        <div
            onClick={onClick}
            className="p-4 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] 
                 hover:border-[var(--border-secondary)] hover:bg-[var(--bg-card-hover)] 
                 cursor-pointer transition-all duration-200"
        >
            <div className="flex items-center gap-3">
                <Avatar
                    name={member.name}
                    src={profileImage}
                    emoji={!profileImage ? member.avatar : undefined}
                    badge={profileImage ? member.avatar : undefined}
                    size="lg"
                />
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--text-primary)] truncate">{member.name}</h3>
                    <Badge variant={roleColors[member.role]} size="sm">
                        {roleLabels[member.role] || member.role}
                    </Badge>
                </div>
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)] line-clamp-2">
                {member.system_prompt.slice(0, 100)}...
            </p>
        </div>
    );
}

interface SystemPromptEditorProps {
    isOpen: boolean;
    onClose: () => void;
    member: Member | null;
    onSave: (member: Member) => void;
    onProfileImageChange?: (id: string, imagePath: string) => void;
    onDelete?: (id: string) => void;
}


export function SystemPromptEditor({ isOpen, onClose, member, onSave, onProfileImageChange, onDelete }: SystemPromptEditorProps) {
    const [prompt, setPrompt] = useState(member?.system_prompt || '');
    const [canGenerateImages, setCanGenerateImages] = useState(member?.can_generate_images === 1);
    const [canLogScreenshots, setCanLogScreenshots] = useState(member?.can_log_screenshots === 1);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const profileImage = member ? (uploadedImage || getProfileImage(member)) : undefined;

    // Update prompt and image gen permission when member changes or modal opens
    useEffect(() => {
        if (member && isOpen) {
            setPrompt(member.system_prompt);
            setCanGenerateImages(member.can_generate_images === 1);
            setCanLogScreenshots(member.can_log_screenshots === 1);
        }
    }, [member, isOpen]);

    // Reset uploaded image when modal closes
    useEffect(() => {
        if (!isOpen) {
            setUploadedImage(null);
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (member) {
            // If onSave is async/supports capabilities, update it properly
            // Here we assume onSave handles content update, but for extended props we might need direct API call
            // or onSave update. Ideally onSave should pass all mutable fields.
            // For now, let's update capability separately if onSave doesn't support it, 
            // BUT actually page.tsx handleMemberUpdate only takes systemPrompt.
            // So we need to do a separate fetch for capability or update handleMemberUpdate.
            // Let's do a direct fetch here to ensure it works without changing page.tsx signature too much?
            // Or better, handleMemberUpdate in page.tsx could be flexible.
            // Let's rely on parallel update for now:

            try {
                const response = await fetch(`/api/members/${member.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_prompt: prompt,
                        can_generate_images: canGenerateImages ? 1 : 0,
                        can_log_screenshots: canLogScreenshots ? 1 : 0
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to update member');
                }

                const updatedMember = await response.json();
                onSave(updatedMember);
                onClose();
            } catch (error) {
                console.error('Failed to update member:', error);
                alert('Failed to update member');
            }
        }
    };

    const handleImageClick = () => {
        if (profileImage) {
            setIsImageModalOpen(true);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !member) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('memberId', member.id);

            const response = await fetch('/api/members/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (result.success && result.path) {
                // Add cache-busting query param
                const newImagePath = `${result.path}?t=${Date.now()}`;
                setUploadedImage(newImagePath);

                // Update member in database
                if (onProfileImageChange) {
                    onProfileImageChange(member.id, result.path);
                } else {
                    // Fallback: update via PATCH
                    await fetch(`/api/members/${member.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profile_image: result.path }),
                    });
                }
            } else {
                console.error('Upload failed:', result.error);
                alert('Failed to upload image: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${member?.name}'s System Prompt`} size="xl">
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-[var(--bg-tertiary)] rounded-lg">
                        {member && (
                            <>
                                {/* Clickable profile image */}
                                <div
                                    className="relative group cursor-pointer"
                                    onClick={handleImageClick}
                                >
                                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--border-primary)] hover:border-[var(--accent-primary)] transition-colors">
                                        {profileImage ? (
                                            <img
                                                src={profileImage}
                                                alt={member.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Avatar
                                                name={member.name}
                                                emoji={member.avatar}
                                                size="lg"
                                            />
                                        )}
                                    </div>
                                    {/* Zoom icon overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            <line x1="11" y1="8" x2="11" y2="14"></line>
                                            <line x1="8" y1="11" x2="14" y2="11"></line>
                                        </svg>
                                    </div>
                                    {/* Role emoji badge */}
                                    {member.avatar && (
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-sm">
                                            {member.avatar}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1">
                                    <p className="font-medium text-[var(--text-primary)] text-lg">{member.name}</p>
                                    <p className="text-sm text-[var(--text-tertiary)]">{roleLabels[member.role] || member.role}</p>
                                </div>

                                {/* Upload button */}
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    <Button
                                        variant="secondary"
                                        onClick={handleUploadClick}
                                        disabled={isUploading}
                                    >
                                        {isUploading ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="17 8 12 3 7 8"></polyline>
                                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                                </svg>
                                                Change Image
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Capabilities */}
                    <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <input
                            type="checkbox"
                            id="editCanGenerateImages"
                            checked={canGenerateImages}
                            onChange={(e) => setCanGenerateImages(e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                        />
                        <label htmlFor="editCanGenerateImages" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
                            🎨 Allow Image Generation Tool
                        </label>
                        <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                            Requires configured image settings
                        </span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <input
                            type="checkbox"
                            id="editCanLogScreenshots"
                            checked={canLogScreenshots}
                            onChange={(e) => setCanLogScreenshots(e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                        />
                        <label htmlFor="editCanLogScreenshots" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
                            📸 Allow Screenshot Logging
                        </label>
                        <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                            Adds screenshot requirement to agent prompt
                        </span>
                    </div>

                    {/* System Prompt Editor */}
                    <Textarea
                        label="System Prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={12}
                        placeholder="Enter the system prompt for this AI agent..."
                    />

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        {member && member.is_default === 0 && onDelete && (
                            <Button
                                variant="danger"
                                onClick={() => {
                                    if (confirm(`Are you sure you want to delete ${member.name}? This action cannot be undone.`)) {
                                        onDelete(member.id);
                                        onClose();
                                    }
                                }}
                            >
                                Delete Member
                            </Button>
                        )}
                        <Button variant="primary" onClick={handleSave}>Save Changes</Button>
                    </div>
                </div>
            </Modal>

            {/* Profile image modal for enlarged view */}
            {member && profileImage && (
                <ProfileImageModal
                    isOpen={isImageModalOpen}
                    onClose={() => setIsImageModalOpen(false)}
                    imageSrc={profileImage}
                    name={member.name}
                />
            )}
        </>
    );
}
