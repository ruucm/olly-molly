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

export type { AgentDefinition, AgentCategory, MarketAgentDefinition } from './types';
export { getAgentMetadata } from './types';

import { pmAgent } from './pm';
import { bugHunterAgent } from './bug-hunter';
import { uiArchitectAgent } from './ui-architect';
import { interactionDevAgent } from './interaction-dev';
import { vercelAgent } from './vercel-agent';
import { simpleBackendAgent } from './simple-backend';
import { githubAgent } from './github-agent';
import { recipeAgent } from './recipe';
import { dystopiaDiaryAgent } from './dystopia-diary';
import { instagramAnalystAgent } from './instagram-analyst';
import { adCreatorAgent } from './ad-creator';
import { tosspaymentsAgent } from './tosspayments';
import { reactSingleAgent } from './react-single';
import { authSingleAgent } from './auth-single';

import type { AgentDefinition } from './types';

// Export individual agents for direct access
export { pmAgent } from './pm';
export { bugHunterAgent } from './bug-hunter';
export { uiArchitectAgent } from './ui-architect';
export { interactionDevAgent } from './interaction-dev';
export { vercelAgent } from './vercel-agent';
export { simpleBackendAgent } from './simple-backend';
export { githubAgent } from './github-agent';
export { recipeAgent } from './recipe';
export { dystopiaDiaryAgent } from './dystopia-diary';
export { instagramAnalystAgent } from './instagram-analyst';
export { adCreatorAgent } from './ad-creator';
export { tosspaymentsAgent } from './tosspayments';
export { reactSingleAgent } from './react-single';
export { authSingleAgent } from './auth-single';

/**
 * Array of all default agents.
 * Add new agents here to include them in the initial setup.
 */
export const DEFAULT_AGENTS: AgentDefinition[] = [
  pmAgent,
  bugHunterAgent,
  uiArchitectAgent,
  interactionDevAgent,
  vercelAgent,
  simpleBackendAgent,
  githubAgent,
  recipeAgent,
  dystopiaDiaryAgent,
  instagramAnalystAgent,
  adCreatorAgent,
  tosspaymentsAgent,
  reactSingleAgent,
  authSingleAgent,
];
