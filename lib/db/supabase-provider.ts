'use client';

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_AGENTS } from '@/agents';
import type {
  DatabaseProvider,
  Member,
  Ticket,
  Project,
  Conversation,
  ConversationMessage,
  ActivityLog,
} from './types';

export class SupabaseProvider implements DatabaseProvider {
  readonly mode = 'cloud' as const;
  private userId: string | null = null;
  private initialized = false;

  async init(userId?: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required for Supabase provider');
    }
    this.userId = userId;

    // Check if user has members, if not create defaults
    const members = await this.getMembers();
    if (members.length === 0) {
      const now = new Date().toISOString();
      for (const agent of DEFAULT_AGENTS) {
        await this.createMember({
          ...agent,
          user_id: userId,
        });
      }
    }

    this.initialized = true;
  }

  private get supabase() {
    return getSupabaseClient();
  }

  private ensureUserId(): string {
    if (!this.userId) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.userId;
  }

  // Member operations
  async getMembers(): Promise<Member[]> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching members:', error);
      return [];
    }
    return data || [];
  }

  async getMemberById(id: string): Promise<Member | null> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  async createMember(data: Omit<Member, 'id' | 'created_at' | 'updated_at'>): Promise<Member> {
    const userId = this.ensureUserId();
    const now = new Date().toISOString();
    const member = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error } = await this.supabase
      .from('members')
      .insert(member)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create member: ${error.message}`);
    }
    return created;
  }

  async updateMember(id: string, data: Partial<Member>): Promise<Member | null> {
    const userId = this.ensureUserId();
    const { data: updated, error } = await this.supabase
      .from('members')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return null;
    return updated;
  }

  async deleteMember(id: string): Promise<boolean> {
    const userId = this.ensureUserId();
    const { error } = await this.supabase
      .from('members')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return !error;
  }

  // Ticket operations
  async getTickets(projectId?: string): Promise<Ticket[]> {
    const userId = this.ensureUserId();
    let query = this.supabase
      .from('tickets')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tickets:', error);
      return [];
    }
    return data || [];
  }

  async getTicketById(id: string): Promise<Ticket | null> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  async createTicket(data: Omit<Ticket, 'id' | 'created_at' | 'updated_at'>): Promise<Ticket> {
    const userId = this.ensureUserId();
    const now = new Date().toISOString();
    const ticket = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error } = await this.supabase
      .from('tickets')
      .insert(ticket)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ticket: ${error.message}`);
    }
    return created;
  }

  async updateTicket(id: string, data: Partial<Ticket>): Promise<Ticket | null> {
    const userId = this.ensureUserId();
    const { data: updated, error } = await this.supabase
      .from('tickets')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return null;
    return updated;
  }

  async deleteTicket(id: string): Promise<boolean> {
    const userId = this.ensureUserId();
    const { error } = await this.supabase
      .from('tickets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return !error;
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
    return data || [];
  }

  async getProjectById(id: string): Promise<Project | null> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  async getActiveProject(): Promise<Project | null> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', 1)
      .single();

    if (error) return null;
    return data;
  }

  async createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const userId = this.ensureUserId();
    const now = new Date().toISOString();
    const project = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error } = await this.supabase
      .from('projects')
      .insert(project)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
    return created;
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    const userId = this.ensureUserId();
    const { data: updated, error } = await this.supabase
      .from('projects')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return null;
    return updated;
  }

  async setActiveProject(id: string): Promise<Project | null> {
    const userId = this.ensureUserId();

    // First, deactivate all projects
    await this.supabase
      .from('projects')
      .update({ is_active: 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    // Then activate the selected project
    return this.updateProject(id, { is_active: 1 });
  }

  async deleteProject(id: string): Promise<boolean> {
    const userId = this.ensureUserId();
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return !error;
  }

  // Conversation operations
  async getConversationsByTicketId(ticketId: string): Promise<Conversation[]> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }
    return data || [];
  }

  async createConversation(data: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation> {
    const userId = this.ensureUserId();
    const now = new Date().toISOString();
    const conversation = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: now,
    };

    const { data: created, error } = await this.supabase
      .from('conversations')
      .insert(conversation)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
    return created;
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation | null> {
    const userId = this.ensureUserId();
    const { data: updated, error } = await this.supabase
      .from('conversations')
      .update(data)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return null;
    return updated;
  }

  // Conversation message operations
  async getMessagesByConversationId(conversationId: string): Promise<ConversationMessage[]> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('conversation_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
    return data || [];
  }

  async createMessage(data: Omit<ConversationMessage, 'id' | 'created_at'>): Promise<ConversationMessage> {
    const userId = this.ensureUserId();
    const message = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    const { data: created, error } = await this.supabase
      .from('conversation_messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create message: ${error.message}`);
    }
    return created;
  }

  // Activity log operations
  async getActivityLogsByTicketId(ticketId: string): Promise<ActivityLog[]> {
    const userId = this.ensureUserId();
    const { data, error } = await this.supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching activity logs:', error);
      return [];
    }
    return data || [];
  }

  async createActivityLog(data: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
    const userId = this.ensureUserId();
    const log = {
      id: uuidv4(),
      ...data,
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    const { data: created, error } = await this.supabase
      .from('activity_logs')
      .insert(log)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create activity log: ${error.message}`);
    }
    return created;
  }

  // Realtime subscriptions
  subscribeToChanges(table: string, callback: (payload: unknown) => void): () => void {
    const channel = this.supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${this.userId}`,
        },
        callback
      )
      .subscribe();

    return () => {
      this.supabase.removeChannel(channel);
    };
  }
}
