import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CLAUDE_MODEL_ENV_KEYS = ['CLAUDE_MODEL', 'CLAUDE_CODE_MODEL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_MODEL'];
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function getTokenInfo(): { source: string; preview: string } {
    // 1. Env var
    if (process.env.ANTHROPIC_API_KEY) {
        const key = process.env.ANTHROPIC_API_KEY;
        return {
            source: 'env',
            preview: key.slice(0, 12) + '...' + key.slice(-4),
        };
    }

    // 2. Keychain
    try {
        const result = execSync(
            'security find-generic-password -s "Claude Code-credentials" -w',
            { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const data = JSON.parse(result.trim());
        if (data?.claudeAiOauth?.accessToken) {
            const token = data.claudeAiOauth.accessToken;
            return {
                source: 'keychain',
                preview: token.slice(0, 12) + '...' + token.slice(-4),
            };
        }
    } catch {}

    // 3. Credentials file
    try {
        const credPath = path.join(process.env.HOME || '~', '.claude', '.credentials.json');
        const raw = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        if (raw?.claudeAiOauth?.accessToken) {
            const token = raw.claudeAiOauth.accessToken;
            return {
                source: 'credentials',
                preview: token.slice(0, 12) + '...' + token.slice(-4),
            };
        }
    } catch {}

    return { source: 'none', preview: '' };
}

function getModel(): string {
    for (const key of CLAUDE_MODEL_ENV_KEYS) {
        const value = process.env[key];
        if (value && value.trim()) return value.trim();
    }
    return DEFAULT_MODEL;
}

const MODEL_LABELS: Record<string, string> = {
    'claude-sonnet-4-20250514': 'Sonnet 4',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
};

export async function GET() {
    const token = getTokenInfo();
    const model = getModel();

    return NextResponse.json({
        token: {
            source: token.source,
            preview: token.preview,
        },
        model: {
            id: model,
            label: MODEL_LABELS[model] || model,
        },
    });
}
