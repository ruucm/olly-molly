/**
 * write_file tool implementation
 */

import fs from 'fs/promises';
import path from 'path';
import type { WriteFileInput, ToolResult, ToolContext } from '../types';
import { validatePath, containsSensitiveData } from '../security';

export async function writeFile(
    input: WriteFileInput,
    context: ToolContext
): Promise<ToolResult> {
    const { path: filePath, content } = input;
    const { projectPath } = context;

    // Validate path
    const validation = validatePath(filePath, projectPath, 'write');
    if (!validation.valid) {
        return {
            success: false,
            output: '',
            error: validation.error,
        };
    }

    // Check for sensitive data
    if (containsSensitiveData(content)) {
        return {
            success: false,
            output: '',
            error: 'Content contains potentially sensitive data (API keys, credentials). Please remove before writing.',
        };
    }

    try {
        // Ensure directory exists
        const dirPath = path.dirname(validation.normalizedPath);
        await fs.mkdir(dirPath, { recursive: true });

        // Check if file exists for reporting
        let existed = false;
        try {
            await fs.access(validation.normalizedPath);
            existed = true;
        } catch {
            // File doesn't exist, will be created
        }

        // Write file
        await fs.writeFile(validation.normalizedPath, content, 'utf-8');

        const lineCount = content.split('\n').length;
        const action = existed ? 'Updated' : 'Created';

        return {
            success: true,
            output: `${action} file: ${filePath} (${lineCount} lines, ${content.length} bytes)`,
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        return {
            success: false,
            output: '',
            error: `Failed to write file: ${err.message}`,
        };
    }
}
