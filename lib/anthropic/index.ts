/**
 * Anthropic API Integration
 *
 * Main export file for the Anthropic direct API integration
 */

// Client
export {
    getClient,
    getConfiguredModel,
    getMaxIterations,
    getToolTimeout,
    isConfigured,
} from './client';

// Agentic loop
export { runAgenticLoop } from './agentic-loop';

// Types
export type {
    ToolResult,
    ToolName,
    ToolInput,
    ToolContext,
    ReadFileInput,
    WriteFileInput,
    EditFileInput,
    RunCommandInput,
    ListFilesInput,
    SearchFilesInput,
    AgenticLoopParams,
    AgenticLoopResult,
    Message,
    MessageRole,
    ContentBlock,
    ContentBlockText,
    ContentBlockToolUse,
    ContentBlockToolResult,
} from './types';

export { TOOL_DEFINITIONS } from './types';

// Tools
export { executeTool } from './tools';

// Security
export {
    validatePath,
    validateCommand,
    containsSensitiveData,
    sanitizeOutput,
} from './security';
