'use client';

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeDragHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  useWorkflows,
  useWorkflowNodes,
  useWorkflowEdges,
  workflowService,
  workflowNodeService,
  workflowEdgeService,
  ticketService,
  type Workflow,
  type WorkflowNode as DbWorkflowNode,
  type WorkflowEdge as DbWorkflowEdge,
  type Ticket,
  type Member,
} from '@/lib/client-db';
import { wouldCreateCycle } from '@/lib/workflow-utils';
import {
  executeWorkflow,
  pauseWorkflow,
  resetWorkflow,
  getExecutionState,
  type NodeExecutionStatus,
} from '@/lib/workflow-executor';

import { WorkflowNode, type WorkflowNodeData } from './WorkflowNode';
import { WorkflowControls, type AgentProvider } from './WorkflowControls';
import { WorkflowSidebar } from './WorkflowSidebar';
import { TicketNodePanel } from './TicketNodePanel';
import { WorkflowNodeLogPanel } from './WorkflowNodeLogPanel';

const nodeTypes: NodeTypes = {
  ticket: WorkflowNode,
};

interface WorkflowCanvasProps {
  projectId: string;
  tickets: Ticket[];
  members: Member[];
  defaultAgentId: string;
}

export function WorkflowCanvas({
  projectId,
  tickets,
  members,
  defaultAgentId,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Map<string, NodeExecutionStatus>>(new Map());
  const [selectedProvider, setSelectedProvider] = useState<AgentProvider>('claude');
  const [selectedNodeForLogs, setSelectedNodeForLogs] = useState<{ ticket: Ticket; assignees: Member[] } | null>(null);

  // Fetch data
  const workflows = useWorkflows(projectId);
  const dbNodes = useWorkflowNodes(selectedWorkflowId || '');
  const dbEdges = useWorkflowEdges(selectedWorkflowId || '');

  // Selected workflow
  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowId) return null;
    return workflows.find((w) => w.id === selectedWorkflowId) || null;
  }, [workflows, selectedWorkflowId]);

  // Build maps
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);

  // Convert DB nodes to React Flow nodes
  const initialNodes = useMemo<Node<WorkflowNodeData>[]>(() => {
    const nodes: Node<WorkflowNodeData>[] = [];
    for (const node of dbNodes) {
      const ticket = ticketsById.get(node.ticket_id);
      if (!ticket) continue;

      const assignees = (ticket.assignee_ids || [])
        .map((id) => membersById.get(id))
        .filter(Boolean) as Member[];

      nodes.push({
        id: node.id,
        type: 'ticket',
        position: { x: node.position_x, y: node.position_y },
        data: {
          ticket,
          assignees,
          status: nodeStatuses.get(node.id) || 'idle',
        },
      });
    }
    return nodes;
  }, [dbNodes, ticketsById, membersById, nodeStatuses]);

  // Convert DB edges to React Flow edges
  const initialEdges = useMemo<Edge[]>(() => {
    return dbEdges.map((edge) => ({
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      animated: selectedWorkflow?.status === 'running',
      style: { stroke: 'var(--text-muted)' },
    }));
  }, [dbEdges, selectedWorkflow?.status]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes and edges when DB data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Used ticket IDs (already in workflow)
  const usedTicketIds = useMemo(() => {
    return new Set(dbNodes.map((n) => n.ticket_id));
  }, [dbNodes]);

  // Handle connection (add edge)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!selectedWorkflowId || !connection.source || !connection.target) return;

      // Check for cycle
      if (wouldCreateCycle(dbNodes, dbEdges, connection.source, connection.target)) {
        alert('Cannot create edge: would create a cycle');
        return;
      }

      // Create edge in DB
      workflowEdgeService.create({
        workflow_id: selectedWorkflowId,
        source_node_id: connection.source,
        target_node_id: connection.target,
      });

      setHasUnsavedChanges(true);
    },
    [selectedWorkflowId, dbNodes, dbEdges]
  );

  // Handle node position change
  const onNodeDragStop: NodeDragHandler = useCallback(
    (event, node) => {
      workflowNodeService.updatePosition(node.id, node.position.x, node.position.y);
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handle edge deletion
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    deletedEdges.forEach((edge) => {
      workflowEdgeService.delete(edge.id);
    });
    setHasUnsavedChanges(true);
  }, []);

  // Handle node deletion
  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    deletedNodes.forEach((node) => {
      workflowNodeService.delete(node.id);
    });
    setHasUnsavedChanges(true);
  }, []);

  // Handle drop from ticket panel
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!selectedWorkflowId || !reactFlowWrapper.current) return;

      const ticketData = event.dataTransfer.getData('application/ticket');
      if (!ticketData) return;

      const ticket: Ticket = JSON.parse(ticketData);

      // Calculate position
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };

      // Create node in DB
      workflowNodeService.create({
        workflow_id: selectedWorkflowId,
        ticket_id: ticket.id,
        position_x: position.x,
        position_y: position.y,
      });

      setHasUnsavedChanges(true);
    },
    [selectedWorkflowId]
  );

  // Ticket drag start handler
  const handleTicketDragStart = useCallback((ticket: Ticket, event: React.DragEvent) => {
    event.dataTransfer.setData('application/ticket', JSON.stringify(ticket));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // Workflow management
  const handleCreateWorkflow = useCallback(
    (name: string) => {
      const workflow = workflowService.create({
        name,
        project_id: projectId,
      });
      setSelectedWorkflowId(workflow.id);
    },
    [projectId]
  );

  const handleDeleteWorkflow = useCallback((workflowId: string) => {
    workflowService.delete(workflowId);
    if (selectedWorkflowId === workflowId) {
      setSelectedWorkflowId(null);
    }
  }, [selectedWorkflowId]);

  const handleRenameWorkflow = useCallback((workflowId: string, name: string) => {
    workflowService.update(workflowId, { name });
  }, []);

  // Execution handlers
  const handleExecute = useCallback(async () => {
    if (!selectedWorkflowId || !selectedWorkflow) return;

    setNodeStatuses(new Map());

    await executeWorkflow(selectedWorkflowId, {
      projectId,
      defaultAgentId,
      provider: selectedProvider,
      onNodeStart: (nodeId) => {
        setNodeStatuses((prev) => new Map(prev).set(nodeId, 'running'));
      },
      onNodeComplete: (nodeId, success) => {
        setNodeStatuses((prev) => new Map(prev).set(nodeId, success ? 'completed' : 'failed'));
      },
      onWorkflowComplete: (success) => {
        console.log('Workflow completed:', success);
      },
    });
  }, [selectedWorkflowId, selectedWorkflow, projectId, defaultAgentId, selectedProvider]);

  const handlePause = useCallback(() => {
    if (selectedWorkflowId) {
      pauseWorkflow(selectedWorkflowId);
    }
  }, [selectedWorkflowId]);

  const handleReset = useCallback(() => {
    if (selectedWorkflowId) {
      resetWorkflow(selectedWorkflowId);
      setNodeStatuses(new Map());
    }
  }, [selectedWorkflowId]);

  const handleSave = useCallback(() => {
    // All changes are already persisted, just clear the flag
    setHasUnsavedChanges(false);
  }, []);

  // Update node statuses
  useEffect(() => {
    if (selectedWorkflowId) {
      const state = getExecutionState(selectedWorkflowId);
      if (state) {
        setNodeStatuses(new Map(state.nodeStatuses));
      }
    }
  }, [selectedWorkflowId, selectedWorkflow?.status]);

  return (
    <div className="flex h-full">
      {/* Workflow List Sidebar */}
      <WorkflowSidebar
        workflows={workflows}
        selectedWorkflowId={selectedWorkflowId}
        onSelect={setSelectedWorkflowId}
        onCreate={handleCreateWorkflow}
        onDelete={handleDeleteWorkflow}
        onRename={handleRenameWorkflow}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        {selectedWorkflow ? (
          <>
            {/* Controls */}
            <WorkflowControls
              workflow={selectedWorkflow}
              hasNodes={nodes.length > 0}
              hasUnsavedChanges={hasUnsavedChanges}
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              onExecute={handleExecute}
              onPause={handlePause}
              onReset={handleReset}
              onSave={handleSave}
            />

            {/* Canvas */}
            <div className="flex-1 flex">
              <div
                ref={reactFlowWrapper}
                className="flex-1"
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeDragStop={onNodeDragStop}
                  onEdgesDelete={onEdgesDelete}
                  onNodesDelete={onNodesDelete}
                  onNodeClick={(event, node) => {
                    const data = node.data as WorkflowNodeData;
                    if (data?.ticket) {
                      setSelectedNodeForLogs({
                        ticket: data.ticket,
                        assignees: data.assignees,
                      });
                    }
                  }}
                  nodeTypes={nodeTypes}
                  fitView
                  snapToGrid
                  snapGrid={[15, 15]}
                  deleteKeyCode={['Backspace', 'Delete']}
                  className="bg-[var(--bg-primary)]"
                >
                  <Background
                    color="var(--border-secondary)"
                    gap={20}
                    size={1}
                  />
                  <Controls className="!bg-[var(--bg-secondary)] !border-[var(--border-primary)] !shadow-lg" />
                  <MiniMap
                    nodeColor={(node) => {
                      const status = (node.data as WorkflowNodeData)?.status;
                      if (status === 'running') return '#3b82f6';
                      if (status === 'completed') return '#22c55e';
                      if (status === 'failed') return '#ef4444';
                      return 'var(--text-muted)';
                    }}
                    className="!bg-[var(--bg-secondary)] !border-[var(--border-primary)]"
                  />
                </ReactFlow>
              </div>

              {/* Log Panel - shown when a node is selected */}
              {selectedNodeForLogs && (
                <WorkflowNodeLogPanel
                  ticket={selectedNodeForLogs.ticket}
                  assignees={selectedNodeForLogs.assignees}
                  onClose={() => setSelectedNodeForLogs(null)}
                />
              )}

              {/* Ticket Panel - hidden when log panel is open */}
              {!selectedNodeForLogs && (
                <TicketNodePanel
                  tickets={tickets}
                  members={members}
                  usedTicketIds={usedTicketIds}
                  onDragStart={handleTicketDragStart}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
            <div className="text-center">
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                Select or Create a Workflow
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                Choose a workflow from the list or create a new one to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
