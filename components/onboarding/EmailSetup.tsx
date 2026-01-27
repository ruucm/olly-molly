'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { userSettingsService } from '@/lib/client-db';

interface EmailSetupProps {
    onComplete: (email: string) => void;
}

export function EmailSetup({ onComplete }: EmailSetupProps) {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const isValidEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSubmit = async () => {
        if (!email.trim()) {
            setError('이메일을 입력해주세요');
            return;
        }
        if (!isValidEmail(email)) {
            setError('올바른 이메일 형식이 아닙니다');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await userSettingsService.set(email);
            onComplete(email);
        } catch (err) {
            setError('저장 중 오류가 발생했습니다');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[var(--bg-secondary)] rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl border border-[var(--border-primary)]">
                <div className="text-center mb-6">
                    <div className="text-4xl mb-4">👋</div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                        Olly Molly에 오신 것을 환영합니다
                    </h1>
                    <p className="text-[var(--text-muted)] text-sm">
                        시작하기 전에 고유한 이메일을 입력해주세요.
                        <br />
                        이 이메일은 프로젝트 저장 경로에 사용됩니다.
                    </p>
                </div>

                <div className="space-y-4">
                    <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        label="이메일"
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />

                    {email && (
                        <p className="text-xs text-[var(--text-muted)]">
                            📁 프로젝트 경로: ~/Projects/{userSettingsService.emailToDir(email)}/
                        </p>
                    )}

                    {error && (
                        <p className="text-sm text-red-400">{error}</p>
                    )}

                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleSubmit}
                        disabled={loading || !email.trim()}
                        className="w-full"
                    >
                        {loading ? '저장 중...' : '시작하기'}
                    </Button>
                </div>

                <p className="mt-4 text-xs text-center text-[var(--text-muted)]">
                    이메일은 로컬에만 저장되며 외부로 전송되지 않습니다.
                </p>
            </div>
        </div>
    );
}
