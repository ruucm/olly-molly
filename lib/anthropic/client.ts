/**
 * Anthropic SDK client initialization
 */

import Anthropic from '@anthropic-ai/sdk';

// Environment variable keys for model configuration
const MODEL_ENV_KEYS = [
    'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_MODEL',
    'CLAUDE_MODEL',
];

// Default model if not specified
const DEFAULT_MODEL = 'claude-opus-4-20250514';

// Default max iterations for agentic loop
const DEFAULT_MAX_ITERATIONS = 50;

// Default tool execution timeout (ms)
const DEFAULT_TOOL_TIMEOUT = 60000;

let clientInstance: Anthropic | null = null;

/**
 * Get or create the Anthropic client instance
 */
export function getClient(): Anthropic {
    if (!clientInstance) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }
        clientInstance = new Anthropic({ apiKey });
    }
    return clientInstance;
}

/**
 * Get the configured model from environment variables
 */
export function getConfiguredModel(): string {
    for (const key of MODEL_ENV_KEYS) {
        const value = process.env[key];
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return DEFAULT_MODEL;
}

/**
 * Get the max iterations configuration
 */
export function getMaxIterations(): number {
    const value = process.env.ANTHROPIC_MAX_ITERATIONS;
    if (value) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_MAX_ITERATIONS;
}

/**
 * Get the tool timeout configuration
 */
export function getToolTimeout(): number {
    const value = process.env.ANTHROPIC_TOOL_TIMEOUT;
    if (value) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_TOOL_TIMEOUT;
}

/**
 * Check if API key is configured
 */
export function isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
}
