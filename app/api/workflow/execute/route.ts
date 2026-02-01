import { NextRequest, NextResponse } from 'next/server';
import {
  createWorkflowExecution,
  getWorkflowExecutionByWorkflowId,
  type WorkflowNodeData,
} from '@/lib/workflow-store';

interface ExecuteWorkflowRequest {
  workflow_id: string;
  workflow_name: string;
  project_id: string;
  project_path: string;
  provider: 'claude' | 'opencode' | 'codex';
  nodes: WorkflowNodeData[];
  execution_order: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteWorkflowRequest = await request.json();

    // Validate required fields
    if (!body.workflow_id || !body.project_path || !body.nodes || !body.execution_order) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate that all execution_order IDs exist in nodes
    const nodeIds = new Set(body.nodes.map(n => n.id));
    const missingIds = body.execution_order.filter(id => !nodeIds.has(id));
    if (missingIds.length > 0) {
      console.error(`[workflow/execute] Data mismatch! Missing node IDs in nodes array:`, missingIds);
      console.error(`[workflow/execute] execution_order: ${JSON.stringify(body.execution_order)}`);
      console.error(`[workflow/execute] node IDs: ${JSON.stringify(Array.from(nodeIds))}`);
      return NextResponse.json(
        { success: false, error: `Missing nodes: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if workflow is already running
    const existingExec = getWorkflowExecutionByWorkflowId(body.workflow_id);
    if (existingExec) {
      return NextResponse.json(
        {
          success: false,
          error: 'Workflow is already running',
          execution_id: existingExec.id,
        },
        { status: 409 }
      );
    }

    // Log workflow start details for debugging
    console.log(`[workflow/execute] Starting workflow: ${body.workflow_name}`);
    console.log(`[workflow/execute]   nodes: ${body.nodes.length}, execution_order: ${body.execution_order.length}`);

    // Create and start workflow execution
    const execution = createWorkflowExecution({
      workflow_id: body.workflow_id,
      workflow_name: body.workflow_name,
      project_id: body.project_id,
      project_path: body.project_path,
      provider: body.provider,
      nodes: body.nodes,
      execution_order: body.execution_order,
    });

    console.log(`[workflow/execute] Started workflow execution: ${execution.id}`);

    return NextResponse.json({
      success: true,
      execution_id: execution.id,
      execution,
    });

  } catch (error) {
    console.error('[workflow/execute] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
