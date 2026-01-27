import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS = [
    // Markdown & Text
    '.md', '.txt',
    // Excel
    '.xlsx', '.xls', '.csv',
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function isAllowedFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const projectPath = formData.get('projectPath') as string;
        const files = formData.getAll('files') as File[];

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        if (!fs.existsSync(projectPath)) {
            return NextResponse.json({ error: 'Project path does not exist' }, { status: 400 });
        }

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        // Create uploads directory in project
        const uploadsDir = path.join(projectPath, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const results: { name: string; path: string; size: number; success: boolean; error?: string }[] = [];

        for (const file of files) {
            const filename = file.name;

            // Validate file extension
            if (!isAllowedFile(filename)) {
                results.push({
                    name: filename,
                    path: '',
                    size: file.size,
                    success: false,
                    error: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
                });
                continue;
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                results.push({
                    name: filename,
                    path: '',
                    size: file.size,
                    success: false,
                    error: 'File too large (max 50MB)',
                });
                continue;
            }

            try {
                const buffer = Buffer.from(await file.arrayBuffer());

                // Generate unique filename if exists
                let targetFilename = filename;
                let targetPath = path.join(uploadsDir, targetFilename);
                let counter = 1;

                while (fs.existsSync(targetPath)) {
                    const ext = path.extname(filename);
                    const base = path.basename(filename, ext);
                    targetFilename = `${base}_${counter}${ext}`;
                    targetPath = path.join(uploadsDir, targetFilename);
                    counter++;
                }

                fs.writeFileSync(targetPath, buffer);

                results.push({
                    name: targetFilename,
                    path: targetPath,
                    size: file.size,
                    success: true,
                });
            } catch (err) {
                results.push({
                    name: filename,
                    path: '',
                    size: file.size,
                    success: false,
                    error: err instanceof Error ? err.message : 'Upload failed',
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return NextResponse.json({
            success: true,
            message: `${successCount} file(s) uploaded${failCount > 0 ? `, ${failCount} failed` : ''}`,
            results,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}

// GET: List uploaded files
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectPath = searchParams.get('projectPath');

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        const uploadsDir = path.join(projectPath, 'uploads');

        if (!fs.existsSync(uploadsDir)) {
            return NextResponse.json({ files: [] });
        }

        const files = fs.readdirSync(uploadsDir).map(filename => {
            const filePath = path.join(uploadsDir, filename);
            const stats = fs.statSync(filePath);
            const ext = path.extname(filename).toLowerCase();

            let type: 'image' | 'document' | 'spreadsheet' | 'unknown' = 'unknown';
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
                type = 'image';
            } else if (['.md', '.txt'].includes(ext)) {
                type = 'document';
            } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
                type = 'spreadsheet';
            }

            return {
                name: filename,
                path: filePath,
                size: stats.size,
                type,
                createdAt: stats.birthtime.toISOString(),
                modifiedAt: stats.mtime.toISOString(),
            };
        });

        return NextResponse.json({ files });
    } catch (error) {
        console.error('List files error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list files' },
            { status: 500 }
        );
    }
}

// DELETE: Delete uploaded file
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { projectPath, filename } = body;

        if (!projectPath || !filename) {
            return NextResponse.json({ error: 'Project path and filename are required' }, { status: 400 });
        }

        const filePath = path.join(projectPath, 'uploads', filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Security check: ensure file is within uploads directory
        const uploadsDir = path.join(projectPath, 'uploads');
        if (!filePath.startsWith(uploadsDir)) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
        }

        fs.unlinkSync(filePath);

        return NextResponse.json({ success: true, message: 'File deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Delete failed' },
            { status: 500 }
        );
    }
}
