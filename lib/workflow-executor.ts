'use client';

import {
  workflowService,
  workflowNodeService,
  workflowEdgeService,
  ticketService,
  memberService,
  projectService,
  conversationService,
  conversationMessageService,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type Ticket,
} from './client-db';
import { getExecutionOrder, getStartNodes } from './workflow-utils';

export type NodeExecutionStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowExecutionState {
  workflowId: string;
  status: Workflow['status'];
  currentNodeId: string | null;
  completedNodeIds: Set<string>;
  failedNodeIds: Set<string>;
  nodeStatuses: Map<string, NodeExecutionStatus>;
}

// Store execution states in memory
const executionStates = new Map<string, WorkflowExecutionState>();

// Polling interval for checking job status
const POLL_INTERVAL_MS = 1000;

// Strip ANSI escape codes from output (same as kanban mode)
function stripAnsi(input: string): string {
  return input
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function getExecutionState(workflowId: string): WorkflowExecutionState | null {
  return executionStates.get(workflowId) || null;
}

export function initializeExecutionState(workflowId: string): WorkflowExecutionState {
  const state: WorkflowExecutionState = {
    workflowId,
    status: 'idle',
    currentNodeId: null,
    completedNodeIds: new Set(),
    failedNodeIds: new Set(),
    nodeStatuses: new Map(),
  };
  executionStates.set(workflowId, state);
  return state;
}

async function waitForJobCompletion(
  ticketId: string,
  conversationId: string,
  jobId: string
): Promise<{ success: boolean; commitHash?: string }> {
  return new Promise((resolve) => {
    let lastOutputLength = 0;

    const checkStatus = async () => {
      try {
        // Fetch job status and output (same as kanban mode's pollOutput)
        const res = await fetch(`/api/agent/status?job_id=${jobId}`);
        const data = await res.json();

        // Poll output and save messages (same as kanban mode)
        const output = typeof data.output === 'string' ? data.output : '';
        if (output.length > lastOutputLength) {
          const delta = output.slice(lastOutputLength);
          const cleaned = stripAnsi(delta);
          const type =
            cleaned.includes('[stderr]') || cleaned.includes('[error]') || /(^|\n)\s*(error:|fatal:)/i.test(cleaned)
              ? 'error'
              : 'log';
          conversationMessageService.create(conversationId, cleaned, type);
          lastOutputLength = output.length;
        }

        const job = data.job;

        if (!job) {
          // Job not found, might have completed and been removed
          // Check the conversation status instead
          const conversation = conversationService.getById(conversationId);
          if (conversation?.status === 'completed') {
            resolve({ success: true, commitHash: conversation.git_commit_hash || undefined });
          } else if (conversation?.status === 'failed' || conversation?.status === 'cancelled') {
            resolve({ success: false });
          } else {
            // Assume completed if job is gone
            resolve({ success: true });
          }
          return;
        }

        if (job.status === 'completed') {
          // Final output fetch before resolving
          const finalOutput = typeof data.output === 'string' ? data.output : '';
          if (finalOutput.length > lastOutputLength) {
            const delta = finalOutput.slice(lastOutputLength);
            const cleaned = stripAnsi(delta);
            conversationMessageService.create(conversationId, cleaned, 'log');
          }
          resolve({ success: true, commitHash: job.commitHash });
          return;
        }

        if (job.status === 'failed') {
          resolve({ success: false });
          return;
        }

        // Still running, check again
        setTimeout(checkStatus, POLL_INTERVAL_MS);
      } catch (error) {
        console.error('[workflow-executor] Error checking job status:', error);
        setTimeout(checkStatus, POLL_INTERVAL_MS);
      }
    };

    checkStatus();
  });
}

async function executeNode(
  node: WorkflowNode,
  ticket: Ticket,
  projectId: string,
  agentId: string,
  provider: 'claude' | 'opencode' | 'codex'
): Promise<{ success: boolean; conversationId: string | null }> {
  try {
    // Get agent and project details
    const agent = memberService.getById(agentId);
    const project = projectService.getById(projectId);

    if (!agent || !project) {
      console.error('[workflow-executor] Agent or project not found');
      return { success: false, conversationId: null };
    }

    // Create conversation record (same as Kanban view)
    const conversation = conversationService.create({
      ticket_id: ticket.id,
      agent_id: agent.id,
      provider,
    });

    // Create initial system message
    conversationMessageService.create(
      conversation.id,
      `🚀 ${agent.name} started working on "${ticket.title}" (Workflow)`,
      'system'
    );

    // Start the agent job using the correct API endpoint
    const response = await fetch('/api/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket: {
          id: ticket.id,
          title: ticket.title,
          description: ticket.description,
        },
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          avatar: agent.avatar,
          system_prompt: agent.system_prompt,
          can_generate_images: agent.can_generate_images,
          can_log_screenshots: agent.can_log_screenshots,
        },
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
        },
        conversation_id: conversation.id,
        provider,
      }),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok || !responseData.success) {
      console.error('[workflow-executor] Failed to start agent job:', responseData);
      conversationService.complete(conversation.id, { status: 'failed' });
      conversationMessageService.create(conversation.id, '❌ Failed to start agent job', 'error');
      return { success: false, conversationId: conversation.id };
    }

    const jobId = responseData.job_id;
    if (!jobId) {
      console.error('[workflow-executor] No job_id returned from API');
      conversationService.complete(conversation.id, { status: 'failed' });
      conversationMessageService.create(conversation.id, '❌ No job ID received', 'error');
      return { success: false, conversationId: conversation.id };
    }

    // Wait for job completion (with output polling)
    const result = await waitForJobCompletion(ticket.id, conversation.id, jobId);

    // Update conversation status
    conversationService.complete(conversation.id, {
      status: result.success ? 'completed' : 'failed',
      git_commit_hash: result.commitHash,
    });

    if (result.success) {
      conversationMessageService.create(conversation.id, '✅ Task completed successfully', 'success');
    } else {
      conversationMessageService.create(conversation.id, '❌ Task failed', 'error');
    }

    return { success: result.success, conversationId: conversation.id };
  } catch (error) {
    console.error('[workflow-executor] Error executing node:', error);
    return { success: false, conversationId: null };
  }
}

export interface ExecuteWorkflowOptions {
  projectId: string;
  defaultAgentId: string;
  provider: 'claude' | 'opencode' | 'codex';
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, success: boolean) => void;
  onWorkflowComplete?: (success: boolean) => void;
}

export async function executeWorkflow(
  workflowId: string,
  options: ExecuteWorkflowOptions
): Promise<boolean> {
  const workflow = workflowService.getById(workflowId);
  if (!workflow) {
    console.error('[workflow-executor] Workflow not found:', workflowId);
    return false;
  }

  const nodes = workflowNodeService.getByWorkflowId(workflowId);
  const edges = workflowEdgeService.getByWorkflowId(workflowId);

  if (nodes.length === 0) {
    console.warn('[workflow-executor] Workflow has no nodes');
    return true;
  }

  // Initialize execution state
  const state = initializeExecutionState(workflowId);
  state.status = 'running';

  // Initialize all node statuses
  for (const node of nodes) {
    state.nodeStatuses.set(node.id, 'idle');
  }

  // Update workflow status in DB
  workflowService.update(workflowId, { status: 'running' });

  // Get execution order
  const executionOrder = getExecutionOrder(nodes, edges);

  if (executionOrder.length !== nodes.length) {
    console.error('[workflow-executor] Cycle detected in workflow');
    state.status = 'failed';
    workflowService.update(workflowId, { status: 'failed' });
    return false;
  }

  try {
    // Execute nodes in order
    for (const nodeId of executionOrder) {
      // Check if workflow was paused or stopped
      const currentState = executionStates.get(workflowId);
      if (currentState?.status === 'paused' || currentState?.status === 'failed') {
        break;
      }

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const ticket = ticketService.getById(node.ticket_id);
      if (!ticket) {
        console.warn('[workflow-executor] Ticket not found for node:', nodeId);
        state.failedNodeIds.add(nodeId);
        state.nodeStatuses.set(nodeId, 'failed');
        continue;
      }

      // Update current node
      state.currentNodeId = nodeId;
      state.nodeStatuses.set(nodeId, 'running');
      workflowService.update(workflowId, { current_node_id: nodeId });

      // Notify callback
      options.onNodeStart?.(nodeId);

      // Get agent from ticket or use default
      const agentId = ticket.assignee_ids?.[0] || options.defaultAgentId;

      // Update ticket status to IN_PROGRESS
      ticketService.update(ticket.id, { status: 'IN_PROGRESS' });

      // Execute the node
      const result = await executeNode(
        node,
        ticket,
        options.projectId,
        agentId,
        options.provider
      );

      if (result.success) {
        state.completedNodeIds.add(nodeId);
        state.nodeStatuses.set(nodeId, 'completed');

        // Update ticket status to COMPLETE
        ticketService.update(ticket.id, { status: 'COMPLETE' });
      } else {
        state.failedNodeIds.add(nodeId);
        state.nodeStatuses.set(nodeId, 'failed');
        state.status = 'failed';

        // Update ticket status to NEED_FIX
        ticketService.update(ticket.id, { status: 'NEED_FIX' });

        // Notify callback
        options.onNodeComplete?.(nodeId, false);

        // Stop execution on failure
        workflowService.update(workflowId, { status: 'failed' });
        options.onWorkflowComplete?.(false);
        return false;
      }

      // Notify callback
      options.onNodeComplete?.(nodeId, true);
    }

    // All nodes completed successfully
    state.status = 'completed';
    state.currentNodeId = null;
    workflowService.update(workflowId, { status: 'completed', current_node_id: null });
    options.onWorkflowComplete?.(true);
    return true;
  } catch (error) {
    console.error('[workflow-executor] Error executing workflow:', error);
    state.status = 'failed';
    workflowService.update(workflowId, { status: 'failed' });
    options.onWorkflowComplete?.(false);
    return false;
  }
}

export function pauseWorkflow(workflowId: string): void {
  const state = executionStates.get(workflowId);
  if (state && state.status === 'running') {
    state.status = 'paused';
    workflowService.update(workflowId, { status: 'paused' });
  }
}

export function resetWorkflow(workflowId: string): void {
  const state = executionStates.get(workflowId);
  if (state) {
    state.status = 'idle';
    state.currentNodeId = null;
    state.completedNodeIds.clear();
    state.failedNodeIds.clear();
    state.nodeStatuses.clear();
  }
  workflowService.update(workflowId, { status: 'idle', current_node_id: null });
}

export function clearExecutionState(workflowId: string): void {
  executionStates.delete(workflowId);
}
