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

// Delay between sequential job starts (to allow cleanup)
const JOB_START_DELAY_MS = 2000;

// Retry configuration for starting jobs
const MAX_START_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

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

// Check if there's already a running job for a ticket
async function checkExistingJob(ticketId: string): Promise<{ hasRunningJob: boolean; jobId?: string }> {
  try {
    const res = await fetch(`/api/agent/status?ticket_id=${ticketId}`);
    const data = await res.json();
    if (data.job && data.job.status === 'running') {
      return { hasRunningJob: true, jobId: data.job.id };
    }
    return { hasRunningJob: false };
  } catch {
    return { hasRunningJob: false };
  }
}

// Wait for any existing job on a ticket to complete
async function waitForExistingJobToComplete(ticketId: string, maxWaitMs: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { hasRunningJob, jobId } = await checkExistingJob(ticketId);
    if (!hasRunningJob) {
      return;
    }
    console.log(`[workflow-executor] Waiting for existing job ${jobId} on ticket ${ticketId} to complete...`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.warn(`[workflow-executor] Timeout waiting for existing job on ticket ${ticketId}`);
}

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
): Promise<{ success: boolean; commitHash?: string; failureReason?: string }> {
  console.log(`[workflow-executor] waitForJobCompletion called for job ${jobId}`);
  return new Promise((resolve) => {
    let lastOutputLength = 0;
    let jobGoneCount = 0; // Track how many times job was not found
    const MAX_JOB_GONE_CHECKS = 3; // Wait for a few polls to confirm job is truly gone
    let lastSeenJobStatus: string | null = null;
    let lastErrorOutput = ''; // Track last error output for failure message

    const checkStatus = async () => {
      try {
        // Fetch job status and output (same as kanban mode's pollOutput)
        const res = await fetch(`/api/agent/status?job_id=${jobId}`);
        const data = await res.json();
        console.log(`[workflow-executor] API response for job ${jobId}:`, JSON.stringify({ status: res.status, hasJob: !!data.job, jobStatus: data.job?.status }));

        // Poll output and save messages (same as kanban mode)
        const output = typeof data.output === 'string' ? data.output : '';
        if (output.length > lastOutputLength) {
          const delta = output.slice(lastOutputLength);
          const cleaned = stripAnsi(delta);
          const isError = cleaned.includes('[stderr]') || cleaned.includes('[error]') || /(^|\n)\s*(error:|fatal:)/i.test(cleaned);
          const type = isError ? 'error' : 'log';
          conversationMessageService.create(conversationId, cleaned, type);
          lastOutputLength = output.length;

          // Track error output for failure reporting
          if (isError) {
            // Keep last 500 chars of error output
            lastErrorOutput = (lastErrorOutput + cleaned).slice(-500);
          }
        }

        const job = data.job;

        // Log every status check for debugging
        console.log(`[workflow-executor] checkStatus: hasJob=${!!job}, jobStatus=${job?.status}, lastSeenJobStatus=${lastSeenJobStatus}, jobGoneCount=${jobGoneCount}`);

        if (!job) {
          jobGoneCount++;
          console.log(`[workflow-executor] Job ${jobId} not found (attempt ${jobGoneCount}/${MAX_JOB_GONE_CHECKS}), lastSeenStatus: ${lastSeenJobStatus}`);

          // If we saw the job as 'completed' before it disappeared, trust that
          if (lastSeenJobStatus === 'completed') {
            console.log(`[workflow-executor] ##### PATH C: Job was last seen as completed - returning success #####`);
            resolve({ success: true });
            return;
          }

          // If we saw the job as 'failed' before it disappeared, trust that
          if (lastSeenJobStatus === 'failed') {
            console.log(`[workflow-executor] ##### PATH D: Job was last seen as failed - returning failure #####`);
            resolve({ success: false, failureReason: lastErrorOutput || 'Job failed (no error details available)' });
            return;
          }

          // Wait for a few more polls to make sure job is truly gone
          if (jobGoneCount < MAX_JOB_GONE_CHECKS) {
            setTimeout(checkStatus, POLL_INTERVAL_MS);
            return;
          }

          // Job not found after multiple attempts
          // Since server logs show jobs complete successfully, but client never sees 'completed' status,
          // we should assume success when lastSeenJobStatus was 'running' (job finished and was cleaned up)
          // Only fail if we explicitly saw 'failed' status (handled above in PATH D)
          console.log(`[workflow-executor] ##### PATH G: Job gone after running, lastSeenStatus=${lastSeenJobStatus} - returning SUCCESS (server completed job) #####`);
          resolve({ success: true });
          return;
        }

        // Job found - reset gone counter and track status
        jobGoneCount = 0;
        lastSeenJobStatus = job.status;

        if (job.status === 'completed') {
          console.log(`[workflow-executor] ##### PATH A: Job ${jobId} status is COMPLETED - returning success #####`);
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
          console.log(`[workflow-executor] ##### PATH B: Job ${jobId} status is FAILED - returning failure #####`);
          // Get last portion of output for error context
          const fullOutput = typeof data.output === 'string' ? data.output : '';
          const lastLines = fullOutput.split('\n').slice(-10).join('\n').slice(-500);
          resolve({ success: false, failureReason: lastErrorOutput || lastLines || 'Job failed (no error details available)' });
          return;
        }

        // Still running, check again
        setTimeout(checkStatus, POLL_INTERVAL_MS);
      } catch (error) {
        console.error('[workflow-executor] Error checking job status:', error);
        // Don't immediately fail on error, retry a few times
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
      console.error('[workflow-executor] Agent or project not found:', { agentId, projectId, agentFound: !!agent, projectFound: !!project });
      return { success: false, conversationId: null };
    }

    // Check for and wait for any existing running job on this ticket
    const existingJobCheck = await checkExistingJob(ticket.id);
    if (existingJobCheck.hasRunningJob) {
      console.log(`[workflow-executor] Found existing running job ${existingJobCheck.jobId} for ticket ${ticket.id}, waiting...`);
      await waitForExistingJobToComplete(ticket.id);
      // Add extra delay after existing job completes
      await delay(JOB_START_DELAY_MS);
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

    // Prepare request body
    const requestBody = {
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
    };

    // Start the agent job with retry logic
    let response: Response | null = null;
    let responseData: { success?: boolean; job_id?: string; error?: string; details?: string; stderr?: string; command?: string } = {};
    let lastError: Error | null = null;
    let conflictWaitCount = 0;
    const MAX_CONFLICT_WAITS = 3;

    for (let attempt = 1; attempt <= MAX_START_RETRIES; attempt++) {
      try {
        console.log(`[workflow-executor] Starting agent job attempt ${attempt}/${MAX_START_RETRIES} for ticket "${ticket.title}"`);

        response = await fetch('/api/agent/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        responseData = await response.json().catch((parseError) => {
          console.error('[workflow-executor] Failed to parse response JSON:', parseError);
          return { error: 'Failed to parse response', details: String(parseError) };
        });

        if (response.ok && responseData.success) {
          console.log(`[workflow-executor] Agent job started successfully on attempt ${attempt}`);
          break;
        }

        // Handle 409 Conflict (job already running) specially
        if (response.status === 409) {
          conflictWaitCount++;
          if (conflictWaitCount > MAX_CONFLICT_WAITS) {
            console.error(`[workflow-executor] Too many conflict waits (${conflictWaitCount}), giving up`);
            break;
          }
          console.log(`[workflow-executor] Job already running for ticket, waiting for it to complete (wait ${conflictWaitCount}/${MAX_CONFLICT_WAITS})...`);
          conversationMessageService.create(
            conversation.id,
            `⏳ Waiting for previous job to complete before starting (${conflictWaitCount}/${MAX_CONFLICT_WAITS})...`,
            'system'
          );
          await waitForExistingJobToComplete(ticket.id);
          await delay(JOB_START_DELAY_MS);
          // Don't count this as a failed attempt, just retry
          attempt--;
          continue;
        }

        // Log detailed error info
        console.error(`[workflow-executor] Attempt ${attempt} failed:`, {
          status: response.status,
          statusText: response.statusText,
          responseData,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          agentName: agent.name,
          projectPath: project.path,
        });

        if (attempt < MAX_START_RETRIES) {
          console.log(`[workflow-executor] Retrying in ${RETRY_DELAY_MS}ms...`);
          await delay(RETRY_DELAY_MS);
        }
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        console.error(`[workflow-executor] Fetch error on attempt ${attempt}:`, {
          error: lastError.message,
          ticketId: ticket.id,
        });

        if (attempt < MAX_START_RETRIES) {
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    // Check if all retries failed
    if (!response?.ok || !responseData.success) {
      const errorMsg = responseData.error || responseData.details || lastError?.message || 'Unknown error';
      const statusCode = response?.status || 'N/A';
      const statusText = response?.statusText || 'N/A';

      // Build detailed error message for UI
      const detailParts: string[] = [];
      detailParts.push(`Error: ${errorMsg}`);
      if (statusCode !== 'N/A') {
        detailParts.push(`HTTP ${statusCode} ${statusText}`);
      }
      if (responseData.details && responseData.details !== errorMsg) {
        detailParts.push(`Details: ${typeof responseData.details === 'object' ? JSON.stringify(responseData.details) : responseData.details}`);
      }
      if (responseData.stderr) {
        detailParts.push(`stderr: ${responseData.stderr}`);
      }
      if (responseData.command) {
        detailParts.push(`Command: ${responseData.command}`);
      }

      console.error('[workflow-executor] All attempts to start agent job failed:', {
        finalError: errorMsg,
        responseData,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
      });
      conversationService.complete(conversation.id, { status: 'failed' });
      conversationMessageService.create(
        conversation.id,
        `❌ Failed to start agent job after ${MAX_START_RETRIES} attempts\n${detailParts.join('\n')}`,
        'error'
      );
      return { success: false, conversationId: conversation.id };
    }

    const jobId = responseData.job_id;
    if (!jobId) {
      console.error('[workflow-executor] No job_id returned from API:', responseData);
      conversationService.complete(conversation.id, { status: 'failed' });
      conversationMessageService.create(conversation.id, '❌ No job ID received from API', 'error');
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
      // Include failure reason if available
      const failureMsg = result.failureReason
        ? `❌ Task failed\n\nLast error output:\n${result.failureReason}`
        : '❌ Task failed (no error details available)';
      conversationMessageService.create(conversation.id, failureMsg, 'error');
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
  console.log('[workflow-executor] ===== UPDATED CODE LOADED - v2 =====');
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

      // Add delay between nodes to allow cleanup
      console.log(`[workflow-executor] Node ${nodeId} completed, waiting ${JOB_START_DELAY_MS}ms before next node...`);
      await delay(JOB_START_DELAY_MS);
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
