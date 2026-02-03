/**
 * edit_file tool implementation (search & replace)
 */

import fs from 'fs/promises';
import type { EditFileInput, ToolResult, ToolContext } from '../types';
import { validatePath, containsSensitiveData } from '../security';

export async function editFile(
    input: EditFileInput,
    context: ToolContext
): Promise<ToolResult> {
    const { path: filePath, search, replace } = input;
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

    // Check for sensitive data in replacement
    if (containsSensitiveData(replace)) {
        return {
            success: false,
            output: '',
            error: 'Replacement content contains potentially sensitive data. Please remove before editing.',
        };
    }

    try {
        // Read existing file
        const content = await fs.readFile(validation.normalizedPath, 'utf-8');

        // Check if search string exists
        if (!content.includes(search)) {
            // Try to provide helpful context
            const lines = content.split('\n');
            const searchPreview = search.substring(0, 100);

            return {
                success: false,
                output: '',
                error: `Search string not found in file. File has ${lines.length} lines. Search preview: "${searchPreview}..."`,
            };
        }

        // Count occurrences
        const occurrences = content.split(search).length - 1;

        // Perform replacement (all occurrences)
        const newContent = content.split(search).join(replace);

        // Write back
        await fs.writeFile(validation.normalizedPath, newContent, 'utf-8');

        return {
            success: true,
            output: `Edited file: ${filePath}\nReplaced ${occurrences} occurrence(s)\nSearch: "${search.substring(0, 50)}${search.length > 50 ? '...' : ''}"\nReplace: "${replace.substring(0, 50)}${replace.length > 50 ? '...' : ''}"`,
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return {
                success: false,
                output: '',
                error: `File not found: ${filePath}`,
            };
        }
        return {
            success: false,
            output: '',
            error: `Failed to edit file: ${err.message}`,
        };
    }
}
