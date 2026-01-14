import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

// Custom profiles directory - stored in ~/.olly-molly/custom-profiles/ for persistence across updates
const CUSTOM_PROFILES_DIR = path.join(os.homedir(), '.olly-molly', 'custom-profiles');

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const memberId = formData.get('memberId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!memberId) {
            return NextResponse.json({ error: 'No memberId provided' }, { status: 400 });
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' }, { status: 400 });
        }

        // Ensure custom profiles directory exists
        if (!existsSync(CUSTOM_PROFILES_DIR)) {
            await mkdir(CUSTOM_PROFILES_DIR, { recursive: true });
        }

        // Generate filename based on member ID to ensure uniqueness
        const ext = file.name.split('.').pop() || 'png';
        const filename = `${memberId}.${ext}`;
        const filepath = path.join(CUSTOM_PROFILES_DIR, filename);

        // Convert file to buffer and save
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filepath, buffer);

        // Return the path that can be used to access the image
        // Since this is stored outside public folder, we need to serve it via API
        const imagePath = `/api/members/profile-image/${memberId}`;

        return NextResponse.json({
            success: true,
            path: imagePath,
            filename
        });
    } catch (error) {
        console.error('Error uploading profile image:', error);
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
}
