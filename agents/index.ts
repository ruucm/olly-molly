/**
 * Default Agents for Olly Molly
 *
 * To add a new agent:
 * 1. Create a new file in this directory (e.g., my-agent.ts)
 * 2. Export an AgentDefinition object
 * 3. Import and add it to the DEFAULT_AGENTS array below
 *
 * Example:
 * ```typescript
 * // agents/my-agent.ts
 * import type { AgentDefinition } from './types';
 *
 * export const myAgent: AgentDefinition = {
 *   id: 'my-agent-001',
 *   role: 'MY_ROLE',
 *   name: 'My Custom Agent',
 *   avatar: '🤖',
 *   profile_image: null,
 *   system_prompt: `Your system prompt here...`,
 *   is_default: 1,
 *   can_generate_images: 0,
 *   can_log_screenshots: 0,
 * };
 * ```
 */

export type { AgentDefinition } from './types';

import { pmAgent } from './pm';
import { feDevAgent } from './fe-dev';
import { beDevAgent } from './be-dev';
import { qaAgent } from './qa';
import { devopsAgent } from './devops';
import { bugHunterAgent } from './bug-hunter';

import type { AgentDefinition } from './types';

// Export individual agents for direct access
export { pmAgent } from './pm';
export { feDevAgent } from './fe-dev';
export { beDevAgent } from './be-dev';
export { qaAgent } from './qa';
export { devopsAgent } from './devops';
export { bugHunterAgent } from './bug-hunter';

/**
 * Array of all default agents.
 * Add new agents here to include them in the initial setup.
 */
export const DEFAULT_AGENTS: AgentDefinition[] = [
  pmAgent,
  feDevAgent,
  beDevAgent,
  qaAgent,
  devopsAgent,
  bugHunterAgent,
];
