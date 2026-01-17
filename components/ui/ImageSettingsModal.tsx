'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { exportDbBackup, importDbBackup } from '@/lib/client-db';

export interface ImageGeneratorSettings {
    provider: 'comfyui' | 'nanobanana' | 'off';
    comfyuiServerUrl?: string;
    geminiApiKey?: string;
}

const STORAGE_KEY = 'imageGeneratorSettings';

const defaultSettings: ImageGeneratorSettings = {
    provider: 'off',
    comfyuiServerUrl: '',
    geminiApiKey: '',
};

export function getImageSettings(): ImageGeneratorSettings {
    if (typeof window === 'undefined') return defaultSettings;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return { ...defaultSettings, ...JSON.parse(stored) };
        }
    } catch {
        // Ignore parse errors
    }
    return defaultSettings;
}

export async function loadImageSettingsFromServer(): Promise<ImageGeneratorSettings> {
    try {
        const response = await fetch('/api/image/settings');
        if (response.ok) {
            const settings = await response.json();
            // Also update localStorage for quick access
            if (typeof window !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            }
            return { ...defaultSettings, ...settings };
        }
    } catch {
        // Fall back to localStorage
    }
    return getImageSettings();
}

export async function saveImageSettings(settings: ImageGeneratorSettings): Promise<void> {
    // Save to localStorage for quick access
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
    // Save to server for CLI agent access
    await fetch('/api/image/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
}

interface ImageSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ImageSettingsModal({ isOpen, onClose }: ImageSettingsModalProps) {
    const [settings, setSettings] = useState<ImageGeneratorSettings>(defaultSettings);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [backupStatus, setBackupStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
    const [backupMessage, setBackupMessage] = useState('');
    const [restoreStatus, setRestoreStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
    const [restoreMessage, setRestoreMessage] = useState('');
    const restoreInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadImageSettingsFromServer().then(setSettings);
            setTestStatus('idle');
            setTestMessage('');
            setBackupStatus('idle');
            setBackupMessage('');
            setRestoreStatus('idle');
            setRestoreMessage('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveImageSettings(settings);
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTestStatus('testing');
        setTestMessage('');

        try {
            const response = await fetch('/api/image/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Image-Settings': JSON.stringify(settings),
                },
                body: JSON.stringify({
                    prompt: 'A simple test image with colorful shapes',
                    width: 512,
                    height: 512,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setTestStatus('success');
                setTestMessage('연결 성공! 이미지가 생성되었습니다.');
            } else {
                setTestStatus('error');
                setTestMessage(data.error || '연결 실패');
            }
        } catch (error) {
            setTestStatus('error');
            setTestMessage(error instanceof Error ? error.message : '연결 실패');
        }
    };

    const isConfigured = () => {
        if (settings.provider === 'comfyui') {
            return !!settings.comfyuiServerUrl;
        }
        if (settings.provider === 'nanobanana') {
            return !!settings.geminiApiKey;
        }
        return false;
    };

    const handleBackupDownload = async () => {
        setBackupStatus('working');
        setBackupMessage('');
        try {
            const backup = await exportDbBackup();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date()
                .toISOString()
                .replace(/[:.]/g, '')
                .replace('T', '_')
                .slice(0, 15);
            const link = document.createElement('a');
            link.href = url;
            link.download = `olly-molly-backup-${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setBackupStatus('success');
            setBackupMessage('백업 파일이 다운로드되었습니다.');
        } catch (error) {
            setBackupStatus('error');
            setBackupMessage(error instanceof Error ? error.message : '백업에 실패했습니다.');
        }
    };

    const handleRestoreClick = () => {
        restoreInputRef.current?.click();
    };

    const handleRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = '';

        const confirmed = window.confirm('복원하면 현재 데이터가 모두 덮어써집니다. 진행할까요?');
        if (!confirmed) return;

        setRestoreStatus('working');
        setRestoreMessage('');
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await importDbBackup(parsed);
            setRestoreStatus('success');
            setRestoreMessage('복원이 완료되었습니다. 새로고침 후 적용됩니다.');
            window.setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            setRestoreStatus('error');
            setRestoreMessage(error instanceof Error ? error.message : '복원에 실패했습니다.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="🖼️ 이미지 생성 설정" size="md">
            <div className="space-y-6">
                {/* Provider Selection */}
                <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-3">
                        이미지 생성 Provider
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-3 p-3 border border-[var(--border-primary)] hover:border-[var(--border-accent)] cursor-pointer transition-colors">
                            <input
                                type="radio"
                                name="provider"
                                value="off"
                                checked={settings.provider === 'off'}
                                onChange={() => setSettings({ ...settings, provider: 'off' })}
                                className="text-[var(--text-accent)]"
                            />
                            <div>
                                <div className="text-sm font-medium text-[var(--text-primary)]">비활성화</div>
                                <div className="text-xs text-[var(--text-muted)]">이미지 생성 기능 사용 안함</div>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 border border-[var(--border-primary)] hover:border-[var(--border-accent)] cursor-pointer transition-colors">
                            <input
                                type="radio"
                                name="provider"
                                value="comfyui"
                                checked={settings.provider === 'comfyui'}
                                onChange={() => setSettings({ ...settings, provider: 'comfyui' })}
                                className="text-[var(--text-accent)]"
                            />
                            <div>
                                <div className="text-sm font-medium text-[var(--text-primary)]">ComfyUI</div>
                                <div className="text-xs text-[var(--text-muted)]">로컬/원격 ComfyUI 서버 사용</div>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 border border-[var(--border-primary)] hover:border-[var(--border-accent)] cursor-pointer transition-colors">
                            <input
                                type="radio"
                                name="provider"
                                value="nanobanana"
                                checked={settings.provider === 'nanobanana'}
                                onChange={() => setSettings({ ...settings, provider: 'nanobanana' })}
                                className="text-[var(--text-accent)]"
                            />
                            <div>
                                <div className="text-sm font-medium text-[var(--text-primary)]">NanoBanana (Gemini)</div>
                                <div className="text-xs text-[var(--text-muted)]">Google Gemini 3 Pro Image Preview API</div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* ComfyUI Settings */}
                {settings.provider === 'comfyui' && (
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                            ComfyUI 서버 URL
                        </label>
                        <input
                            type="text"
                            value={settings.comfyuiServerUrl || ''}
                            onChange={(e) => setSettings({ ...settings, comfyuiServerUrl: e.target.value })}
                            placeholder="http://localhost:8188"
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                        />
                    </div>
                )}

                {/* NanoBanana Settings */}
                {settings.provider === 'nanobanana' && (
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                            Gemini API Key
                        </label>
                        <input
                            type="password"
                            value={settings.geminiApiKey || ''}
                            onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                            placeholder="AIza..."
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                        />
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--text-accent)] hover:underline"
                            >
                                Google AI Studio
                            </a>
                            에서 API 키를 발급받으세요
                        </p>
                    </div>
                )}

                {/* Test Connection */}
                {settings.provider !== 'off' && isConfigured() && (
                    <div className="pt-2 border-t border-[var(--border-primary)]">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleTest}
                            disabled={testStatus === 'testing'}
                        >
                            {testStatus === 'testing' ? '테스트 중...' : '연결 테스트'}
                        </Button>
                        {testStatus === 'success' && (
                            <p className="mt-2 text-xs text-green-500">{testMessage}</p>
                        )}
                        {testStatus === 'error' && (
                            <p className="mt-2 text-xs text-red-500">{testMessage}</p>
                        )}
                    </div>
                )}

                {/* DB Backup & Restore */}
                <div className="pt-2 border-t border-[var(--border-primary)] space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)]">
                            DB 백업 & 복원
                        </label>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            현재 IndexedDB 데이터를 JSON 파일로 저장하거나 복원합니다. 자동 백업은 5분마다 서버 파일로 저장됩니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleBackupDownload}
                            disabled={backupStatus === 'working' || restoreStatus === 'working'}
                        >
                            {backupStatus === 'working' ? '백업 중...' : '백업 다운로드'}
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleRestoreClick}
                            disabled={backupStatus === 'working' || restoreStatus === 'working'}
                        >
                            {restoreStatus === 'working' ? '복원 중...' : '복원하기'}
                        </Button>
                        <input
                            ref={restoreInputRef}
                            type="file"
                            accept="application/json"
                            className="hidden"
                            onChange={handleRestoreFile}
                        />
                    </div>
                    {backupStatus === 'success' && (
                        <p className="text-xs text-green-500">{backupMessage}</p>
                    )}
                    {backupStatus === 'error' && (
                        <p className="text-xs text-red-500">{backupMessage}</p>
                    )}
                    {restoreStatus === 'success' && (
                        <p className="text-xs text-green-500">{restoreMessage}</p>
                    )}
                    {restoreStatus === 'error' && (
                        <p className="text-xs text-red-500">{restoreMessage}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-[var(--border-primary)]">
                    <Button variant="ghost" onClick={onClose} className="flex-1">
                        취소
                    </Button>
                    <Button variant="primary" onClick={handleSave} className="flex-1">
                        저장
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
