/**
 * read_file tool implementation
 */

import fs from 'fs/promises';
import type { ReadFileInput, ToolResult, ToolContext } from '../types';
import { validatePath } from '../security';

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

export async function readFile(
    input: ReadFileInput,
    context: ToolContext
): Promise<ToolResult> {
    const { path: filePath, offset = 0, limit } = input;
    const { projectPath } = context;

    // Validate path
    const validation = validatePath(filePath, projectPath, 'read');
    if (!validation.valid) {
        return {
            success: false,
            output: '',
            error: validation.error,
        };
    }

    try {
        const content = await fs.readFile(validation.normalizedPath, 'utf-8');
        const lines = content.split('\n');

        // Apply offset and limit
        const startLine = Math.max(0, offset);
        const effectiveLimit = limit ?? MAX_LINES;
        const endLine = Math.min(lines.length, startLine + effectiveLimit);
        const selectedLines = lines.slice(startLine, endLine);

        // Truncate long lines
        const truncatedLines = selectedLines.map((line, idx) => {
            const lineNum = startLine + idx + 1; // 1-indexed
            const truncated = line.length > MAX_LINE_LENGTH
                ? line.substring(0, MAX_LINE_LENGTH) + '...[truncated]'
                : line;
            return `${lineNum}\t${truncated}`;
        });

        const output = truncatedLines.join('\n');
        const totalLines = lines.length;
        const hasMore = endLine < totalLines;

        let header = `File: ${filePath} (${totalLines} lines total)`;
        if (hasMore) {
            header += `\nShowing lines ${startLine + 1}-${endLine}. Use offset=${endLine} to read more.`;
        }

        return {
            success: true,
            output: `${header}\n---\n${output}`,
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
        if (err.code === 'EISDIR') {
            return {
                success: false,
                output: '',
                error: `Path is a directory, not a file: ${filePath}`,
            };
        }
        return {
            success: false,
            output: '',
            error: `Failed to read file: ${err.message}`,
        };
    }
}
