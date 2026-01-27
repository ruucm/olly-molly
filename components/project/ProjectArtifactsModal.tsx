'use client';

import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from '@/components/ui/Modal';
import { ResizablePane } from '@/components/ui/ResizablePane';
import { Button } from '@/components/ui/Button';
import { Download, Upload, Trash2, Image, FileText, Table, File, Check, AlertCircle } from 'lucide-react';

interface ProjectArtifactsModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string | null;
    projectName?: string | null;
    projectPath?: string | null;
}

interface FileEntry {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    modifiedAt: string;
    extension?: string;
}

interface DirectoryResponse {
    type: 'directory';
    path: string;
    entries: FileEntry[];
}

interface FileResponse {
    type: 'file';
    path: string;
    entry: FileEntry;
    content: string | null;
    isBinary: boolean;
    truncated: boolean;
}

type FileApiResponse = DirectoryResponse | FileResponse;

interface SiteEntry {
    id: string;
    name?: string;
    path: string;
}

interface GitStatus {
    head: string;
    branch: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
    isDirty: boolean;
    isDetached: boolean;
}

interface GitCommit {
    hash: string;
    shortHash: string;
    parents: string[];
    author: string;
    date: string;
    relativeDate: string;
    subject: string;
    refs: string[];
}

interface GitResponse {
    isGitRepo: boolean;
    graphRef?: string;
    status?: GitStatus;
    commits?: GitCommit[];
}

interface UploadedFile {
    name: string;
    path: string;
    size: number;
    type: 'image' | 'document' | 'spreadsheet' | 'unknown';
    createdAt: string;
    modifiedAt: string;
}

const ALLOWED_UPLOAD_EXTENSIONS = '.md,.txt,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx']);
const CODE_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'yml', 'yaml', 'md', 'mdx',
    'sh', 'bash', 'zsh', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp',
    'sql', 'toml', 'ini', 'env', 'txt',
]);

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveRelativePath(basePath: string, relativePath: string): string {
    if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('data:')) {
        return relativePath;
    }
    if (relativePath.startsWith('//')) {
        return relativePath;
    }
    if (relativePath.startsWith('/')) {
        return relativePath.replace(/^\/+/, '');
    }
    const cleanedBase = basePath.replace(/\\/g, '/');
    const baseSegments = cleanedBase.split('/').slice(0, -1);
    const relativeSegments = relativePath.replace(/\\/g, '/').split('/');
    const nextSegments = [...baseSegments];
    for (const segment of relativeSegments) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            nextSegments.pop();
            continue;
        }
        nextSegments.push(segment);
    }
    return nextSegments.join('/');
}

interface MarkdownImageProps {
    src: string;
    alt: string;
    projectId: string;
    projectPath?: string | null;
    filePath: string;
}

const MarkdownImage = memo(function MarkdownImage({
    src,
    alt,
    projectId,
    projectPath,
    filePath,
}: MarkdownImageProps) {
    if (!src) return null;
    const resolved = resolveRelativePath(filePath, src);
    const projectPathParam = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : '';
    const imageSrc = resolved.startsWith('http') || resolved.startsWith('data:')
        ? resolved
        : `/api/projects/files/raw?projectId=${projectId}${projectPathParam}&path=${encodeURIComponent(resolved)}`;
    return (
        <img
            src={imageSrc}
            alt={alt}
            loading="lazy"
        />
    );
});

interface MarkdownViewerProps {
    content: string;
    projectId: string;
    projectPath?: string | null;
    filePath: string;
}

const MarkdownViewer = memo(function MarkdownViewer({
    content,
    projectId,
    projectPath,
    filePath,
}: MarkdownViewerProps) {
    const components = useMemo(() => ({
        img: (props: React.ComponentPropsWithoutRef<'img'>) => {
            const src = typeof props.src === 'string' ? props.src : '';
            const alt = props.alt || '';
            return (
                <MarkdownImage
                    src={src}
                    alt={alt}
                    projectId={projectId}
                    projectPath={projectPath}
                    filePath={filePath}
                />
            );
        },
        a: (props: React.ComponentPropsWithoutRef<'a'>) => (
            <a href={props.href} target="_blank" rel="noreferrer">
                {props.children}
            </a>
        ),
    }), [projectId, projectPath, filePath]);

    return (
        <div className="markdown-viewer max-w-4xl mx-auto">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

export function ProjectArtifactsModal({
    isOpen,
    onClose,
    projectId,
    projectName,
    projectPath,
}: ProjectArtifactsModalProps) {
    const [activeTab, setActiveTab] = useState<'files' | 'sites' | 'git' | 'upload'>('files');
    const [previewOnly, setPreviewOnly] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileResponse | null>(null);
    const [directoryLoading, setDirectoryLoading] = useState(false);
    const [fileLoading, setFileLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sites, setSites] = useState<SiteEntry[]>([]);
    const [sitesLoading, setSitesLoading] = useState(false);
    const [sitesError, setSitesError] = useState<string | null>(null);
    const [gitData, setGitData] = useState<GitResponse | null>(null);
    const [gitLoading, setGitLoading] = useState(false);
    const [gitError, setGitError] = useState<string | null>(null);
    const [gitCheckoutTarget, setGitCheckoutTarget] = useState<string | null>(null);
    const [gitActionLoading, setGitActionLoading] = useState<string | null>(null);
    const [gitCommitMessage, setGitCommitMessage] = useState('');
    const [gitStashMessage, setGitStashMessage] = useState('');
    const [downloading, setDownloading] = useState(false);

    // Upload state
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadResults, setUploadResults] = useState<{ name: string; success: boolean; error?: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const breadcrumbs = useMemo(() => {
        if (!currentPath) {
            return [{ label: 'root', path: '' }];
        }
        const segments = currentPath.split('/').filter(Boolean);
        const crumbs = [{ label: 'root', path: '' }];
        segments.forEach((segment, index) => {
            const path = segments.slice(0, index + 1).join('/');
            crumbs.push({ label: segment, path });
        });
        return crumbs;
    }, [currentPath]);

    const loadDirectory = useCallback(async (targetPath: string) => {
        if (!projectId) return;
        setDirectoryLoading(true);
        setError(null);
        try {
            const projectPathParam = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : '';
            const res = await fetch(`/api/projects/files?projectId=${projectId}${projectPathParam}&path=${encodeURIComponent(targetPath)}`);
            const data = (await res.json()) as FileApiResponse;
            if (!res.ok || data.type !== 'directory') {
                const message = (data as { error?: string }).error || 'Failed to load directory';
                throw new Error(message);
            }
            setCurrentPath(targetPath);
            setEntries(data.entries);
            setSelectedFile(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load directory');
        } finally {
            setDirectoryLoading(false);
        }
    }, [projectId, projectPath]);

    const loadFile = useCallback(async (targetPath: string) => {
        if (!projectId) return;
        setFileLoading(true);
        setError(null);
        try {
            const projectPathParam = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : '';
            const res = await fetch(`/api/projects/files?projectId=${projectId}${projectPathParam}&path=${encodeURIComponent(targetPath)}`);
            const data = (await res.json()) as FileApiResponse;
            if (!res.ok || data.type !== 'file') {
                const message = (data as { error?: string }).error || 'Failed to load file';
                throw new Error(message);
            }
            setSelectedFile(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load file');
        } finally {
            setFileLoading(false);
        }
    }, [projectId, projectPath]);

    useEffect(() => {
        if (!isOpen) return;
        setActiveTab('files');
        setPreviewOnly(false);
        setCurrentPath('');
        setEntries([]);
        setSelectedFile(null);
        setSites([]);
        setSitesError(null);
        setGitData(null);
        setGitError(null);
        setGitCheckoutTarget(null);
        setGitActionLoading(null);
        setGitCommitMessage('');
        setGitStashMessage('');
        if (projectId) {
            loadDirectory('');
        }
    }, [isOpen, projectId, loadDirectory]);

    const loadSites = useCallback(async () => {
        if (!projectId) return;
        setSitesLoading(true);
        setSitesError(null);
        try {
            const projectPathParam = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : '';
            const res = await fetch(`/api/projects/sites?projectId=${projectId}${projectPathParam}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to load sites');
            }
            setSites(data.sites || []);
        } catch (err) {
            setSitesError(err instanceof Error ? err.message : 'Failed to load sites');
        } finally {
            setSitesLoading(false);
        }
    }, [projectId, projectPath]);

    const loadGit = useCallback(async () => {
        if (!projectId) return;
        setGitLoading(true);
        setGitError(null);
        try {
            const projectPathParam = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : '';
            const res = await fetch(`/api/projects/git?projectId=${projectId}${projectPathParam}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to load git history');
            }
            setGitData(data);
        } catch (err) {
            setGitError(err instanceof Error ? err.message : 'Failed to load git history');
        } finally {
            setGitLoading(false);
        }
    }, [projectId, projectPath]);

    const loadUploadedFiles = useCallback(async () => {
        if (!projectPath) return;
        setUploadLoading(true);
        try {
            const res = await fetch(`/api/projects/upload?projectPath=${encodeURIComponent(projectPath)}`);
            const data = await res.json();
            if (data.files) {
                setUploadedFiles(data.files);
            }
        } catch (err) {
            console.error('Failed to fetch uploaded files:', err);
        } finally {
            setUploadLoading(false);
        }
    }, [projectPath]);

    const handleUpload = useCallback(async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0 || !projectPath) return;
        setUploading(true);
        setUploadResults([]);

        const formData = new FormData();
        formData.append('projectPath', projectPath);
        Array.from(fileList).forEach(file => {
            formData.append('files', file);
        });

        try {
            const res = await fetch('/api/projects/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.results) {
                setUploadResults(data.results.map((r: { name: string; success: boolean; error?: string }) => ({
                    name: r.name,
                    success: r.success,
                    error: r.error,
                })));
            }
            await loadUploadedFiles();
        } catch (err) {
            console.error('Upload failed:', err);
            setUploadResults([{ name: 'Upload', success: false, error: 'Upload failed' }]);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [projectPath, loadUploadedFiles]);

    const handleDeleteUploadedFile = useCallback(async (filename: string) => {
        if (!projectPath || !confirm(`"${filename}" 파일을 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch('/api/projects/upload', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath, filename }),
            });
            if (res.ok) {
                await loadUploadedFiles();
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }, [projectPath, loadUploadedFiles]);

    const getUploadFileIcon = (type: UploadedFile['type']) => {
        switch (type) {
            case 'image': return <Image className="w-5 h-5 text-purple-400" />;
            case 'document': return <FileText className="w-5 h-5 text-blue-400" />;
            case 'spreadsheet': return <Table className="w-5 h-5 text-green-400" />;
            default: return <File className="w-5 h-5 text-gray-400" />;
        }
    };

    useEffect(() => {
        if (!isOpen || activeTab !== 'sites') return;
        if (projectId) {
            loadSites();
        }
    }, [activeTab, isOpen, projectId, loadSites]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'git') return;
        if (projectId) {
            loadGit();
        }
    }, [activeTab, isOpen, projectId, loadGit]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'upload') return;
        if (projectPath) {
            loadUploadedFiles();
            setUploadResults([]);
        }
    }, [activeTab, isOpen, projectPath, loadUploadedFiles]);

    const handleDownloadProject = useCallback(async (downloadPath?: string) => {
        if (!projectPath) return;
        setDownloading(true);
        try {
            const params = new URLSearchParams();
            params.set('projectPath', projectPath);
            if (downloadPath) {
                params.set('path', downloadPath);
            }
            const res = await fetch(`/api/projects/files/download?${params.toString()}`);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Download failed');
            }
            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition');
            let filename = downloadPath
                ? `${downloadPath.split('/').pop() || 'files'}.zip`
                : `${projectName || 'project'}.zip`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) {
                    filename = decodeURIComponent(match[1]);
                }
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
            setError(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setDownloading(false);
        }
    }, [projectPath, projectName]);

    const handleEntryClick = (entry: FileEntry) => {
        if (entry.type === 'directory') {
            loadDirectory(entry.path);
            return;
        }
        loadFile(entry.path);
    };

    const handleQuickOpen = (path: string, type: 'file' | 'directory') => {
        if (type === 'directory') {
            loadDirectory(path);
            return;
        }
        loadFile(path);
    };

    const handleGitCheckout = useCallback(async (target: string) => {
        if (!projectId) return;
        setGitCheckoutTarget(target);
        setGitActionLoading('checkout');
        setGitError(null);
        try {
            const res = await fetch('/api/projects/git', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, projectPath, action: 'checkout', target }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to checkout commit');
            }
            await loadGit();
        } catch (err) {
            setGitError(err instanceof Error ? err.message : 'Failed to checkout commit');
        } finally {
            setGitCheckoutTarget(null);
            setGitActionLoading(null);
        }
    }, [projectId, loadGit]);

    const handleGitAction = useCallback(async (action: 'init' | 'stash' | 'commit', payload?: Record<string, string>) => {
        if (!projectId) return;
        setGitActionLoading(action);
        setGitError(null);
        try {
            const res = await fetch('/api/projects/git', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, projectPath, action, ...payload }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Git action failed');
            }
            if (action === 'commit') {
                setGitCommitMessage('');
            }
            if (action === 'stash') {
                setGitStashMessage('');
            }
            await loadGit();
        } catch (err) {
            setGitError(err instanceof Error ? err.message : 'Git action failed');
        } finally {
            setGitActionLoading(null);
        }
    }, [projectId, projectPath, loadGit]);

    const selectedExtension = selectedFile?.entry.extension || '';
    const isMarkdown = MARKDOWN_EXTENSIONS.has(selectedExtension);
    const isImage = IMAGE_EXTENSIONS.has(selectedExtension);
    const isCode = CODE_EXTENSIONS.has(selectedExtension);

    const fileMeta = selectedFile?.entry;
    const fileContent = selectedFile?.content ?? '';
    const filePreviewUrl = selectedFile
        ? `/api/projects/files/raw?projectId=${projectId || ''}${projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : ''}&path=${encodeURIComponent(selectedFile.entry.path)}`
        : '';

    const rootArtifacts = currentPath === ''
        ? entries.filter(entry => ['AGENT_WORK_LOG.md', '.agent-screenshots'].includes(entry.name))
        : [];

    const gitCommits = gitData?.commits || [];
    const gitStatus = gitData?.status;
    const headHash = gitStatus?.head;
    const headIndex = headHash ? gitCommits.findIndex(commit => commit.hash === headHash) : -1;
    const headCommit = headIndex >= 0 ? gitCommits[headIndex] : null;
    const prevCommit = headIndex >= 0 ? gitCommits[headIndex + 1] : null;
    const nextCommit = headIndex > 0 ? gitCommits[headIndex - 1] : null;
    const isCheckingOut = gitCheckoutTarget !== null;
    const branchLabel = gitStatus?.branch || (gitStatus?.isDetached ? '분리된 HEAD' : '알 수 없음');
    const headLabel = headCommit?.shortHash || (headHash ? headHash.slice(0, 7) : '');
    const syncLabel = gitStatus
        ? (gitStatus.ahead || gitStatus.behind)
            ? `앞섬 ${gitStatus.ahead} · 뒤처짐 ${gitStatus.behind}`
            : '동기화됨'
        : '';
    const checkoutDisabled = isCheckingOut || gitLoading || gitActionLoading !== null || !gitStatus || gitStatus.isDirty;
    const canCommit = !!gitStatus && gitData?.isGitRepo && gitStatus.isDirty && gitCommitMessage.trim().length > 0;
    const canStash = !!gitStatus && gitData?.isGitRepo && gitStatus.isDirty;

    const modalTitle = previewOnly ? undefined : '📎 프로젝트 아티팩트';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="full">
            <div className="h-full flex flex-col">
                {!previewOnly && (
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border-primary)] space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div className="text-xs text-[var(--text-muted)] truncate">
                                {projectName && <span className="text-[var(--text-secondary)]">{projectName}</span>}
                                {projectPath && <span className="ml-2 hidden md:inline">{projectPath}</span>}
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto">
                                {activeTab === 'files' && selectedFile && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPreviewOnly(true)}
                                        className="flex-shrink-0"
                                    >
                                        프리뷰만
                                    </Button>
                                )}
                                <div className="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg flex-shrink-0">
                                    <button
                                        onClick={() => setActiveTab('files')}
                                        className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'files'
                                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        파일
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('git')}
                                        className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'git'
                                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        Git
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('sites')}
                                        className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'sites'
                                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        사이트
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('upload')}
                                        className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${activeTab === 'upload'
                                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                        <span className="hidden md:inline">업로드</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {activeTab === 'files' && projectId && (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                                        {breadcrumbs.map((crumb, index) => (
                                            <button
                                                key={crumb.path || 'root'}
                                                onClick={() => loadDirectory(crumb.path)}
                                                className="hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                {index > 0 && <span className="mx-1 text-[var(--text-muted)]">/</span>}
                                                {crumb.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleDownloadProject(currentPath || undefined)}
                                            disabled={downloading || directoryLoading}
                                        >
                                            <Download className="w-3.5 h-3.5 mr-1" />
                                            {downloading ? '다운로드 중...' : currentPath ? '폴더 다운로드' : '전체 다운로드'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => loadDirectory(currentPath)}
                                            disabled={directoryLoading}
                                        >
                                            새로고침
                                        </Button>
                                    </div>
                                </div>

                                {rootArtifacts.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="text-[var(--text-muted)]">빠른 열기</span>
                                        {rootArtifacts.map(entry => (
                                            <button
                                                key={entry.path}
                                                onClick={() => handleQuickOpen(entry.path, entry.type)}
                                                className="px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                            >
                                                {entry.name}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => handleQuickOpen('public/generated', 'directory')}
                                            className="px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                            public/generated
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'files' && (
                        <div className="h-full">
                            {!projectId && !previewOnly && (
                                <div className="p-6 text-sm text-[var(--text-muted)]">프로젝트를 먼저 선택해주세요.</div>
                            )}
                            {projectId && (
                                <>
                                    {!previewOnly && (
                                        <div className="h-full border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                            <ResizablePane
                                                defaultLeftWidth={35}
                                                minLeftWidth={25}
                                                minRightWidth={40}
                                                left={
                                                    <div className="h-full overflow-auto">
                                                        {directoryLoading ? (
                                                            <div className="p-4 text-xs text-[var(--text-muted)]">불러오는 중...</div>
                                                        ) : (
                                                            <div className="divide-y divide-[var(--border-primary)]">
                                                                {entries.length === 0 && (
                                                                    <div className="p-4 text-xs text-[var(--text-muted)]">파일이 없습니다.</div>
                                                                )}
                                                                {entries.map(entry => (
                                                                    <button
                                                                        key={entry.path}
                                                                        onClick={() => handleEntryClick(entry)}
                                                                        className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors ${selectedFile?.entry.path === entry.path
                                                                            ? 'bg-[var(--bg-card)] text-[var(--text-primary)]'
                                                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                                                            }`}
                                                                    >
                                                                        <span className="flex items-center gap-2 truncate">
                                                                            <span>{entry.type === 'directory' ? '📁' : '📄'}</span>
                                                                            <span className="truncate">{entry.name}</span>
                                                                        </span>
                                                                        <span className="text-[10px] text-[var(--text-muted)]">
                                                                            {entry.type === 'directory' ? 'folder' : formatBytes(entry.size)}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                }
                                                right={
                                                    <div className="h-full flex flex-col">
                                                        {error && (
                                                            <div className="px-4 py-2 text-xs text-red-500 border-b border-[var(--border-primary)]">
                                                                {error}
                                                            </div>
                                                        )}
                                                        {!selectedFile && !error && (
                                                            <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
                                                                파일을 선택하세요.
                                                            </div>
                                                        )}
                                                        {selectedFile && (
                                                            <>
                                                                <div className="px-4 py-2 border-b border-[var(--border-primary)] text-xs text-[var(--text-muted)] flex items-center justify-between">
                                                                    <span className="truncate">{fileMeta?.path || fileMeta?.name}</span>
                                                                    <span className="ml-2">
                                                                        {fileMeta ? formatBytes(fileMeta.size) : ''}
                                                                        {selectedFile.truncated && ' · 일부만 표시됨'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex-1 overflow-auto bg-[var(--bg-card)]">
                                                                    {fileLoading && (
                                                                        <div className="p-4 text-xs text-[var(--text-muted)]">불러오는 중...</div>
                                                                    )}
                                                                    {!fileLoading && selectedFile.isBinary && !isImage && (
                                                                        <div className="p-4 text-xs text-[var(--text-muted)]">
                                                                            이 파일은 미리보기를 지원하지 않습니다.
                                                                        </div>
                                                                    )}
                                                                    {!fileLoading && isImage && (
                                                                        <div className="p-6 flex items-start justify-center">
                                                                            <img
                                                                                src={filePreviewUrl}
                                                                                alt={fileMeta?.name || 'preview'}
                                                                                className="max-w-full rounded-lg border border-[var(--border-primary)]"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                    {!fileLoading && !selectedFile.isBinary && isMarkdown && (
                                                                        <div className="p-6">
                                                                            <MarkdownViewer
                                                                                content={fileContent}
                                                                                projectId={projectId || ''}
                                                                                projectPath={projectPath}
                                                                                filePath={selectedFile.entry.path}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                    {!fileLoading && !selectedFile.isBinary && !isMarkdown && (
                                                                        <div className="p-6">
                                                                            <pre className={`code-viewer ${isCode ? 'code-viewer--source' : ''}`}>
                                                                                <code>{fileContent}</code>
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                }
                                            />
                                        </div>
                                    )}

                                    {previewOnly && (
                                        <div className="h-full bg-[var(--bg-card)] relative">
                                            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => setPreviewOnly(false)}
                                                >
                                                    목록 보기
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={onClose}
                                                >
                                                    닫기
                                                </Button>
                                            </div>
                                            <div className="h-full overflow-auto">
                                                {!selectedFile && (
                                                    <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                                                        파일을 선택하세요.
                                                    </div>
                                                )}
                                                {selectedFile && (
                                                    <div className="h-full">
                                                        {!fileLoading && selectedFile.isBinary && !isImage && (
                                                            <div className="p-6 text-xs text-[var(--text-muted)]">
                                                                이 파일은 미리보기를 지원하지 않습니다.
                                                            </div>
                                                        )}
                                                        {!fileLoading && isImage && (
                                                            <div className="p-6 flex items-start justify-center">
                                                                <img
                                                                    src={filePreviewUrl}
                                                                    alt={fileMeta?.name || 'preview'}
                                                                    className="max-w-full rounded-lg border border-[var(--border-primary)]"
                                                                />
                                                            </div>
                                                        )}
                                                        {!fileLoading && !selectedFile.isBinary && isMarkdown && (
                                                            <div className="p-6">
                                                                <MarkdownViewer
                                                                    content={fileContent}
                                                                    projectId={projectId || ''}
                                                                    projectPath={projectPath}
                                                                    filePath={selectedFile.entry.path}
                                                                />
                                                            </div>
                                                        )}
                                                        {!fileLoading && !selectedFile.isBinary && !isMarkdown && (
                                                            <div className="p-6">
                                                                <pre className={`code-viewer ${isCode ? 'code-viewer--source' : ''}`}>
                                                                    <code>{fileContent}</code>
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'git' && (
                        <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
                            <div className="p-6 space-y-6">
                                {!projectId && (
                                    <div className="text-sm text-[var(--text-muted)]">프로젝트를 먼저 선택해주세요.</div>
                                )}
                                {projectId && (
                                    <div className="space-y-5">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-[var(--text-muted)]">
                                                커밋 그래프와 이동을 한눈에 관리합니다.
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={loadGit}
                                                disabled={gitLoading}
                                            >
                                                새로고침
                                            </Button>
                                        </div>
                                        {gitError && (
                                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">
                                                {gitError}
                                            </div>
                                        )}
                                        {gitLoading && !gitData && (
                                            <div className="text-xs text-[var(--text-muted)]">불러오는 중...</div>
                                        )}
                                        {gitData && !gitData.isGitRepo && (
                                            <div className="space-y-3">
                                                <div className="text-sm text-[var(--text-muted)]">
                                                    이 프로젝트는 Git 저장소가 아닙니다.
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleGitAction('init')}
                                                    disabled={gitActionLoading !== null}
                                                >
                                                    git init
                                                </Button>
                                            </div>
                                        )}
                                        {gitData?.isGitRepo && gitStatus && (
                                            <div className="space-y-5">
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                                                    <span className="px-2.5 py-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                                                        브랜치: {branchLabel}
                                                    </span>
                                                    <span className="px-2.5 py-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                                                        HEAD: {headLabel || '알 수 없음'}
                                                    </span>
                                                    {gitStatus.upstream && (
                                                        <span className="px-2.5 py-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                                                            업스트림: {gitStatus.upstream}
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`px-2.5 py-1 rounded-full border bg-[var(--bg-card)] ${gitStatus.isDirty
                                                            ? 'border-[var(--priority-high-text)] text-[var(--priority-high-text)]'
                                                            : 'border-[var(--border-primary)] text-[var(--text-secondary)]'
                                                            }`}
                                                    >
                                                        {gitStatus.isDirty ? '변경사항 있음' : '깨끗함'}
                                                    </span>
                                                    {syncLabel && (
                                                        <span className="px-2.5 py-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                                                            {syncLabel}
                                                        </span>
                                                    )}
                                                    {gitData.graphRef && (
                                                        <span className="px-2.5 py-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                                                            그래프 기준: {gitData.graphRef}
                                                        </span>
                                                    )}
                                                </div>
                                                {gitStatus.isDirty && (
                                                    <div className="rounded-lg border border-[var(--priority-high-text)] bg-[var(--priority-high)] px-4 py-2 text-xs text-[var(--priority-high-text)]">
                                                        변경사항이 있어 커밋 이동이 비활성화되었습니다. 커밋하거나 스태시 후 다시 시도하세요.
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 space-y-3">
                                                        <div className="text-sm font-medium text-[var(--text-primary)]">변경사항 스태시</div>
                                                        <input
                                                            type="text"
                                                            value={gitStashMessage}
                                                            onChange={(e) => setGitStashMessage(e.target.value)}
                                                            placeholder="스태시 메시지 (선택)"
                                                            className="w-full rounded-lg border border-[var(--border-primary)] bg-transparent px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                                                        />
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleGitAction('stash', { message: gitStashMessage })}
                                                            disabled={!canStash || gitActionLoading !== null}
                                                        >
                                                            {gitActionLoading === 'stash' ? '스태시 중...' : 'stash'}
                                                        </Button>
                                                    </div>
                                                    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 space-y-3">
                                                        <div className="text-sm font-medium text-[var(--text-primary)]">변경사항 커밋</div>
                                                        <input
                                                            type="text"
                                                            value={gitCommitMessage}
                                                            onChange={(e) => setGitCommitMessage(e.target.value)}
                                                            placeholder="커밋 메시지 입력"
                                                            className="w-full rounded-lg border border-[var(--border-primary)] bg-transparent px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                                                        />
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => handleGitAction('commit', { message: gitCommitMessage })}
                                                            disabled={!canCommit || gitActionLoading !== null}
                                                        >
                                                            {gitActionLoading === 'commit' ? '커밋 중...' : 'commit'}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => prevCommit && handleGitCheckout(prevCommit.hash)}
                                                        disabled={!prevCommit || checkoutDisabled}
                                                        className="w-full text-left rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                                                            <span>이전 커밋</span>
                                                            <span>{prevCommit?.shortHash || '-'}</span>
                                                        </div>
                                                        <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                                                            {prevCommit ? prevCommit.subject : '이동할 이전 커밋이 없습니다.'}
                                                        </div>
                                                        {prevCommit && (
                                                            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                                                                {prevCommit.author} · {prevCommit.relativeDate}
                                                            </div>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => nextCommit && handleGitCheckout(nextCommit.hash)}
                                                        disabled={!nextCommit || checkoutDisabled}
                                                        className="w-full text-left rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                                                            <span>다음 커밋</span>
                                                            <span>{nextCommit?.shortHash || '-'}</span>
                                                        </div>
                                                        <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                                                            {nextCommit ? nextCommit.subject : '앞선 커밋이 없습니다.'}
                                                        </div>
                                                        {nextCommit && (
                                                            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                                                                {nextCommit.author} · {nextCommit.relativeDate}
                                                            </div>
                                                        )}
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm font-medium text-[var(--text-primary)]">커밋 그래프</div>
                                                    <div className="text-xs text-[var(--text-muted)]">
                                                        커밋 {gitCommits.length}
                                                    </div>
                                                </div>
                                                {gitCommits.length === 0 && (
                                                    <div className="text-sm text-[var(--text-muted)]">
                                                        표시할 커밋이 없습니다.
                                                    </div>
                                                )}
                                                {gitCommits.length > 0 && (
                                                    <div className="space-y-3">
                                                        {gitCommits.map((commit) => {
                                                            const isHead = commit.hash === headHash;
                                                            const isMerge = commit.parents.length > 1;
                                                            const isActive = gitCheckoutTarget === commit.hash;
                                                            return (
                                                                <div key={commit.hash} className="flex gap-3">
                                                                    <div className="relative flex flex-col items-center pt-1">
                                                                        <div className="absolute top-0 bottom-0 w-px bg-[var(--border-primary)]" />
                                                                        <div className={`w-2.5 h-2.5 rounded-full ${isHead ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]'}`} />
                                                                        {isMerge && (
                                                                            <div className="mt-1 w-2 h-2 rounded-full border border-[var(--text-muted)]" />
                                                                        )}
                                                                    </div>
                                                                    <div className={`relative flex-1 rounded-xl border p-4 ${isHead ? 'border-[var(--accent-primary)]' : 'border-[var(--border-primary)]'} bg-[var(--bg-card)]`}>
                                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${isHead ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-primary)]'}`} />
                                                                        <div className="pl-3 space-y-2">
                                                                            <div className="flex items-start justify-between gap-3">
                                                                                <div className="min-w-0">
                                                                                    <div className="text-sm font-medium text-[var(--text-primary)] leading-snug break-words">
                                                                                        {commit.subject}
                                                                                    </div>
                                                                                    <div className="mt-1 text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-2">
                                                                                        <span className="font-mono">{commit.shortHash}</span>
                                                                                        <span>·</span>
                                                                                        <span>{commit.author}</span>
                                                                                        <span>·</span>
                                                                                        <span>{commit.relativeDate}</span>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    {isHead && (
                                                                                        <span className="px-2 py-1 text-[10px] rounded-full border border-[var(--accent-primary)] text-[var(--accent-primary)]">
                                                                                            HEAD
                                                                                        </span>
                                                                                    )}
                                                                                    <Button
                                                                                        variant="secondary"
                                                                                        size="sm"
                                                                                        onClick={() => handleGitCheckout(commit.hash)}
                                                                                        disabled={checkoutDisabled || isActive}
                                                                                    >
                                                                                        {isActive ? '이동 중' : '이동'}
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                            {commit.refs.length > 0 && (
                                                                                <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-secondary)]">
                                                                                    {commit.refs.map(ref => (
                                                                                        <span
                                                                                            key={ref}
                                                                                            className="px-2 py-0.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                                                                        >
                                                                                            {ref}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                            {isMerge && (
                                                                                <div className="text-[10px] text-[var(--text-muted)]">
                                                                                    병합 커밋
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'sites' && (
                        <div className="p-6">
                            {!projectId && (
                                <div className="text-sm text-[var(--text-muted)]">프로젝트를 먼저 선택해주세요.</div>
                            )}
                            {projectId && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-[var(--text-muted)]">
                                            dev 스크립트가 있는 package.json을 찾아서 보여줍니다.
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={loadSites}
                                            disabled={sitesLoading}
                                        >
                                            새로고침
                                        </Button>
                                    </div>
                                    <div className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] rounded-lg">
                                        {sitesLoading && (
                                            <div className="p-4 text-xs text-[var(--text-muted)]">불러오는 중...</div>
                                        )}
                                        {sitesError && (
                                            <div className="p-4 text-xs text-red-500">{sitesError}</div>
                                        )}
                                        {!sitesLoading && !sitesError && sites.length === 0 && (
                                            <div className="p-4 text-xs text-[var(--text-muted)]">
                                                dev 스크립트가 있는 사이트를 찾지 못했어요.
                                            </div>
                                        )}
                                        {!sitesLoading && !sitesError && sites.length > 0 && (
                                            <div className="divide-y divide-[var(--border-primary)]">
                                                {sites.map(site => {
                                                    const label = site.name || (site.path ? site.path.split('/').pop() : 'root');
                                                    const displayPath = site.path || '.';
                                                    return (
                                                        <div key={site.id} className="px-4 py-3">
                                                            <div className="min-w-0">
                                                                <div className="text-sm text-[var(--text-primary)] truncate">{label}</div>
                                                                <div className="text-xs text-[var(--text-muted)] truncate">{displayPath}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'upload' && (
                        <div className="p-6">
                            {!projectPath && (
                                <div className="text-sm text-[var(--text-muted)]">프로젝트를 먼저 선택해주세요.</div>
                            )}
                            {projectPath && (
                                <div className="space-y-4">
                                    {/* Upload Area */}
                                    <div
                                        className={`
                                            border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                                            ${dragOver
                                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                                                : 'border-[var(--border-secondary)] hover:border-[var(--border-primary)]'
                                            }
                                        `}
                                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept={ALLOWED_UPLOAD_EXTENSIONS}
                                            className="hidden"
                                            onChange={(e) => handleUpload(e.target.files)}
                                        />
                                        <Upload className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-primary)] font-medium">
                                            {uploading ? '업로드 중...' : '파일을 드래그하거나 클릭하여 업로드'}
                                        </p>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">
                                            md, txt, xlsx, xls, csv, 이미지 파일 지원 (최대 50MB)
                                        </p>
                                    </div>

                                    {/* Upload Results */}
                                    {uploadResults.length > 0 && (
                                        <div className="space-y-1">
                                            {uploadResults.map((result, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                                                        result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                                    }`}
                                                >
                                                    {result.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                                    <span className="flex-1 truncate">{result.name}</span>
                                                    {result.error && <span className="text-xs opacity-75">{result.error}</span>}
                                                </div>
                                            ))}
                                            <Button variant="ghost" size="sm" onClick={() => setUploadResults([])} className="text-xs">
                                                결과 닫기
                                            </Button>
                                        </div>
                                    )}

                                    {/* File List */}
                                    <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
                                        <div className="bg-[var(--bg-tertiary)] px-4 py-2 border-b border-[var(--border-primary)] flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-[var(--text-secondary)]">
                                                업로드된 파일 ({uploadedFiles.length})
                                            </h3>
                                            <Button variant="ghost" size="sm" onClick={loadUploadedFiles} disabled={uploadLoading}>
                                                새로고침
                                            </Button>
                                        </div>

                                        {uploadLoading ? (
                                            <div className="p-8 text-center">
                                                <div className="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin mx-auto" />
                                            </div>
                                        ) : uploadedFiles.length === 0 ? (
                                            <div className="p-8 text-center text-[var(--text-muted)] text-sm">
                                                업로드된 파일이 없습니다
                                            </div>
                                        ) : (
                                            <div className="max-h-64 overflow-y-auto">
                                                {uploadedFiles.map((file) => (
                                                    <div
                                                        key={file.name}
                                                        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-tertiary)]"
                                                    >
                                                        {getUploadFileIcon(file.type)}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-[var(--text-primary)] truncate">{file.name}</p>
                                                            <p className="text-xs text-[var(--text-muted)]">
                                                                {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteUploadedFile(file.name)}
                                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <p className="text-xs text-[var(--text-muted)]">
                                        📍 파일 저장 위치: {projectPath}/uploads/
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
