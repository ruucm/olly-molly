/**
 * Database types and interfaces
 * These are shared between IndexedDB (local) and Supabase (cloud) providers
 */

export interface Member {
  id: string;
  user_id?: string;
  role: string;
  name: string;
  avatar: string | null;
  profile_image: string | null;
  system_prompt: string;
  is_default: number;
  can_generate_images: number;
  can_log_screenshots: number;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  user_id?: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEED_FIX' | 'COMPLETE' | 'ON_HOLD';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignee_ids: string[];
  project_id: string | null;
  created_by: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  ticket_id: string;
  member_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  details: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  path: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AgentWorkLog {
  id: string;
  user_id?: string;
  ticket_id: string;
  agent_id: string;
  project_id: string;
  command: string;
  prompt: string | null;
  output: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  git_commit_hash: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface Conversation {
  id: string;
  user_id?: string;
  ticket_id: string;
  agent_id: string;
  provider: 'claude' | 'opencode' | 'codex';
  prompt: string | null;
  feedback: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  git_commit_hash: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  user_id?: string;
  conversation_id: string;
  content: string;
  message_type: 'log' | 'error' | 'success' | 'system';
  created_at: string;
}

export interface Workflow {
  id: string;
  user_id?: string;
  name: string;
  description: string | null;
  project_id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
  current_node_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNode {
  id: string;
  user_id?: string;
  workflow_id: string;
  ticket_id: string;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface WorkflowEdge {
  id: string;
  user_id?: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  created_at: string;
}

/**
 * Database provider interface
 */
export interface DatabaseProvider {
  readonly mode: 'local' | 'cloud';

  // Initialize the database
  init(userId?: string): Promise<void>;

  // Member operations
  getMembers(): Promise<Member[]>;
  getMemberById(id: string): Promise<Member | null>;
  createMember(data: Omit<Member, 'id' | 'created_at' | 'updated_at'>): Promise<Member>;
  updateMember(id: string, data: Partial<Member>): Promise<Member | null>;
  deleteMember(id: string): Promise<boolean>;

  // Ticket operations
  getTickets(projectId?: string): Promise<Ticket[]>;
  getTicketById(id: string): Promise<Ticket | null>;
  createTicket(data: Omit<Ticket, 'id' | 'created_at' | 'updated_at'>): Promise<Ticket>;
  updateTicket(id: string, data: Partial<Ticket>): Promise<Ticket | null>;
  deleteTicket(id: string): Promise<boolean>;

  // Project operations
  getProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | null>;
  getActiveProject(): Promise<Project | null>;
  createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | null>;
  setActiveProject(id: string): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Conversation operations
  getConversationsByTicketId(ticketId: string): Promise<Conversation[]>;
  createConversation(data: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation | null>;

  // Conversation message operations
  getMessagesByConversationId(conversationId: string): Promise<ConversationMessage[]>;
  createMessage(data: Omit<ConversationMessage, 'id' | 'created_at'>): Promise<ConversationMessage>;

  // Activity log operations
  getActivityLogsByTicketId(ticketId: string): Promise<ActivityLog[]>;
  createActivityLog(data: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog>;

  // Realtime subscriptions (for Supabase)
  subscribeToChanges?(table: string, callback: (payload: unknown) => void): () => void;
}
