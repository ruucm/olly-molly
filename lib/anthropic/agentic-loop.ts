/**
 * Agentic loop implementation for Anthropic API
 *
 * Implements the agentic pattern:
 * 1. Send message to Claude
 * 2. Stream response
 * 3. If stop_reason === 'tool_use', execute tools and continue
 * 4. If stop_reason === 'end_turn', complete
 * 5. Repeat until max_iterations or completion
 */

import type Anthropic from '@anthropic-ai/sdk';
import { getClient, getConfiguredModel, getMaxIterations, getToolTimeout } from './client';
import { executeTool } from './tools';
import type {
    AgenticLoopParams,
    AgenticLoopResult,
    ToolName,
    ToolInput,
    ToolResult,
    Message,
    TOOL_DEFINITIONS,
} from './types';
import { TOOL_DEFINITIONS as TOOLS } from './types';

type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;
type ToolUseBlock = Anthropic.ToolUseBlock;
type TextBlock = Anthropic.TextBlock;

/**
 * Run the agentic loop
 */
export async function runAgenticLoop(params: AgenticLoopParams): Promise<AgenticLoopResult> {
    const {
        systemPrompt,
        userMessage,
        projectPath,
        model = getConfiguredModel(),
        maxIterations = getMaxIterations(),
        abortSignal,
        onTextChunk,
        onToolUse,
        onToolResult,
        onIterationStart,
        onComplete,
        onError,
    } = params;

    const client = getClient();
    const toolTimeout = getToolTimeout();

    // Track conversation history
    const messages: MessageParam[] = [
        {
            role: 'user',
            content: userMessage,
        },
    ];

    // Track tools used
    const toolsUsed: Array<{ tool: string; input: ToolInput; result: ToolResult }> = [];

    let totalIterations = 0;
    let finalOutput = '';

    try {
        while (totalIterations < maxIterations) {
            // Check for abort
            if (abortSignal?.aborted) {
                return {
                    success: false,
                    totalIterations,
                    finalOutput,
                    toolsUsed,
                    error: 'Aborted by user',
                };
            }

            totalIterations++;
            onIterationStart?.(totalIterations);

            // Make API call with streaming
            const stream = client.messages.stream({
                model,
                max_tokens: 8192,
                system: systemPrompt,
                messages,
                tools: TOOLS,
            });

            // Collect the response
            let assistantText = '';
            const toolUseBlocks: ToolUseBlock[] = [];
            let stopReason: string | null = null;

            // Process the stream
            for await (const event of stream) {
                // Check for abort during streaming
                if (abortSignal?.aborted) {
                    stream.abort();
                    return {
                        success: false,
                        totalIterations,
                        finalOutput: finalOutput + assistantText,
                        toolsUsed,
                        error: 'Aborted by user',
                    };
                }

                if (event.type === 'content_block_delta') {
                    const delta = event.delta;
                    if ('text' in delta && delta.text) {
                        assistantText += delta.text;
                        onTextChunk?.(delta.text);
                    }
                } else if (event.type === 'content_block_stop') {
                    // Content block finished - check if it was a tool use
                    const message = await stream.finalMessage();
                    for (const block of message.content) {
                        if (block.type === 'tool_use') {
                            toolUseBlocks.push(block);
                        }
                    }
                } else if (event.type === 'message_stop') {
                    const message = await stream.finalMessage();
                    stopReason = message.stop_reason;
                }
            }

            // Get final message to ensure we have all content
            const finalMessage = await stream.finalMessage();
            stopReason = finalMessage.stop_reason;

            // Extract tool uses from final message if not already captured
            if (toolUseBlocks.length === 0) {
                for (const block of finalMessage.content) {
                    if (block.type === 'tool_use') {
                        toolUseBlocks.push(block);
                    }
                }
            }

            // Update final output
            finalOutput += assistantText;

            // Build assistant message content
            const assistantContent: ContentBlockParam[] = [];
            if (assistantText) {
                assistantContent.push({ type: 'text', text: assistantText });
            }
            for (const toolUse of toolUseBlocks) {
                assistantContent.push({
                    type: 'tool_use',
                    id: toolUse.id,
                    name: toolUse.name,
                    input: toolUse.input as Record<string, unknown>,
                });
            }

            // Add assistant message to history
            if (assistantContent.length > 0) {
                messages.push({
                    role: 'assistant',
                    content: assistantContent,
                });
            }

            // Check stop reason
            if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
                // Claude is done
                const result: AgenticLoopResult = {
                    success: true,
                    totalIterations,
                    finalOutput,
                    toolsUsed,
                };
                onComplete?.(result);
                return result;
            }

            if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
                // Execute tools
                const toolResults: ContentBlockParam[] = [];

                for (const toolUse of toolUseBlocks) {
                    const toolName = toolUse.name as ToolName;
                    const toolInput = toolUse.input as ToolInput;

                    onToolUse?.(toolName, toolInput);

                    // Execute the tool
                    const result = await executeTool(toolName, toolInput, {
                        projectPath,
                        abortSignal,
                        timeout: toolTimeout,
                    });

                    onToolResult?.(toolName, result);

                    toolsUsed.push({
                        tool: toolName,
                        input: toolInput,
                        result,
                    });

                    // Add tool result
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: result.error
                            ? `Error: ${result.error}\n${result.output}`
                            : result.output,
                        is_error: !result.success,
                    });
                }

                // Add tool results as user message
                messages.push({
                    role: 'user',
                    content: toolResults,
                });

                // Continue the loop
                continue;
            }

            // Unexpected stop reason or max_tokens
            if (stopReason === 'max_tokens') {
                // Continue with a prompt to complete
                messages.push({
                    role: 'user',
                    content: 'Please continue where you left off.',
                });
                continue;
            }

            // Unknown stop reason - treat as completion
            const result: AgenticLoopResult = {
                success: true,
                totalIterations,
                finalOutput,
                toolsUsed,
            };
            onComplete?.(result);
            return result;
        }

        // Max iterations reached
        const result: AgenticLoopResult = {
            success: false,
            totalIterations,
            finalOutput,
            toolsUsed,
            error: `Max iterations (${maxIterations}) reached`,
        };
        onComplete?.(result);
        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        onError?.(error instanceof Error ? error : new Error(errorMessage));

        return {
            success: false,
            totalIterations,
            finalOutput,
            toolsUsed,
            error: errorMessage,
        };
    }
}
