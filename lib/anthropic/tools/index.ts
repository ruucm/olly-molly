/**
 * Tool registry and dispatcher
 */

import type {
    ToolName,
    ToolInput,
    ToolResult,
    ToolContext,
    ReadFileInput,
    WriteFileInput,
    EditFileInput,
    RunCommandInput,
    ListFilesInput,
    SearchFilesInput,
} from '../types';

import { readFile } from './read-file';
import { writeFile } from './write-file';
import { editFile } from './edit-file';
import { runCommand } from './run-command';
import { listFiles } from './list-files';
import { searchFiles } from './search-files';

/**
 * Execute a tool by name with given input
 */
export async function executeTool(
    toolName: ToolName,
    input: ToolInput,
    context: ToolContext
): Promise<ToolResult> {
    switch (toolName) {
        case 'read_file':
            return readFile(input as ReadFileInput, context);

        case 'write_file':
            return writeFile(input as WriteFileInput, context);

        case 'edit_file':
            return editFile(input as EditFileInput, context);

        case 'run_command':
            return runCommand(input as RunCommandInput, context);

        case 'list_files':
            return listFiles(input as ListFilesInput, context);

        case 'search_files':
            return searchFiles(input as SearchFilesInput, context);

        default:
            return {
                success: false,
                output: '',
                error: `Unknown tool: ${toolName}`,
            };
    }
}

// Re-export individual tools
export { readFile } from './read-file';
export { writeFile } from './write-file';
export { editFile } from './edit-file';
export { runCommand } from './run-command';
export { listFiles } from './list-files';
export { searchFiles } from './search-files';
