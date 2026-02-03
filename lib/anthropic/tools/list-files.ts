/**
 * list_files tool implementation
 */

import fs from 'fs/promises';
import path from 'path';
import type { ListFilesInput, ToolResult, ToolContext } from '../types';
import { validatePath } from '../security';

const MAX_FILES = 1000;
const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    '.cache',
    'dist',
    'build',
    '.turbo',
    'coverage',
    '.nyc_output',
]);

/**
 * Simple glob pattern matcher
 */
function matchesPattern(filename: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '<<GLOBSTAR>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<GLOBSTAR>>/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
}

async function listRecursive(
    dirPath: string,
    basePath: string,
    pattern: string | undefined,
    results: string[],
    depth = 0
): Promise<void> {
    if (results.length >= MAX_FILES) return;
    if (depth > 20) return; // Prevent infinite recursion

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= MAX_FILES) break;

            // Skip ignored directories
            if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
                continue;
            }

            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(basePath, fullPath);

            if (entry.isDirectory()) {
                // Add directory with trailing slash
                if (!pattern || matchesPattern(entry.name + '/', pattern)) {
                    results.push(relativePath + '/');
                }
                // Recurse into directory
                await listRecursive(fullPath, basePath, pattern, results, depth + 1);
            } else {
                // Check pattern match
                if (!pattern || matchesPattern(entry.name, pattern) || matchesPattern(relativePath, pattern)) {
                    results.push(relativePath);
                }
            }
        }
    } catch {
        // Permission denied or other errors - skip this directory
    }
}

export async function listFiles(
    input: ListFilesInput,
    context: ToolContext
): Promise<ToolResult> {
    const { path: inputPath = '.', recursive = false, pattern } = input;
    const { projectPath } = context;

    // Validate path
    const validation = validatePath(inputPath, projectPath, 'read');
    if (!validation.valid) {
        return {
            success: false,
            output: '',
            error: validation.error,
        };
    }

    try {
        const results: string[] = [];

        if (recursive) {
            await listRecursive(validation.normalizedPath, validation.normalizedPath, pattern, results);
        } else {
            const entries = await fs.readdir(validation.normalizedPath, { withFileTypes: true });

            for (const entry of entries) {
                if (results.length >= MAX_FILES) break;

                // Skip ignored directories
                if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
                    continue;
                }

                const name = entry.isDirectory() ? entry.name + '/' : entry.name;

                // Check pattern match
                if (!pattern || matchesPattern(entry.name, pattern)) {
                    results.push(name);
                }
            }
        }

        // Sort results (directories first, then files)
        results.sort((a, b) => {
            const aIsDir = a.endsWith('/');
            const bIsDir = b.endsWith('/');
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        const truncated = results.length >= MAX_FILES;
        let output = `Listed ${results.length} items in ${inputPath}`;
        if (truncated) {
            output += ` (truncated at ${MAX_FILES})`;
        }
        if (pattern) {
            output += ` matching "${pattern}"`;
        }
        output += '\n---\n';
        output += results.join('\n');

        return {
            success: true,
            output,
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return {
                success: false,
                output: '',
                error: `Directory not found: ${inputPath}`,
            };
        }
        if (err.code === 'ENOTDIR') {
            return {
                success: false,
                output: '',
                error: `Path is not a directory: ${inputPath}`,
            };
        }
        return {
            success: false,
            output: '',
            error: `Failed to list directory: ${err.message}`,
        };
    }
}
