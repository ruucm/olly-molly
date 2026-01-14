'use client';

import { useState, useEffect } from 'react';
import { Modal } from './Modal';

interface CLIWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Platform = 'mac' | 'windows';

export function CLIWarningModal({ isOpen, onClose }: CLIWarningModalProps) {
    const [platform, setPlatform] = useState<Platform>('mac');

    useEffect(() => {
        // Detect platform on client side
        if (typeof window !== 'undefined') {
            const userAgent = navigator.userAgent.toLowerCase();
            if (userAgent.includes('win')) {
                setPlatform('windows');
            }
        }
    }, []);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const installCommands = {
        mac: {
            opencode: 'brew install sst/tap/opencode',
            claude: 'brew install anthropics/tap/claude-code',
            codex: 'npm install -g @openai/codex',
        },
        windows: {
            opencode: 'npm install -g opencode-ai',
            claude: 'npm install -g @anthropic-ai/claude-code',
            codex: 'npm install -g @openai/codex',
        },
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="CLI 도구 설치 필요" size="md">
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-[var(--status-error-bg)] rounded-lg border border-[var(--status-error-text)]/20">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">
                            AI 에이전트를 실행하려면 Codex, OpenCode, 또는 Claude CLI가 설치되어 있어야 합니다.
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            아래에서 운영체제를 선택하고 명령어로 설치하세요.
                        </p>
                    </div>
                </div>

                {/* Platform Tabs */}
                <div className="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
                    <button
                        onClick={() => setPlatform('mac')}
                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${platform === 'mac'
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                    >
                        🍎 macOS
                    </button>
                    <button
                        onClick={() => setPlatform('windows')}
                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${platform === 'windows'
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                    >
                        🪟 Windows
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">⚪️ OpenCode 설치</span>
                            <button
                                onClick={() => copyToClipboard(installCommands[platform].opencode)}
                                className="text-xs text-[var(--accent-primary)] hover:underline"
                            >
                                복사
                            </button>
                        </div>
                        <code className="text-xs text-[var(--text-primary)] bg-[var(--bg-primary)] px-2 py-1 rounded block">
                            {installCommands[platform].opencode}
                        </code>
                    </div>

                    <div className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">🔵 Codex CLI 설치</span>
                            <button
                                onClick={() => copyToClipboard(installCommands[platform].codex)}
                                className="text-xs text-[var(--accent-primary)] hover:underline"
                            >
                                복사
                            </button>
                        </div>
                        <code className="text-xs text-[var(--text-primary)] bg-[var(--bg-primary)] px-2 py-1 rounded block">
                            {installCommands[platform].codex}
                        </code>
                    </div>

                    <div className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">🟠 Claude CLI 설치</span>
                            <button
                                onClick={() => copyToClipboard(installCommands[platform].claude)}
                                className="text-xs text-[var(--accent-primary)] hover:underline"
                            >
                                복사
                            </button>
                        </div>
                        <code className="text-xs text-[var(--text-primary)] bg-[var(--bg-primary)] px-2 py-1 rounded block">
                            {installCommands[platform].claude}
                        </code>
                    </div>
                </div>

                {platform === 'windows' && (
                    <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] p-2 rounded">
                        ⚠️ Windows용 npm 패키지가 공식적으로 지원되지 않을 수 있습니다.
                        설치 실패 시 WSL(Windows Subsystem for Linux)에서 brew 명령어를 사용하세요.
                    </p>
                )}

                <p className="text-xs text-[var(--text-muted)]">
                    설치 후에 앱을 다시 시작하거나 이 창을 닫고 작업을 계속할 수 있습니다.
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-2 px-4 bg-[var(--accent-primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-primary-hover)] transition-colors"
                >
                    확인
                </button>
            </div>
        </Modal>
    );
}
