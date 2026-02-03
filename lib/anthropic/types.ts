/**
 * TypeScript types for Anthropic API integration
 */

import type Anthropic from '@anthropic-ai/sdk';

// ─── Tool Definitions ─────────────────────────────────────────────────

export interface ToolResult {
    success: boolean;
    output: string;
    error?: string;
}

export type ToolName =
    | 'read_file'
    | 'write_file'
    | 'edit_file'
    | 'run_command'
    | 'list_files'
    | 'search_files';

// ─── Tool Input Types ─────────────────────────────────────────────────

export interface ReadFileInput {
    path: string;
    offset?: number;
    limit?: number;
}

export interface WriteFileInput {
    path: string;
    content: string;
}

export interface EditFileInput {
    path: string;
    search: string;
    replace: string;
}

export interface RunCommandInput {
    command: string;
    timeout?: number;
}

export interface ListFilesInput {
    path?: string;
    recursive?: boolean;
    pattern?: string;
}

export interface SearchFilesInput {
    pattern: string;
    path?: string;
    include?: string;
}

export type ToolInput =
    | ReadFileInput
    | WriteFileInput
    | EditFileInput
    | RunCommandInput
    | ListFilesInput
    | SearchFilesInput;

// ─── Tool Context ─────────────────────────────────────────────────────

export interface ToolContext {
    projectPath: string;
    abortSignal?: AbortSignal;
    timeout?: number;
}

// ─── Agentic Loop Types ───────────────────────────────────────────────

export interface AgenticLoopParams {
    systemPrompt: string;
    userMessage: string;
    projectPath: string;
    model?: string;
    maxIterations?: number;
    abortSignal?: AbortSignal;
    onTextChunk?: (text: string) => void;
    onToolUse?: (toolName: string, input: ToolInput) => void;
    onToolResult?: (toolName: string, result: ToolResult) => void;
    onIterationStart?: (iteration: number) => void;
    onComplete?: (result: AgenticLoopResult) => void;
    onError?: (error: Error) => void;
}

export interface AgenticLoopResult {
    success: boolean;
    totalIterations: number;
    finalOutput: string;
    toolsUsed: Array<{ tool: string; input: ToolInput; result: ToolResult }>;
    error?: string;
}

// ─── Message Types ────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant';

export interface ContentBlockText {
    type: 'text';
    text: string;
}

export interface ContentBlockToolUse {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ContentBlockToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

export type ContentBlock = ContentBlockText | ContentBlockToolUse | ContentBlockToolResult;

export interface Message {
    role: MessageRole;
    content: ContentBlock[] | string;
}

// ─── Tool Definition for Anthropic API ────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
    {
        name: 'read_file',
        description: 'Read the contents of a file. Returns the file content as text. Use offset and limit for large files.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file from project root',
                },
                offset: {
                    type: 'number',
                    description: 'Line number to start reading from (0-indexed). Optional.',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of lines to read. Optional.',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing file with the provided content.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file from project root',
                },
                content: {
                    type: 'string',
                    description: 'Complete content to write to the file',
                },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Edit a file by searching for a specific text and replacing it. Use for targeted modifications.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file from project root',
                },
                search: {
                    type: 'string',
                    description: 'Exact text to search for (must match exactly)',
                },
                replace: {
                    type: 'string',
                    description: 'Text to replace the search string with',
                },
            },
            required: ['path', 'search', 'replace'],
        },
    },
    {
        name: 'run_command',
        description: 'Execute a shell command in the project directory. Use for git, npm, tests, etc.',
        input_schema: {
            type: 'object' as const,
            properties: {
                command: {
                    type: 'string',
                    description: 'Shell command to execute',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (default: 60000)',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'list_files',
        description: 'List files and directories. Supports recursive listing and glob patterns.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path relative to project root (default: ".")',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to list recursively (default: false)',
                },
                pattern: {
                    type: 'string',
                    description: 'Glob pattern to filter files (e.g., "*.ts", "**/*.tsx")',
                },
            },
            required: [],
        },
    },
    {
        name: 'search_files',
        description: 'Search for a pattern in files using grep-like functionality. Returns matching lines with file paths.',
        input_schema: {
            type: 'object' as const,
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Search pattern (regex supported)',
                },
                path: {
                    type: 'string',
                    description: 'Directory to search in (default: ".")',
                },
                include: {
                    type: 'string',
                    description: 'File pattern to include (e.g., "*.ts")',
                },
            },
            required: ['pattern'],
        },
    },
];
