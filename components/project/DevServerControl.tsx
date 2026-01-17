'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Play, Square } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useProjects, type Project } from '@/lib/client-db';

interface DevServer {
    path: string;
    port?: number;
    pid?: number;
}

export function DevServerControl() {
    const projects = useProjects();
    const [runningServers, setRunningServers] = useState<DevServer[]>([]);
    const [starting, setStarting] = useState<string | null>(null);

    // Get the active project
    const activeProject = projects.find((p) => p.is_active) || null;

    // Fetch running servers status
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/projects/dev');
                const data = await res.json();
                setRunningServers(data.servers || []);
            } catch (err) {
                console.error('Failed to fetch dev server status:', err);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const isActiveProjectRunning = activeProject
        ? runningServers.some((s) => s.path.endsWith(activeProject.path.replace('~', '')) || activeProject.path.includes(s.path.split('/').pop() || ''))
        : false;

    const getServerForProject = (project: Project | null) => {
        if (!project) return null;
        const expandedPath = project.path.startsWith('~')
            ? project.path.replace('~', process.env.HOME || '')
            : project.path;
        return runningServers.find((s) => s.path === expandedPath || s.path.endsWith(project.path.replace('~/', '')));
    };

    const activeServer = getServerForProject(activeProject);

    const handleStart = async () => {
        if (!activeProject) return;

        setStarting(activeProject.path);
        try {
            const res = await fetch('/api/projects/dev', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath: activeProject.path, action: 'start' }),
            });

            const data = await res.json();

            if (data.success && data.port) {
                // Update local state immediately
                setRunningServers((prev) => [
                    ...prev.filter((s) => !s.path.includes(activeProject.path.replace('~/', ''))),
                    { path: activeProject.path, port: data.port, pid: data.pid },
                ]);
                // Open in browser
                window.open(`http://localhost:${data.port}`, '_blank');
            }
        } catch (err) {
            console.error('Failed to start dev server:', err);
        } finally {
            setStarting(null);
        }
    };

    const handleStop = async () => {
        if (!activeProject) return;

        try {
            await fetch('/api/projects/dev', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath: activeProject.path, action: 'stop' }),
            });

            // Update local state immediately
            setRunningServers((prev) =>
                prev.filter((s) => !s.path.includes(activeProject.path.replace('~/', '')))
            );
        } catch (err) {
            console.error('Failed to stop dev server:', err);
        }
    };

    const handleOpenBrowser = () => {
        if (activeServer?.port) {
            window.open(`http://localhost:${activeServer.port}`, '_blank');
        }
    };

    if (!activeProject) {
        return null;
    }

    const isStarting = starting === activeProject.path;
    const isRunning = !!activeServer;

    return (
        <div className="flex items-center gap-1">
            {isRunning ? (
                <>
                    <span
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400"
                        title="Running from dashboard"
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" />
                        :{activeServer?.port}
                    </span>
                    <button
                        onClick={handleOpenBrowser}
                        className="p-1.5 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 rounded-lg transition-colors"
                        title={`http://localhost:${activeServer?.port}`}
                    >
                        <Icon icon={ExternalLink} />
                    </button>
                    <button
                        onClick={handleStop}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
                        title="Stop dev server"
                    >
                        <Icon icon={Square} />
                    </button>
                </>
            ) : (
                <button
                    onClick={handleStart}
                    disabled={isStarting}
                    className={`p-1.5 rounded-lg transition-colors ${isStarting
                        ? 'text-[var(--text-muted)] cursor-not-allowed'
                        : 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300'
                        }`}
                    title="Start dev server (npm run dev)"
                >
                    {isStarting ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    ) : (
                        <Icon icon={Play} />
                    )}
                </button>
            )}
        </div>
    );
}
