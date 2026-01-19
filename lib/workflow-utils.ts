import type { WorkflowNode, WorkflowEdge } from './client-db';

export interface GraphNode {
  id: string;
  ticketId: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

/**
 * Build adjacency list from workflow edges
 */
export function buildAdjacencyList(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  // Initialize all nodes with empty arrays
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  // Add edges
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.source_node_id);
    if (neighbors) {
      neighbors.push(edge.target_node_id);
    }
  }

  return adjacency;
}

/**
 * Detect cycle in the workflow graph using Kahn's Algorithm
 * Returns true if a cycle is detected
 */
export function detectCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): boolean {
  if (nodes.length === 0) return false;

  const adjacency = buildAdjacencyList(nodes, edges);
  const inDegree = new Map<string, number>();

  // Initialize in-degrees
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  // Calculate in-degrees
  for (const edge of edges) {
    const current = inDegree.get(edge.target_node_id) || 0;
    inDegree.set(edge.target_node_id, current + 1);
  }

  // Queue nodes with in-degree 0
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  let processedCount = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    processedCount++;

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If we couldn't process all nodes, there's a cycle
  return processedCount !== nodes.length;
}

/**
 * Check if adding an edge would create a cycle
 */
export function wouldCreateCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  // Create a temporary edge
  const tempEdge: WorkflowEdge = {
    id: 'temp',
    workflow_id: '',
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    created_at: '',
  };

  return detectCycle(nodes, [...edges, tempEdge]);
}

/**
 * Get execution order using topological sort (Kahn's Algorithm)
 * Returns node IDs in execution order
 */
export function getExecutionOrder(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] {
  if (nodes.length === 0) return [];

  const adjacency = buildAdjacencyList(nodes, edges);
  const inDegree = new Map<string, number>();

  // Initialize in-degrees
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  // Calculate in-degrees
  for (const edge of edges) {
    const current = inDegree.get(edge.target_node_id) || 0;
    inDegree.set(edge.target_node_id, current + 1);
  }

  // Queue nodes with in-degree 0
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}

/**
 * Get start nodes (nodes with no incoming edges)
 */
export function getStartNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  const nodesWithIncoming = new Set<string>();

  for (const edge of edges) {
    nodesWithIncoming.add(edge.target_node_id);
  }

  return nodes.filter((node) => !nodesWithIncoming.has(node.id));
}

/**
 * Get next nodes after a given node completes
 */
export function getNextNodes(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nextNodeIds = edges
    .filter((e) => e.source_node_id === nodeId)
    .map((e) => e.target_node_id);

  return nextNodeIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is WorkflowNode => n !== undefined);
}

/**
 * Get previous nodes (dependencies) for a given node
 */
export function getPreviousNodes(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const prevNodeIds = edges
    .filter((e) => e.target_node_id === nodeId)
    .map((e) => e.source_node_id);

  return prevNodeIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is WorkflowNode => n !== undefined);
}

/**
 * Check if a node can be executed (all dependencies completed)
 */
export function canExecuteNode(
  nodeId: string,
  completedNodeIds: Set<string>,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): boolean {
  const prevNodes = getPreviousNodes(nodeId, nodes, edges);
  return prevNodes.every((n) => completedNodeIds.has(n.id));
}

/**
 * Get all nodes that can be executed next (all dependencies met)
 */
export function getReadyNodes(
  completedNodeIds: Set<string>,
  runningNodeIds: Set<string>,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  return nodes.filter((node) => {
    // Skip if already completed or running
    if (completedNodeIds.has(node.id) || runningNodeIds.has(node.id)) {
      return false;
    }
    // Check if all dependencies are met
    return canExecuteNode(node.id, completedNodeIds, nodes, edges);
  });
}
