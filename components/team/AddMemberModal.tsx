'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (member: { role: string; name: string; avatar: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }) => void;
}

const roleOptions = [
    { value: 'PM', label: 'Project Manager', emoji: '👔' },
    { value: 'FE_DEV', label: 'Frontend Developer', emoji: '🎨' },
    { value: 'BACKEND_DEV', label: 'Backend Developer', emoji: '⚙️' },
    { value: 'QA', label: 'QA Engineer', emoji: '🔍' },
    { value: 'DEVOPS', label: 'DevOps Engineer', emoji: '🚀' },
    { value: 'BUG_HUNTER', label: 'Bug Hunter', emoji: '🐛' },
];

const defaultPrompts: Record<string, string> = {
    PM: 'You are a Project Manager AI agent. Your responsibilities include:\n- Creating and managing project tickets\n- Assigning tasks to appropriate team members based on their expertise\n- Setting priorities and deadlines',
    FE_DEV: 'You are a Frontend Developer AI agent. Your responsibilities include:\n- Implementing user interfaces using React and Next.js\n- Writing clean, maintainable TypeScript/JavaScript code\n- Creating responsive and accessible designs',
    BACKEND_DEV: 'You are a Backend Developer AI agent. Your responsibilities include:\n- Designing and implementing REST APIs\n- Working with databases\n- Writing server-side logic and business rules',
    QA: 'You are a QA Engineer AI agent. Your responsibilities include:\n- Testing features moved to "In Review" status\n- Writing and executing test cases\n- Reporting bugs and issues',
    DEVOPS: 'You are a DevOps Engineer AI agent. Your responsibilities include:\n- Setting up CI/CD pipelines\n- Managing deployment processes\n- Configuring infrastructure and environments',
    BUG_HUNTER: 'You are a Bug Hunter AI agent. Your responsibilities include:\n- Quickly diagnosing and fixing bugs reported by users\n- Debugging both frontend and backend issues\n- Writing fixes with minimal side effects',
};

export function AddMemberModal({ isOpen, onClose, onSave }: AddMemberModalProps) {
    const [role, setRole] = useState('');
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [canGenerateImages, setCanGenerateImages] = useState(false);
    const [canLogScreenshots, setCanLogScreenshots] = useState(false);

    const handleRoleSelect = (selectedRole: string, emoji: string, prompt: string, roleValue?: string) => {
        setRole(selectedRole);
        setSystemPrompt(prompt);
        if (!avatar) {
            setAvatar(emoji);
        }
        const resolvedRole = roleValue ?? selectedRole;
        // Auto-enable for FE_DEV and BUG_HUNTER based on previous logic, but allow toggle
        setCanGenerateImages(resolvedRole === 'FE_DEV' || resolvedRole === 'BUG_HUNTER');
        setCanLogScreenshots(resolvedRole === 'FE_DEV' || resolvedRole === 'QA');
    };

    const handleSave = () => {
        if (role.trim() && name.trim() && systemPrompt.trim()) {
            onSave({
                role: role.trim(),
                name: name.trim(),
                avatar: avatar.trim() || '👤',
                system_prompt: systemPrompt.trim(),
                can_generate_images: canGenerateImages,
                can_log_screenshots: canLogScreenshots
            });
            // Reset form
            setRole('');
            setName('');
            setAvatar('');
            setSystemPrompt('');
            setCanGenerateImages(false);
            setCanLogScreenshots(false);
            onClose();
        }
    };

    const handleClose = () => {
        // Reset form on close
        setRole('');
        setName('');
        setAvatar('');
        setSystemPrompt('');
        setCanGenerateImages(false);
        setCanLogScreenshots(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Add Team Member" size="xl">
            <div className="space-y-4">
                {/* Role Input */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        Role *
                    </label>
                    <Input
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder="e.g., Frontend Specialist, Data Analyst, Designer"
                    />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Suggested roles (click to use):
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {roleOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleRoleSelect(option.label, option.emoji, defaultPrompts[option.value], option.value)}
                                className="px-2 py-1 text-xs rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] 
                                         border border-[var(--border-primary)] transition-colors"
                            >
                                {option.emoji} {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Name Input */}
                <Input
                    label="Name *"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Custom Frontend Agent"
                />

                {/* Avatar/Emoji Input */}
                <Input
                    label="Avatar (emoji)"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="e.g., 🌟 (leave empty for default 👤)"
                    maxLength={2}
                />

                {/* Capabilities */}
                <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                    <input
                        type="checkbox"
                        id="canGenerateImages"
                        checked={canGenerateImages}
                        onChange={(e) => setCanGenerateImages(e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                    />
                    <label htmlFor="canGenerateImages" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
                        🎨 Allow Image Generation Tool
                    </label>
                    <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                        Requires configured image settings
                    </span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                    <input
                        type="checkbox"
                        id="canLogScreenshots"
                        checked={canLogScreenshots}
                        onChange={(e) => setCanLogScreenshots(e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                    />
                    <label htmlFor="canLogScreenshots" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
                        📸 Allow Screenshot Logging
                    </label>
                    <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                        Adds screenshot requirement to agent prompt
                    </span>
                </div>

                {/* System Prompt */}
                <Textarea
                    label="System Prompt *"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={10}
                    placeholder="Enter the system prompt for this AI agent..."
                />

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!role.trim() || !name.trim() || !systemPrompt.trim()}
                    >
                        Create Member
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
