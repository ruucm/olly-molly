/**
 * Server-side workflow execution state store.
 * Follows ComfyUI pattern - server owns all execution state.
 */

import {
  createConversation,
  addMessage,
  completeConversation,
  getConversation,
  updateTicketStatus,
} from './server-store';
import { startBackgroundJob, getJobById, getJobOutput } from './agent-jobs';

export type WorkflowExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';
export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowNodeData {
  id: string;
  ticket_id: string;
  ticket_title: string;
  ticket_description: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  agent_system_prompt: string;
}

export interface WorkflowExecutionState {
  id: string;
  workflow_id: string;
  workflow_name: string;
  project_id: string;
  project_path: string;
  provider: 'claude' | 'opencode' | 'codex';
  status: WorkflowExecutionStatus;
  nodes: WorkflowNodeData[];
  execution_order: string[]; // node IDs in order
  current_node_index: number;
  current_job_id: string | null;
  current_conversation_id: string | null;
  node_statuses: Record<string, NodeExecutionStatus>;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

// In-memory store for running workflow executions
const workflowExecutions = new Map<string, WorkflowExecutionState>();

// Polling interval for checking job status
const POLL_INTERVAL_MS = 2000;
const JOB_START_DELAY_MS = 2000;

export function createWorkflowExecution(params: {
  workflow_id: string;
  workflow_name: string;
  project_id: string;
  project_path: string;
  provider: 'claude' | 'opencode' | 'codex';
  nodes: WorkflowNodeData[];
  execution_order: string[];
}): WorkflowExecutionState {
  const id = `wf-exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const node_statuses: Record<string, NodeExecutionStatus> = {};
  for (const node of params.nodes) {
    node_statuses[node.id] = 'idle';
  }

  const state: WorkflowExecutionState = {
    id,
    workflow_id: params.workflow_id,
    workflow_name: params.workflow_name,
    project_id: params.project_id,
    project_path: params.project_path,
    provider: params.provider,
    status: 'running',
    nodes: params.nodes,
    execution_order: params.execution_order,
    current_node_index: 0,
    current_job_id: null,
    current_conversation_id: null,
    node_statuses,
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };

  workflowExecutions.set(id, state);

  // Start the execution loop
  runWorkflowLoop(id);

  return state;
}

export function getWorkflowExecution(id: string): WorkflowExecutionState | null {
  return workflowExecutions.get(id) || null;
}

export function getWorkflowExecutionByWorkflowId(workflow_id: string): WorkflowExecutionState | null {
  for (const exec of workflowExecutions.values()) {
    if (exec.workflow_id === workflow_id && exec.status === 'running') {
      return exec;
    }
  }
  return null;
}

export function pauseWorkflowExecution(id: string): boolean {
  const exec = workflowExecutions.get(id);
  if (exec && exec.status === 'running') {
    exec.status = 'paused';
    return true;
  }
  return false;
}

export function resumeWorkflowExecution(id: string): boolean {
  const exec = workflowExecutions.get(id);
  if (exec && exec.status === 'paused') {
    exec.status = 'running';
    runWorkflowLoop(id);
    return true;
  }
  return false;
}

/**
 * Main workflow execution loop - runs on the server.
 * This survives browser close.
 */
async function runWorkflowLoop(executionId: string): Promise<void> {
  const exec = workflowExecutions.get(executionId);
  if (!exec) {
    console.error('[workflow-store] Execution not found:', executionId);
    return;
  }

  console.log(`[workflow-store] Starting workflow execution loop for ${exec.workflow_name}`);

  try {
    while (exec.current_node_index < exec.execution_order.length) {
      // Check if paused
      if (exec.status === 'paused') {
        console.log('[workflow-store] Workflow paused, stopping loop');
        return;
      }

      if (exec.status !== 'running') {
        console.log('[workflow-store] Workflow not running, stopping loop');
        return;
      }

      const nodeId = exec.execution_order[exec.current_node_index];
      const node = exec.nodes.find(n => n.id === nodeId);

      if (!node) {
        console.error('[workflow-store] Node not found:', nodeId);
        exec.current_node_index++;
        continue;
      }

      console.log(`[workflow-store] Executing node ${exec.current_node_index + 1}/${exec.execution_order.length}: ${node.ticket_title}`);

      // Mark node as running and update ticket status
      exec.node_statuses[nodeId] = 'running';
      updateTicketStatus(node.ticket_id, 'IN_PROGRESS');

      // Execute the node
      const result = await executeWorkflowNode(exec, node);

      if (result.success) {
        exec.node_statuses[nodeId] = 'completed';
        updateTicketStatus(node.ticket_id, 'COMPLETE');
        console.log(`[workflow-store] Node completed: ${node.ticket_title}`);
      } else {
        exec.node_statuses[nodeId] = 'failed';
        updateTicketStatus(node.ticket_id, 'NEED_FIX');
        exec.status = 'failed';
        exec.error = result.error || 'Node execution failed';
        exec.completed_at = new Date().toISOString();
        console.error(`[workflow-store] Node failed: ${node.ticket_title}`, result.error);
        return;
      }

      exec.current_node_index++;

      // Delay between nodes
      if (exec.current_node_index < exec.execution_order.length) {
        await delay(JOB_START_DELAY_MS);
      }
    }

    // All nodes completed
    exec.status = 'completed';
    exec.completed_at = new Date().toISOString();
    console.log(`[workflow-store] Workflow completed: ${exec.workflow_name}`);

  } catch (error) {
    exec.status = 'failed';
    exec.error = error instanceof Error ? error.message : 'Unknown error';
    exec.completed_at = new Date().toISOString();
    console.error('[workflow-store] Workflow execution error:', error);
  }
}

async function executeWorkflowNode(
  exec: WorkflowExecutionState,
  node: WorkflowNodeData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create conversation
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    createConversation({
      id: conversationId,
      ticket_id: node.ticket_id,
      agent_id: node.agent_id,
      provider: exec.provider,
    });

    addMessage(conversationId, `🚀 ${node.agent_name} started working on "${node.ticket_title}"...`, 'system');

    exec.current_conversation_id = conversationId;

    // Build the prompt
    const fullPrompt = `${node.agent_system_prompt || ''}\n\n## Task\n${node.ticket_title}\n\n${node.ticket_description || ''}`.trim();

    // Generate job ID
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    exec.current_job_id = jobId;

    // Start the job
    await startBackgroundJob({
      jobId,
      conversationId,
      ticketId: node.ticket_id,
      ticketTitle: node.ticket_title,
      agentId: node.agent_id,
      agentName: node.agent_name,
      projectPath: exec.project_path,
      prompt: fullPrompt,
      provider: exec.provider,
    });

    // Wait for job completion
    const result = await waitForJobCompletion(jobId, conversationId);

    exec.current_job_id = null;
    exec.current_conversation_id = null;

    return result;

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function waitForJobCompletion(
  jobId: string,
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let jobGoneCount = 0;
    const MAX_JOB_GONE_CHECKS = 5;

    const checkStatus = () => {
      const job = getJobById(jobId);
      const conversation = getConversation(conversationId);

      if (!job) {
        jobGoneCount++;

        // Check conversation status
        if (conversation) {
          if (conversation.status === 'completed') {
            resolve({ success: true });
            return;
          }
          if (conversation.status === 'failed') {
            resolve({ success: false, error: 'Job failed' });
            return;
          }
          if (conversation.status === 'cancelled') {
            resolve({ success: false, error: 'Job cancelled' });
            return;
          }
        }

        if (jobGoneCount >= MAX_JOB_GONE_CHECKS) {
          // Assume completed if job is gone and conversation is not failed
          resolve({ success: true });
          return;
        }

        setTimeout(checkStatus, POLL_INTERVAL_MS);
        return;
      }

      jobGoneCount = 0;

      if (job.status === 'completed') {
        resolve({ success: true });
        return;
      }

      if (job.status === 'failed') {
        resolve({ success: false, error: 'Job failed' });
        return;
      }

      // Still running
      setTimeout(checkStatus, POLL_INTERVAL_MS);
    };

    checkStatus();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cleanup old executions (keep last 100)
setInterval(() => {
  const executions = Array.from(workflowExecutions.entries());
  if (executions.length > 100) {
    const sorted = executions.sort((a, b) =>
      new Date(b[1].started_at).getTime() - new Date(a[1].started_at).getTime()
    );
    const toRemove = sorted.slice(100);
    for (const [id] of toRemove) {
      if (workflowExecutions.get(id)?.status !== 'running') {
        workflowExecutions.delete(id);
      }
    }
  }
}, 60000);
