'use client';

import {
  workflowService,
  workflowNodeService,
  workflowEdgeService,
  ticketService,
  memberService,
  projectService,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type Ticket,
} from './client-db';
import { getExecutionOrder, getStartNodes } from './workflow-utils';

export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowExecutionState {
  workflowId: string;
  executionId: string | null;
  status: Workflow['status'];
  currentNodeId: string | null;
  completedNodeIds: Set<string>;
  failedNodeIds: Set<string>;
  nodeStatuses: Map<string, NodeExecutionStatus>;
}

// Store execution states in memory (client-side cache)
const executionStates = new Map<string, WorkflowExecutionState>();

// Polling interval for checking server status
const POLL_INTERVAL_MS = 2000;

export function getExecutionState(workflowId: string): WorkflowExecutionState | null {
  return executionStates.get(workflowId) || null;
}

export function initializeExecutionState(workflowId: string): WorkflowExecutionState {
  const state: WorkflowExecutionState = {
    workflowId,
    executionId: null,
    status: 'idle',
    currentNodeId: null,
    completedNodeIds: new Set(),
    failedNodeIds: new Set(),
    nodeStatuses: new Map(),
  };
  executionStates.set(workflowId, state);
  return state;
}

export interface ExecuteWorkflowOptions {
  projectId: string;
  defaultAgentId: string;
  provider: 'claude' | 'opencode' | 'codex';
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, success: boolean) => void;
  onWorkflowComplete?: (success: boolean) => void;
}

/**
 * Execute workflow via server API.
 * Server handles the execution loop, browser just polls for status.
 */
export async function executeWorkflow(
  workflowId: string,
  options: ExecuteWorkflowOptions
): Promise<boolean> {
  console.log('[workflow-executor] ===== Server-Driven Workflow Execution =====');
  console.log('[workflow-executor] Starting workflow execution:', workflowId);

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

  // Get project
  const project = projectService.getById(options.projectId);
  if (!project) {
    console.error('[workflow-executor] Project not found:', options.projectId);
    return false;
  }

  // Initialize execution state
  const state = initializeExecutionState(workflowId);
  state.status = 'running';

  // Initialize all node statuses
  for (const node of nodes) {
    state.nodeStatuses.set(node.id, 'pending');
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

  // Build node data for server
  const nodeDataList = [];
  for (const nodeId of executionOrder) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    const ticket = ticketService.getById(node.ticket_id);
    if (!ticket) continue;

    const agentId = ticket.assignee_ids?.[0] || options.defaultAgentId;
    const agent = memberService.getById(agentId);
    if (!agent) continue;

    nodeDataList.push({
      id: node.id,
      ticket_id: ticket.id,
      ticket_title: ticket.title,
      ticket_description: ticket.description || '',
      agent_id: agent.id,
      agent_name: agent.name,
      agent_role: agent.role || '',
      agent_system_prompt: agent.system_prompt || '',
    });
  }

  try {
    // Start execution on server
    const response = await fetch('/api/workflow/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflowId,
        workflow_name: workflow.name,
        project_id: project.id,
        project_path: project.path,
        provider: options.provider,
        nodes: nodeDataList,
        execution_order: executionOrder,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[workflow-executor] Failed to start workflow on server:', data.error);
      state.status = 'failed';
      workflowService.update(workflowId, { status: 'failed' });
      options.onWorkflowComplete?.(false);
      return false;
    }

    state.executionId = data.execution_id;
    console.log('[workflow-executor] Server execution started:', data.execution_id);

    // Poll for status updates
    const pollResult = await pollWorkflowStatus(
      workflowId,
      data.execution_id,
      state,
      options
    );

    return pollResult;

  } catch (error) {
    console.error('[workflow-executor] Error starting workflow:', error);
    state.status = 'failed';
    workflowService.update(workflowId, { status: 'failed' });
    options.onWorkflowComplete?.(false);
    return false;
  }
}

async function pollWorkflowStatus(
  workflowId: string,
  executionId: string,
  state: WorkflowExecutionState,
  options: ExecuteWorkflowOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    let lastNodeIndex = -1;
    let lastNodeStatuses: Record<string, string> = {};

    const poll = async () => {
      try {
        const response = await fetch(`/api/workflow/status?execution_id=${executionId}`);
        const data = await response.json();

        if (!data.success || !data.execution) {
          console.error('[workflow-executor] Failed to get execution status');
          setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        const exec = data.execution;

        // Update local state from server
        state.status = exec.status;

        // Check for node status changes
        for (const [nodeId, nodeStatus] of Object.entries(exec.node_statuses)) {
          const prevStatus = lastNodeStatuses[nodeId];
          const typedStatus = nodeStatus as NodeExecutionStatus;

          if (prevStatus !== nodeStatus) {
            state.nodeStatuses.set(nodeId, typedStatus);

            if (typedStatus === 'running' && prevStatus !== 'running') {
              options.onNodeStart?.(nodeId);
              workflowService.update(workflowId, { current_node_id: nodeId });

              // Update ticket status to IN_PROGRESS
              const node = exec.nodes.find((n: { id: string }) => n.id === nodeId);
              if (node) {
                ticketService.update(node.ticket_id, { status: 'IN_PROGRESS' });
              }
            }

            if (typedStatus === 'completed') {
              state.completedNodeIds.add(nodeId);
              options.onNodeComplete?.(nodeId, true);

              // Update ticket status to COMPLETE
              const node = exec.nodes.find((n: { id: string }) => n.id === nodeId);
              if (node) {
                ticketService.update(node.ticket_id, { status: 'COMPLETE' });
              }
            }

            if (typedStatus === 'failed') {
              state.failedNodeIds.add(nodeId);
              options.onNodeComplete?.(nodeId, false);

              // Update ticket status to NEED_FIX
              const node = exec.nodes.find((n: { id: string }) => n.id === nodeId);
              if (node) {
                ticketService.update(node.ticket_id, { status: 'NEED_FIX' });
              }
            }
          }
        }
        lastNodeStatuses = exec.node_statuses;

        // Check if workflow is complete
        if (exec.status === 'completed') {
          console.log('[workflow-executor] Workflow completed successfully');
          workflowService.update(workflowId, { status: 'completed', current_node_id: null });
          options.onWorkflowComplete?.(true);
          resolve(true);
          return;
        }

        if (exec.status === 'failed') {
          console.log('[workflow-executor] Workflow failed:', exec.error);
          workflowService.update(workflowId, { status: 'failed' });
          options.onWorkflowComplete?.(false);
          resolve(false);
          return;
        }

        if (exec.status === 'paused') {
          console.log('[workflow-executor] Workflow paused');
          workflowService.update(workflowId, { status: 'paused' });
          // Keep polling in case it resumes
          setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        // Still running, continue polling
        setTimeout(poll, POLL_INTERVAL_MS);

      } catch (error) {
        console.error('[workflow-executor] Error polling status:', error);
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  });
}

export function pauseWorkflow(workflowId: string): void {
  const state = executionStates.get(workflowId);
  if (state?.executionId) {
    // Notify server to pause
    fetch('/api/workflow/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        execution_id: state.executionId,
        action: 'pause',
      }),
    }).catch(console.error);
  }
  workflowService.update(workflowId, { status: 'paused' });
}

export function resetWorkflow(workflowId: string): void {
  const state = executionStates.get(workflowId);
  if (state) {
    state.status = 'idle';
    state.executionId = null;
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

/**
 * Check if there's a running workflow on the server and sync status.
 * Call this on page load to recover from browser close.
 */
export async function syncWorkflowStatus(workflowId: string): Promise<WorkflowExecutionState | null> {
  try {
    const response = await fetch(`/api/workflow/status?workflow_id=${workflowId}`);
    const data = await response.json();

    if (data.success && data.execution) {
      const exec = data.execution;

      // Initialize or update local state
      let state = executionStates.get(workflowId);
      if (!state) {
        state = initializeExecutionState(workflowId);
      }

      state.executionId = exec.id;
      state.status = exec.status;

      for (const [nodeId, nodeStatus] of Object.entries(exec.node_statuses)) {
        state.nodeStatuses.set(nodeId, nodeStatus as NodeExecutionStatus);
        if (nodeStatus === 'completed') {
          state.completedNodeIds.add(nodeId);
        }
        if (nodeStatus === 'failed') {
          state.failedNodeIds.add(nodeId);
        }
      }

      // Update local workflow status
      workflowService.update(workflowId, { status: exec.status });

      return state;
    }

    return null;
  } catch (error) {
    console.error('[workflow-executor] Error syncing workflow status:', error);
    return null;
  }
}
