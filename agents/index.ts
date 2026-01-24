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

// Development Team
import { pmAgent } from './pm';
import { feDevAgent } from './fe-dev';
import { beDevAgent } from './be-dev';
import { qaAgent } from './qa';
import { devopsAgent } from './devops';
import { bugHunterAgent } from './bug-hunter';

// Extended Team
import { researcherAgent } from './researcher';
import { contentWriterAgent } from './content-writer';
import { dataAnalystAgent } from './data-analyst';
import { securityExpertAgent } from './security-expert';
import { uxDesignerAgent } from './ux-designer';
import { marketingSpecialistAgent } from './marketing-specialist';
import { techWriterAgent } from './tech-writer';
import { mobileDevAgent } from './mobile-dev';
import { mlEngineerAgent } from './ml-engineer';
import { fullstackDevAgent } from './fullstack-dev';
import { codeReviewerAgent } from './code-reviewer';
import { dbaAgent } from './dba';
import { productManagerAgent } from './product-manager';
import { automationEngineerAgent } from './automation-engineer';

import type { AgentDefinition } from './types';

// Export individual agents for direct access
// Development Team
export { pmAgent } from './pm';
export { feDevAgent } from './fe-dev';
export { beDevAgent } from './be-dev';
export { qaAgent } from './qa';
export { devopsAgent } from './devops';
export { bugHunterAgent } from './bug-hunter';

// Extended Team
export { researcherAgent } from './researcher';
export { contentWriterAgent } from './content-writer';
export { dataAnalystAgent } from './data-analyst';
export { securityExpertAgent } from './security-expert';
export { uxDesignerAgent } from './ux-designer';
export { marketingSpecialistAgent } from './marketing-specialist';
export { techWriterAgent } from './tech-writer';
export { mobileDevAgent } from './mobile-dev';
export { mlEngineerAgent } from './ml-engineer';
export { fullstackDevAgent } from './fullstack-dev';
export { codeReviewerAgent } from './code-reviewer';
export { dbaAgent } from './dba';
export { productManagerAgent } from './product-manager';
export { automationEngineerAgent } from './automation-engineer';

/**
 * Array of all default agents.
 * Add new agents here to include them in the initial setup.
 */
export const DEFAULT_AGENTS: AgentDefinition[] = [
  // Core Development Team
  pmAgent,
  feDevAgent,
  beDevAgent,
  qaAgent,
  devopsAgent,
  bugHunterAgent,

  // Extended Team - Research & Analysis
  researcherAgent,
  dataAnalystAgent,

  // Extended Team - Content & Marketing
  contentWriterAgent,
  marketingSpecialistAgent,
  techWriterAgent,

  // Extended Team - Design
  uxDesignerAgent,

  // Extended Team - Specialized Development
  mobileDevAgent,
  fullstackDevAgent,
  mlEngineerAgent,
  dbaAgent,

  // Extended Team - Security & Quality
  securityExpertAgent,
  codeReviewerAgent,

  // Extended Team - Management & Operations
  productManagerAgent,
  automationEngineerAgent,
];
