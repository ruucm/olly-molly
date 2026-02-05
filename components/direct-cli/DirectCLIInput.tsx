'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { projectService, type Project } from '@/lib/client-db';

type Provider = 'claude' | 'opencode' | 'codex';

interface DirectCLIInputProps {
    onExecute: (params: { projectPath: string; prompt: string; provider: Provider }) => void;
    onStop: () => void;
    isExecuting: boolean;
    defaultProjectPath?: string;
}

export function DirectCLIInput({ onExecute, onStop, isExecuting, defaultProjectPath }: DirectCLIInputProps) {
    const [projectPath, setProjectPath] = useState(defaultProjectPath || '');
    const [prompt, setPrompt] = useState('');
    const [provider, setProvider] = useState<Provider>('claude');
    const [projects, setProjects] = useState<Project[]>([]);

    useEffect(() => {
        // Load projects for quick selection
        const allProjects = projectService.getAll();
        setProjects(allProjects);
    }, []);

    useEffect(() => {
        if (defaultProjectPath) {
            setProjectPath(defaultProjectPath);
        }
    }, [defaultProjectPath]);

    const handleExecute = () => {
        if (!projectPath.trim() || !prompt.trim()) return;
        onExecute({ projectPath: projectPath.trim(), prompt: prompt.trim(), provider });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleExecute();
        }
    };

    const canExecute = !isExecuting && projectPath.trim() && prompt.trim();

    return (
        <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-card)] space-y-4">
            {/* Project Path */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Project Path
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        placeholder="/path/to/project"
                        disabled={isExecuting}
                        className="flex-1 px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-50"
                    />
                    {projects.length > 0 && (
                        <select
                            value=""
                            onChange={(e) => {
                                if (e.target.value) {
                                    setProjectPath(e.target.value);
                                }
                            }}
                            disabled={isExecuting}
                            className="px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-50"
                        >
                            <option value="">Select project...</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.path}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Provider
                </label>
                <div className="flex gap-2">
                    {(['claude', 'opencode', 'codex'] as Provider[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setProvider(p)}
                            disabled={isExecuting}
                            className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                                provider === p
                                    ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                            }`}
                        >
                            {p === 'claude' && '🟠 Claude'}
                            {p === 'opencode' && '⚪️ OpenCode'}
                            {p === 'codex' && '🔵 Codex'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Prompt
                </label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your prompt here... (Cmd/Ctrl + Enter to execute)"
                    disabled={isExecuting}
                    rows={4}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-50 resize-none font-mono"
                />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                    {isExecuting ? 'Executing...' : 'Ready'}
                </span>
                <div className="flex gap-2">
                    {isExecuting ? (
                        <Button variant="secondary" size="sm" onClick={onStop}>
                            ⏹ Stop
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleExecute}
                            disabled={!canExecute}
                        >
                            ▶ Execute
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
