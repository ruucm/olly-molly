'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { projectService, useProjects, type Project } from '@/lib/client-db';


interface ProjectSelectorProps {
    onProjectChange?: (project: Project | null) => void;
}

type TabType = 'existing' | 'create' | 'empty';

export function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('empty');

    // Existing project form
    const [newPath, setNewPath] = useState('');
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create project form
    const [createName, setCreateName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createProgress, setCreateProgress] = useState<string | null>(null);

    // Create empty project form
    const [emptyName, setEmptyName] = useState('');
    const [emptyParentPath, setEmptyParentPath] = useState('');
    const [emptyCreating, setEmptyCreating] = useState(false);
    const [emptyError, setEmptyError] = useState<string | null>(null);

    const storageKey = 'olly-active-project-id';
    const getStoredProjectId = () => {
        if (typeof window === 'undefined') return null;
        return sessionStorage.getItem(storageKey);
    };
    const persistProjectId = (id: string | null) => {
        if (typeof window === 'undefined') return;
        if (id) {
            sessionStorage.setItem(storageKey, id);
        } else {
            sessionStorage.removeItem(storageKey);
        }
    };

    const projects = useProjects();

    const resolvedActiveProject = useMemo(() => {
        const storedId = getStoredProjectId();
        const storedProject = storedId ? projects.find((p) => p.id === storedId) : null;
        const active = storedProject || projects.find((p) => p.is_active) || null;
        if (storedId && !storedProject) {
            persistProjectId(null);
        }
        if (active?.id && active.id !== storedId) {
            persistProjectId(active.id);
        }
        return active;
    }, [projects]);

    useEffect(() => {
        setActiveProject(resolvedActiveProject);
        onProjectChange?.(resolvedActiveProject);
    }, [resolvedActiveProject, onProjectChange]);

    const handleAddProject = async () => {
        if (!newPath.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: newPath.trim(),
                    name: newName.trim() || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error);
            }

            const project = projectService.create({
                name: data.name || newName.trim() || newPath.trim().split('/').pop() || 'Project',
                path: data.path || newPath.trim(),
                description: data.description || (data.is_git_repo ? 'Git repository' : 'Local project'),
            });
            setNewPath('');
            setNewName('');

            // Auto-select if it's the first project
            if (projects.length === 0) {
                handleSelectProject(project.id);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add project');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProject = async () => {
        if (!createName.trim()) return;

        setCreating(true);
        setCreateError(null);
        setCreateProgress('🚀 Next.js 프로젝트 생성 중... (1-2분 소요)');

        try {
            const res = await fetch('/api/projects/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName: createName.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to create project');
            }

            setCreateName('');
            setCreateProgress(null);

            // Auto-select the new project
            const project = data.project
                ? projectService.create({
                    name: data.project.name,
                    path: data.project.path,
                    description: data.project.description || 'Next.js project',
                })
                : projectService.create({
                    name: createName.trim(),
                    path: data.path || `~/Projects/${createName.trim()}`,
                    description: 'Next.js project',
                });
            handleSelectProject(project.id);

            alert(`✅ 프로젝트가 생성되었습니다!\n경로: ~/Projects/${createName.trim()}`);
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'Failed to create project');
        } finally {
            setCreating(false);
            setCreateProgress(null);
        }
    };

    const handleCreateEmptyProject = async () => {
        if (!emptyName.trim()) return;

        setEmptyCreating(true);
        setEmptyError(null);

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_empty',
                    name: emptyName.trim(),
                    parentPath: emptyParentPath.trim() || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to create project');
            }

            setEmptyName('');
            setEmptyParentPath('');

            const project = projectService.create({
                name: data.name || emptyName.trim(),
                path: data.path,
                description: data.description || 'Empty project',
            });
            handleSelectProject(project.id);
        } catch (err) {
            setEmptyError(err instanceof Error ? err.message : 'Failed to create project');
        } finally {
            setEmptyCreating(false);
        }
    };

    const handleSelectProject = async (id: string) => {
        try {
            projectService.setActive(id);
            persistProjectId(id);
        } catch (err) {
            console.error('Failed to select project:', err);
        }
    };

    const handleDeleteProject = async (id: string) => {
        try {
            projectService.delete(id);
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                   bg-[var(--bg-tertiary)] border border-[var(--border-primary)]
                   hover:border-[var(--border-secondary)] transition-colors"
            >
                <span>📁</span>
                <span className="text-[var(--text-secondary)]">
                    {activeProject ? activeProject.name : '프로젝트 선택'}
                </span>
                {activeProject && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
                )}
            </button>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="📁 프로젝트 관리" size="lg">
                <div className="space-y-4">
                    {/* Tabs */}
                    <div className="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
                        <button
                            onClick={() => setActiveTab('empty')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'empty'
                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                        >
                            🗂️ 새 빈 프로젝트
                        </button>
                        {/* <button
                            onClick={() => setActiveTab('existing')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'existing'
                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                        >
                            📂 기존 프로젝트 추가
                        </button> */}
                        <button
                            onClick={() => setActiveTab('create')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'create'
                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                        >
                            ✨ 새 Next.js 프로젝트
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'existing' && (
                        <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-3">
                            <Input
                                placeholder="/Users/username/my-project"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                label="프로젝트 경로"
                            />
                            <Input
                                placeholder="My Project (선택사항)"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                label="프로젝트 이름"
                            />
                            {error && (
                                <p className="text-sm text-red-400">{error}</p>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleAddProject}
                                disabled={!newPath.trim() || loading}
                            >
                                {loading ? '추가 중...' : '프로젝트 추가'}
                            </Button>
                        </div>
                    )}
                    {activeTab === 'create' && (
                        <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-3">
                            <p className="text-xs text-[var(--text-muted)]">
                                Next.js 프로젝트를 ~/Projects/ 폴더에 생성합니다
                            </p>
                            <Input
                                placeholder="my-awesome-app"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
                                label="프로젝트 이름"
                            />
                            <p className="text-xs text-[var(--text-muted)]">
                                📍 경로: ~/Projects/{createName || 'project-name'}
                            </p>
                            {createProgress && (
                                <p className="text-sm text-blue-400">{createProgress}</p>
                            )}
                            {createError && (
                                <p className="text-sm text-red-400">{createError}</p>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleCreateProject}
                                disabled={!createName.trim() || creating}
                            >
                                {creating ? '생성 중...' : '🚀 프로젝트 생성'}
                            </Button>
                            <p className="text-xs text-[var(--text-muted)]">
                                TypeScript, Tailwind CSS, ESLint, App Router 포함
                            </p>
                        </div>
                    )}
                    {activeTab === 'empty' && (
                        <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-3">
                            <p className="text-xs text-[var(--text-muted)]">
                                빈 프로젝트 폴더를 생성하고 등록합니다
                            </p>
                            <Input
                                placeholder="my-new-project"
                                value={emptyName}
                                onChange={(e) => setEmptyName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
                                label="프로젝트 이름"
                            />
                            <Input
                                placeholder="~/Projects (선택사항)"
                                value={emptyParentPath}
                                onChange={(e) => setEmptyParentPath(e.target.value)}
                                label="부모 경로"
                            />
                            <p className="text-xs text-[var(--text-muted)]">
                                📍 경로: {emptyParentPath.trim() || '~/Projects'}/{emptyName || 'project-name'}
                            </p>
                            {emptyError && (
                                <p className="text-sm text-red-400">{emptyError}</p>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleCreateEmptyProject}
                                disabled={!emptyName.trim() || emptyCreating}
                            >
                                {emptyCreating ? '생성 중...' : '📁 빈 프로젝트 생성'}
                            </Button>
                            <p className="text-xs text-[var(--text-muted)]">
                                폴더 생성 후 바로 프로젝트로 등록됩니다
                            </p>
                        </div>
                    )}

                    {/* Project list */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-[var(--text-secondary)]">등록된 프로젝트</h4>
                        {projects.length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                                등록된 프로젝트가 없습니다
                            </p>
                        ) : (
                            projects.map((project) => (
                                <div
                                    key={project.id}
                                    className={`p-3 rounded-lg border transition-colors ${project.is_active
                                        ? 'bg-indigo-500/10 border-indigo-500/30'
                                        : 'bg-[var(--bg-card)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-[var(--text-primary)]">{project.name}</span>
                                                {project.is_active ? (
                                                    <span className="px-1.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                                                        Active
                                                    </span>
                                                ) : ""}
                                            </div>
                                            <p className="text-xs text-[var(--text-muted)] truncate mt-1">{project.path}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!project.is_active && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleSelectProject(project.id)}
                                                >
                                                    선택
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteProject(project.id)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                삭제
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </Modal>
        </>
    );
}
