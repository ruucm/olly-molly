import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

const CUSTOM_PROFILES_DIR = path.join(os.homedir(), '.olly-molly', 'custom-profiles');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ memberId: string }> }
) {
    try {
        const { memberId } = await params;

        // Find the profile image file for this member
        if (!existsSync(CUSTOM_PROFILES_DIR)) {
            return NextResponse.json({ error: 'Profile image not found' }, { status: 404 });
        }

        const files = readdirSync(CUSTOM_PROFILES_DIR);
        const profileFile = files.find(f => f.startsWith(memberId + '.'));

        if (!profileFile) {
            return NextResponse.json({ error: 'Profile image not found' }, { status: 404 });
        }

        const filepath = path.join(CUSTOM_PROFILES_DIR, profileFile);
        const buffer = await readFile(filepath);

        // Determine content type based on extension
        const ext = profileFile.split('.').pop()?.toLowerCase();
        const contentTypes: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
        };

        const contentType = contentTypes[ext || ''] || 'image/png';

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000',
            },
        });
    } catch (error) {
        console.error('Error serving profile image:', error);
        return NextResponse.json({ error: 'Failed to load profile image' }, { status: 500 });
    }
}
