import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkflowExecution,
  getWorkflowExecutionByWorkflowId,
  pauseWorkflowExecution,
  resumeWorkflowExecution,
} from '@/lib/workflow-store';

// Get workflow execution status
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const executionId = url.searchParams.get('execution_id');
  const workflowId = url.searchParams.get('workflow_id');

  if (executionId) {
    const execution = getWorkflowExecution(executionId);
    if (!execution) {
      return NextResponse.json(
        { success: false, error: 'Execution not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, execution });
  }

  if (workflowId) {
    const execution = getWorkflowExecutionByWorkflowId(workflowId);
    return NextResponse.json({
      success: true,
      execution: execution || null,
      is_running: !!execution,
    });
  }

  return NextResponse.json(
    { success: false, error: 'execution_id or workflow_id required' },
    { status: 400 }
  );
}

// Pause/Resume workflow execution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { execution_id, action } = body;

    if (!execution_id || !action) {
      return NextResponse.json(
        { success: false, error: 'execution_id and action required' },
        { status: 400 }
      );
    }

    if (action === 'pause') {
      const paused = pauseWorkflowExecution(execution_id);
      return NextResponse.json({ success: paused });
    }

    if (action === 'resume') {
      const resumed = resumeWorkflowExecution(execution_id);
      return NextResponse.json({ success: resumed });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "pause" or "resume"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[workflow/status] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
