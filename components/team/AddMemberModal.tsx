'use client';

import { useState, useCallback } from 'react';
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
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [canGenerateImages, setCanGenerateImages] = useState(false);
    const [canLogScreenshots, setCanLogScreenshots] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleAIGenerate = useCallback(async () => {
        if (!name.trim() || isGenerating) return;
        setIsGenerating(true);
        try {
            const res = await fetch('/api/agent/generate-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = await res.json();
            if (data.success && data.prompt) {
                setSystemPrompt(data.prompt);
            } else {
                console.error('Failed to generate prompt:', data.error);
            }
        } catch (err) {
            console.error('Failed to generate prompt:', err);
        } finally {
            setIsGenerating(false);
        }
    }, [name, isGenerating]);

    const handleTemplateSelect = (emoji: string, prompt: string, roleValue: string) => {
        setSystemPrompt(prompt);
        if (!avatar) {
            setAvatar(emoji);
        }
        // Auto-enable capabilities based on role template
        setCanGenerateImages(roleValue === 'FE_DEV' || roleValue === 'BUG_HUNTER');
        setCanLogScreenshots(roleValue === 'FE_DEV' || roleValue === 'QA');
    };

    const handleSave = () => {
        if (name.trim() && systemPrompt.trim()) {
            onSave({
                role: name.trim(), // Use name as role
                name: name.trim(),
                avatar: avatar.trim() || '👤',
                system_prompt: systemPrompt.trim(),
                can_generate_images: canGenerateImages,
                can_log_screenshots: canLogScreenshots
            });
            // Reset form
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
        setName('');
        setAvatar('');
        setSystemPrompt('');
        setCanGenerateImages(false);
        setCanLogScreenshots(false);
        setIsGenerating(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Add Team Member" size="xl">
            <div className="space-y-4">
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
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[var(--text-primary)]">
                            System Prompt *
                        </label>
                        <button
                            type="button"
                            onClick={handleAIGenerate}
                            disabled={!name.trim() || isGenerating}
                            className="px-2.5 py-1 text-xs rounded-md bg-[var(--accent-primary)] text-white
                                     hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                                     transition-opacity flex items-center gap-1.5"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                'AI Generate'
                            )}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {roleOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleTemplateSelect(option.emoji, defaultPrompts[option.value], option.value)}
                                className="px-2 py-1 text-xs rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)]
                                         border border-[var(--border-primary)] transition-colors"
                            >
                                {option.emoji} {option.label}
                            </button>
                        ))}
                    </div>
                    <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={10}
                        placeholder="Enter the system prompt for this AI agent..."
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!name.trim() || !systemPrompt.trim()}
                    >
                        Create Member
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
