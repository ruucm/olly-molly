/**
 * search_files tool implementation (grep-like search)
 */

import fs from 'fs/promises';
import path from 'path';
import type { SearchFilesInput, ToolResult, ToolContext } from '../types';
import { validatePath } from '../security';

const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 200;
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

interface SearchMatch {
    file: string;
    line: number;
    content: string;
}

/**
 * Simple pattern matcher for file include filter
 */
function matchesInclude(filename: string, include: string): boolean {
    // Convert simple glob to regex
    const regexPattern = include
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp(`${regexPattern}$`, 'i');
    return regex.test(filename);
}

async function searchInFile(
    filePath: string,
    basePath: string,
    pattern: RegExp,
    results: SearchMatch[]
): Promise<void> {
    if (results.length >= MAX_RESULTS) return;

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(basePath, filePath);

        for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
            const line = lines[i];
            if (pattern.test(line)) {
                let displayLine = line.trim();
                if (displayLine.length > MAX_LINE_LENGTH) {
                    displayLine = displayLine.substring(0, MAX_LINE_LENGTH) + '...';
                }
                results.push({
                    file: relativePath,
                    line: i + 1,
                    content: displayLine,
                });
            }
        }
    } catch {
        // Binary file or read error - skip
    }
}

async function searchRecursive(
    dirPath: string,
    basePath: string,
    pattern: RegExp,
    include: string | undefined,
    results: SearchMatch[],
    depth = 0
): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    if (depth > 20) return;

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) break;

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Skip ignored directories
                if (IGNORED_DIRS.has(entry.name)) continue;
                await searchRecursive(fullPath, basePath, pattern, include, results, depth + 1);
            } else {
                // Check include filter
                if (include && !matchesInclude(entry.name, include)) continue;

                // Skip binary/large files by extension
                const ext = path.extname(entry.name).toLowerCase();
                const binaryExts = new Set([
                    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
                    '.woff', '.woff2', '.ttf', '.eot', '.otf',
                    '.zip', '.tar', '.gz', '.rar',
                    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
                    '.mp3', '.mp4', '.wav', '.avi', '.mov',
                    '.exe', '.dll', '.so', '.dylib',
                    '.lock',
                ]);
                if (binaryExts.has(ext)) continue;

                await searchInFile(fullPath, basePath, pattern, results);
            }
        }
    } catch {
        // Permission denied - skip
    }
}

export async function searchFiles(
    input: SearchFilesInput,
    context: ToolContext
): Promise<ToolResult> {
    const { pattern: searchPattern, path: inputPath = '.', include } = input;
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

    // Create regex from pattern
    let regex: RegExp;
    try {
        regex = new RegExp(searchPattern, 'i');
    } catch (error) {
        return {
            success: false,
            output: '',
            error: `Invalid search pattern: ${(error as Error).message}`,
        };
    }

    try {
        const results: SearchMatch[] = [];
        const stat = await fs.stat(validation.normalizedPath);

        if (stat.isFile()) {
            await searchInFile(validation.normalizedPath, projectPath, regex, results);
        } else {
            await searchRecursive(validation.normalizedPath, validation.normalizedPath, regex, include, results);
        }

        if (results.length === 0) {
            return {
                success: true,
                output: `No matches found for pattern "${searchPattern}"${include ? ` in ${include} files` : ''} in ${inputPath}`,
            };
        }

        const truncated = results.length >= MAX_RESULTS;
        let output = `Found ${results.length} matches for "${searchPattern}"`;
        if (include) {
            output += ` in ${include} files`;
        }
        if (truncated) {
            output += ` (showing first ${MAX_RESULTS})`;
        }
        output += '\n---\n';

        // Group by file
        const byFile = new Map<string, SearchMatch[]>();
        for (const result of results) {
            const existing = byFile.get(result.file) || [];
            existing.push(result);
            byFile.set(result.file, existing);
        }

        for (const [file, matches] of byFile) {
            output += `\n${file}:\n`;
            for (const match of matches) {
                output += `  ${match.line}: ${match.content}\n`;
            }
        }

        return {
            success: true,
            output,
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        return {
            success: false,
            output: '',
            error: `Search failed: ${err.message}`,
        };
    }
}
