import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 10;

function isAllowedImage(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.includes(ext);
}

function getAttachmentsDir(projectPath: string, ticketId: string): string {
    return path.join(projectPath, '.agent-attachments', ticketId);
}

// POST: Upload image attachments for a ticket execution
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const projectPath = formData.get('projectPath') as string;
        const ticketId = formData.get('ticketId') as string;
        const files = formData.getAll('files') as File[];

        if (!projectPath || !ticketId) {
            return NextResponse.json({ error: 'projectPath and ticketId are required' }, { status: 400 });
        }

        if (!fs.existsSync(projectPath)) {
            return NextResponse.json({ error: 'Project path does not exist' }, { status: 400 });
        }

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        if (files.length > MAX_FILES) {
            return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 });
        }

        const attachDir = getAttachmentsDir(projectPath, ticketId);
        if (!fs.existsSync(attachDir)) {
            fs.mkdirSync(attachDir, { recursive: true });
        }

        const attachments: { name: string; path: string; size: number }[] = [];
        const errors: { name: string; error: string }[] = [];

        for (const file of files) {
            const filename = file.name;

            if (!isAllowedImage(filename)) {
                errors.push({ name: filename, error: `Not an allowed image type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}` });
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                errors.push({ name: filename, error: 'File too large (max 10MB)' });
                continue;
            }

            try {
                const buffer = Buffer.from(await file.arrayBuffer());

                // Dedup filename
                let targetFilename = filename;
                let targetPath = path.join(attachDir, targetFilename);
                let counter = 1;
                while (fs.existsSync(targetPath)) {
                    const ext = path.extname(filename);
                    const base = path.basename(filename, ext);
                    targetFilename = `${base}_${counter}${ext}`;
                    targetPath = path.join(attachDir, targetFilename);
                    counter++;
                }

                fs.writeFileSync(targetPath, buffer);

                attachments.push({
                    name: targetFilename,
                    path: targetPath,
                    size: file.size,
                });
            } catch (err) {
                errors.push({ name: filename, error: err instanceof Error ? err.message : 'Upload failed' });
            }
        }

        return NextResponse.json({
            success: true,
            attachments,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Attachment upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}

// DELETE: Remove attachment(s) for a ticket
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { projectPath, ticketId, filename } = body;

        if (!projectPath || !ticketId) {
            return NextResponse.json({ error: 'projectPath and ticketId are required' }, { status: 400 });
        }

        const attachDir = getAttachmentsDir(projectPath, ticketId);

        // Security check
        if (!attachDir.includes('.agent-attachments')) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }

        if (filename) {
            // Delete single file
            const filePath = path.join(attachDir, filename);
            if (!filePath.startsWith(attachDir)) {
                return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
            }
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } else {
            // Delete entire ticket attachment directory
            if (fs.existsSync(attachDir)) {
                fs.rmSync(attachDir, { recursive: true, force: true });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Attachment delete error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Delete failed' },
            { status: 500 }
        );
    }
}
