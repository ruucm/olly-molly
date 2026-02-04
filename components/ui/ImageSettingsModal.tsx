'use client';

import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
    getNotificationSettings,
    saveNotificationSettings,
    type NotificationSettings,
} from '@/lib/notification-settings';
import { userSettingsService } from '@/lib/client-db';

type SettingsTab = 'image' | 'notification' | 'account';

export interface ImageGeneratorSettings {
    provider: 'comfyui' | 'nanobanana' | 'off';
    comfyuiServerUrl?: string;
    geminiApiKey?: string;
}

export interface ScreenshotTestSettings {
    enabled: boolean;
}

const SCREENSHOT_STORAGE_KEY = 'screenshotTestSettings';

const defaultScreenshotSettings: ScreenshotTestSettings = {
    enabled: false, // 기본값: 비활성화
};

export function getScreenshotTestSettings(): ScreenshotTestSettings {
    if (typeof window === 'undefined') return defaultScreenshotSettings;
    try {
        const stored = localStorage.getItem(SCREENSHOT_STORAGE_KEY);
        if (stored) {
            return { ...defaultScreenshotSettings, ...JSON.parse(stored) };
        }
    } catch {
        // Ignore parse errors
    }
    return defaultScreenshotSettings;
}

export async function loadScreenshotTestSettingsFromServer(): Promise<ScreenshotTestSettings> {
    try {
        const response = await fetch('/api/settings/screenshot');
        if (response.ok) {
            const settings = await response.json();
            if (typeof window !== 'undefined') {
                localStorage.setItem(SCREENSHOT_STORAGE_KEY, JSON.stringify(settings));
            }
            return { ...defaultScreenshotSettings, ...settings };
        }
    } catch {
        // Fall back to localStorage
    }
    return getScreenshotTestSettings();
}

export async function saveScreenshotTestSettings(settings: ScreenshotTestSettings): Promise<void> {
    if (typeof window !== 'undefined') {
        localStorage.setItem(SCREENSHOT_STORAGE_KEY, JSON.stringify(settings));
    }
    await fetch('/api/settings/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
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
    const [activeTab, setActiveTab] = useState<SettingsTab>('image');
    const [settings, setSettings] = useState<ImageGeneratorSettings>(defaultSettings);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [saving, setSaving] = useState(false);

    // Notification settings
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
        browserEnabled: true,
        emailEnabled: false,
        emailAddress: '',
    });
    const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
    const [fromEmail, setFromEmail] = useState<string | undefined>();

    // Account settings
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loggingOut, setLoggingOut] = useState(false);

    // Screenshot test settings
    const [screenshotSettings, setScreenshotSettings] = useState<ScreenshotTestSettings>(defaultScreenshotSettings);

    useEffect(() => {
        if (isOpen) {
            loadImageSettingsFromServer().then(setSettings);
            loadScreenshotTestSettingsFromServer().then(setScreenshotSettings);
            setTestStatus('idle');
            setTestMessage('');

            // Load notification settings
            const notifSettings = getNotificationSettings();
            setNotificationSettings(notifSettings);

            // Load user email
            userSettingsService.getEmail().then(setUserEmail);

            // Check if email is configured on server
            fetch('/api/notification/settings')
                .then((res) => res.json())
                .then((data) => {
                    setEmailConfigured(data.email?.configured || false);
                    setFromEmail(data.email?.fromEmail);
                })
                .catch(() => {
                    setEmailConfigured(false);
                });
        }
    }, [isOpen]);

    const handleLogout = async () => {
        if (!window.confirm('로그아웃하면 다른 이메일로 로그인할 수 있습니다. 진행할까요?')) {
            return;
        }
        setLoggingOut(true);
        try {
            await userSettingsService.clear();
            window.location.reload();
        } catch (error) {
            console.error('Failed to logout:', error);
            setLoggingOut(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveImageSettings(settings);
            await saveScreenshotTestSettings(screenshotSettings);
            saveNotificationSettings(notificationSettings);
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚙️ 설정" size="md">
            <div className="space-y-6">
                {/* Tabs */}
                <div className="flex border-b border-[var(--border-primary)]">
                    <button
                        onClick={() => setActiveTab('image')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'image'
                                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        🖼️ 이미지 생성
                    </button>
                    <button
                        onClick={() => setActiveTab('notification')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'notification'
                                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        🔔 알림
                    </button>
                    <button
                        onClick={() => setActiveTab('account')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'account'
                                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        👤 계정
                    </button>
                </div>

                {/* Image Settings Tab */}
                {activeTab === 'image' && (
                    <>
                {/* Screenshot Test Settings */}
                <div className="pb-4 border-b border-[var(--border-primary)]">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-3">
                        🖼️ 스크린샷 테스트
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-[var(--border-primary)] hover:border-[var(--border-accent)] cursor-pointer transition-colors">
                        <input
                            type="checkbox"
                            checked={screenshotSettings.enabled}
                            onChange={(e) => setScreenshotSettings({ ...screenshotSettings, enabled: e.target.checked })}
                            className="w-4 h-4"
                        />
                        <div>
                            <div className="text-sm font-medium text-[var(--text-primary)]">스크린샷 테스트 활성화</div>
                            <div className="text-xs text-[var(--text-muted)]">
                                {screenshotSettings.enabled
                                    ? '에이전트가 UI 변경 시 Playwright로 스크린샷을 찍습니다'
                                    : '에이전트가 스크린샷을 찍지 않습니다 (기본값)'}
                            </div>
                        </div>
                    </label>
                </div>

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
                    </>
                )}

                {/* Notification Settings Tab */}
                {activeTab === 'notification' && (
                    <>
                        {/* Browser Notifications */}
                        <div>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notificationSettings.browserEnabled}
                                    onChange={(e) =>
                                        setNotificationSettings({
                                            ...notificationSettings,
                                            browserEnabled: e.target.checked,
                                        })
                                    }
                                    className="w-4 h-4"
                                />
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-primary)]">
                                        브라우저 알림
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)]">
                                        작업 완료 시 브라우저 알림 표시
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* Email Notifications */}
                        <div className="pt-4 border-t border-[var(--border-primary)]">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notificationSettings.emailEnabled}
                                    onChange={(e) =>
                                        setNotificationSettings({
                                            ...notificationSettings,
                                            emailEnabled: e.target.checked,
                                        })
                                    }
                                    className="w-4 h-4"
                                    disabled={!emailConfigured}
                                />
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-primary)]">
                                        이메일 알림
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)]">
                                        작업 완료 시 이메일 발송 (AWS SES)
                                    </div>
                                </div>
                            </label>

                            {emailConfigured === false && (
                                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                                    <p className="text-xs text-amber-500">
                                        이메일 알림을 사용하려면 서버 환경변수를 설정하세요:
                                    </p>
                                    <pre className="mt-2 text-[10px] text-[var(--text-muted)] font-mono">
{`AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
SES_FROM_EMAIL=noreply@yourdomain.com`}
                                    </pre>
                                </div>
                            )}

                            {emailConfigured && fromEmail && (
                                <p className="mt-2 text-xs text-green-500">
                                    ✓ 이메일 설정됨 (발신: {fromEmail})
                                </p>
                            )}

                            {notificationSettings.emailEnabled && emailConfigured && (
                                <div className="mt-3">
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                                        수신 이메일 주소
                                    </label>
                                    <input
                                        type="email"
                                        value={notificationSettings.emailAddress}
                                        onChange={(e) =>
                                            setNotificationSettings({
                                                ...notificationSettings,
                                                emailAddress: e.target.value,
                                            })
                                        }
                                        placeholder="your@email.com"
                                        className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                                    />
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Account Settings Tab */}
                {activeTab === 'account' && (
                    <>
                        {/* Current Email */}
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                                현재 로그인 이메일
                            </label>
                            <div className="px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]">
                                {userEmail || '없음'}
                            </div>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                📁 프로젝트 경로: ~/Projects/{userEmail ? userSettingsService.emailToDir(userEmail) : '...'}
                            </p>
                        </div>

                        {/* Logout */}
                        <div className="pt-4 border-t border-[var(--border-primary)]">
                            <div className="mb-3">
                                <div className="text-sm font-medium text-[var(--text-primary)]">
                                    로그아웃
                                </div>
                                <div className="text-xs text-[var(--text-muted)]">
                                    로그아웃 후 다른 이메일로 로그인할 수 있습니다.
                                    로컬 데이터는 유지됩니다.
                                </div>
                            </div>
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={handleLogout}
                                disabled={loggingOut}
                            >
                                {loggingOut ? '로그아웃 중...' : '로그아웃'}
                            </Button>
                        </div>
                    </>
                )}

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
