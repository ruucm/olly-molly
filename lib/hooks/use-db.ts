'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { isAuthRequired } from '@/lib/auth-config';
import { SupabaseProvider } from '@/lib/db/supabase-provider';
import type { Member, Ticket, Project, Conversation, ConversationMessage, ActivityLog } from '@/lib/db/types';

// Import local DB hooks for fallback
import {
  useMembers as useLocalMembers,
  useTickets as useLocalTickets,
  useProjects as useLocalProjects,
  useConversations as useLocalConversations,
  useConversationMessages as useLocalConversationMessages,
  useActivityLogs as useLocalActivityLogs,
  memberService as localMemberService,
  ticketService as localTicketService,
  projectService as localProjectService,
  conversationService as localConversationService,
  conversationMessageService as localConversationMessageService,
  activityService as localActivityService,
  initClientDb,
} from '@/lib/client-db';

// Singleton provider instance
let supabaseProvider: SupabaseProvider | null = null;

function getSupabaseProvider(): SupabaseProvider {
  if (!supabaseProvider) {
    supabaseProvider = new SupabaseProvider();
  }
  return supabaseProvider;
}

/**
 * Hook to check if we're in cloud mode
 */
export function useCloudMode(): boolean {
  return isAuthRequired();
}

/**
 * Hook to initialize the database
 */
export function useDbInit() {
  const { data: session, status } = useSession();
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isCloud = isAuthRequired();

  useEffect(() => {
    async function init() {
      try {
        if (isCloud) {
          if (status === 'loading') return;
          if (!session?.user?.id) {
            setInitialized(false);
            return;
          }
          const provider = getSupabaseProvider();
          await provider.init(session.user.id);
        } else {
          await initClientDb();
        }
        setInitialized(true);
      } catch (err) {
        console.error('Database initialization error:', err);
        setError(err instanceof Error ? err : new Error('Failed to initialize database'));
      }
    }

    init();
  }, [isCloud, session?.user?.id, status]);

  return { initialized, error, isCloud };
}

/**
 * Members hook - works with both local and cloud
 */
export function useMembers(): Member[] {
  const localMembers = useLocalMembers();
  const [cloudMembers, setCloudMembers] = useState<Member[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id) return;

    const provider = getSupabaseProvider();
    provider.getMembers().then(setCloudMembers);

    // Subscribe to realtime changes
    const unsubscribe = provider.subscribeToChanges?.('members', () => {
      provider.getMembers().then(setCloudMembers);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id]);

  return isCloud ? cloudMembers : localMembers;
}

/**
 * Tickets hook - works with both local and cloud
 */
export function useTickets(projectId?: string): Ticket[] {
  const localTickets = useLocalTickets();
  const [cloudTickets, setCloudTickets] = useState<Ticket[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id) return;

    const provider = getSupabaseProvider();
    provider.getTickets(projectId).then(setCloudTickets);

    // Subscribe to realtime changes
    const unsubscribe = provider.subscribeToChanges?.('tickets', () => {
      provider.getTickets(projectId).then(setCloudTickets);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id, projectId]);

  const result = isCloud ? cloudTickets : localTickets;

  // Filter by project if specified (local mode)
  if (!isCloud && projectId) {
    return result.filter(t => t.project_id === projectId);
  }

  return result;
}

/**
 * Projects hook - works with both local and cloud
 */
export function useProjects(): Project[] {
  const localProjects = useLocalProjects();
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id) return;

    const provider = getSupabaseProvider();
    provider.getProjects().then(setCloudProjects);

    // Subscribe to realtime changes
    const unsubscribe = provider.subscribeToChanges?.('projects', () => {
      provider.getProjects().then(setCloudProjects);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id]);

  return isCloud ? cloudProjects : localProjects;
}

/**
 * Conversations hook
 */
export function useConversations(ticketId: string): Conversation[] {
  const localConversations = useLocalConversations(ticketId);
  const [cloudConversations, setCloudConversations] = useState<Conversation[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id || !ticketId) return;

    const provider = getSupabaseProvider();
    provider.getConversationsByTicketId(ticketId).then(setCloudConversations);

    const unsubscribe = provider.subscribeToChanges?.('conversations', () => {
      provider.getConversationsByTicketId(ticketId).then(setCloudConversations);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id, ticketId]);

  return isCloud ? cloudConversations : localConversations;
}

/**
 * Conversation messages hook
 */
export function useConversationMessages(conversationId: string | null): ConversationMessage[] {
  const localMessages = useLocalConversationMessages(conversationId);
  const [cloudMessages, setCloudMessages] = useState<ConversationMessage[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id || !conversationId) return;

    const provider = getSupabaseProvider();
    provider.getMessagesByConversationId(conversationId).then(setCloudMessages);

    const unsubscribe = provider.subscribeToChanges?.('conversation_messages', () => {
      provider.getMessagesByConversationId(conversationId).then(setCloudMessages);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id, conversationId]);

  return isCloud ? cloudMessages : localMessages;
}

/**
 * Activity logs hook
 */
export function useActivityLogs(ticketId: string): ActivityLog[] {
  const localLogs = useLocalActivityLogs(ticketId);
  const [cloudLogs, setCloudLogs] = useState<ActivityLog[]>([]);
  const { data: session } = useSession();
  const isCloud = isAuthRequired();

  useEffect(() => {
    if (!isCloud || !session?.user?.id || !ticketId) return;

    const provider = getSupabaseProvider();
    provider.getActivityLogsByTicketId(ticketId).then(setCloudLogs);

    const unsubscribe = provider.subscribeToChanges?.('activity_logs', () => {
      provider.getActivityLogsByTicketId(ticketId).then(setCloudLogs);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isCloud, session?.user?.id, ticketId]);

  return isCloud ? cloudLogs : localLogs;
}

/**
 * Member service hook
 */
export function useMemberService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    getAll: async (): Promise<Member[]> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getMembers();
      }
      return localMemberService.getAll();
    },
    getById: async (id: string): Promise<Member | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getMemberById(id) as Promise<Member | undefined>;
      }
      return localMemberService.getById(id);
    },
    update: async (id: string, data: Partial<Member>): Promise<Member | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().updateMember(id, data) as Promise<Member | undefined>;
      }
      return localMemberService.update(id, data);
    },
    create: async (data: Parameters<typeof localMemberService.create>[0]): Promise<Member> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createMember({
          ...data,
          avatar: data.avatar || null,
          profile_image: null,
          is_default: 0,
          can_generate_images: data.can_generate_images ? 1 : 0,
          can_log_screenshots: data.can_log_screenshots ? 1 : 0,
        });
      }
      return localMemberService.create(data);
    },
    delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
      if (isCloud && session?.user?.id) {
        const success = await getSupabaseProvider().deleteMember(id);
        return { success };
      }
      return localMemberService.delete(id);
    },
  };

  return service;
}

/**
 * Ticket service hook
 */
export function useTicketService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    getAll: async (status?: string, projectId?: string): Promise<Ticket[]> => {
      if (isCloud && session?.user?.id) {
        const tickets = await getSupabaseProvider().getTickets(projectId);
        if (status) {
          return tickets.filter(t => t.status === status);
        }
        return tickets;
      }
      return localTicketService.getAll(status, projectId);
    },
    getById: async (id: string): Promise<Ticket | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getTicketById(id) as Promise<Ticket | undefined>;
      }
      return localTicketService.getById(id);
    },
    create: async (data: Parameters<typeof localTicketService.create>[0]): Promise<Ticket> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createTicket({
          title: data.title,
          description: data.description || null,
          status: 'TODO',
          priority: data.priority || 'MEDIUM',
          assignee_ids: data.assignee_ids || [],
          project_id: data.project_id || null,
          created_by: data.created_by || null,
          order_index: Date.now(),
        });
      }
      return localTicketService.create(data);
    },
    update: async (id: string, data: Partial<Ticket>, updatedBy?: string): Promise<Ticket | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().updateTicket(id, data) as Promise<Ticket | undefined>;
      }
      return localTicketService.update(id, data, updatedBy);
    },
    delete: async (id: string): Promise<boolean> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().deleteTicket(id);
      }
      return localTicketService.delete(id);
    },
    reorder: (tickets: { id: string; order_index: number }[]) => {
      if (isCloud && session?.user?.id) {
        // Update each ticket's order_index
        tickets.forEach(t => {
          getSupabaseProvider().updateTicket(t.id, { order_index: t.order_index });
        });
      } else {
        localTicketService.reorder(tickets);
      }
    },
  };

  return service;
}

/**
 * Project service hook
 */
export function useProjectService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    getAll: async (): Promise<Project[]> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getProjects();
      }
      return localProjectService.getAll();
    },
    getById: async (id: string): Promise<Project | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getProjectById(id) as Promise<Project | undefined>;
      }
      return localProjectService.getById(id);
    },
    getActive: async (): Promise<Project | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().getActiveProject() as Promise<Project | undefined>;
      }
      return localProjectService.getActive();
    },
    create: async (data: Parameters<typeof localProjectService.create>[0]): Promise<Project> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createProject({
          name: data.name,
          path: data.path,
          description: data.description || null,
          is_active: 0,
        });
      }
      return localProjectService.create(data);
    },
    setActive: async (id: string): Promise<Project | undefined> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().setActiveProject(id) as Promise<Project | undefined>;
      }
      return localProjectService.setActive(id);
    },
    delete: async (id: string): Promise<boolean> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().deleteProject(id);
      }
      return localProjectService.delete(id);
    },
  };

  return service;
}

/**
 * Conversation service hook
 */
export function useConversationService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    create: async (data: Parameters<typeof localConversationService.create>[0]): Promise<Conversation> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createConversation({
          ticket_id: data.ticket_id,
          agent_id: data.agent_id,
          provider: data.provider,
          prompt: data.prompt || null,
          feedback: data.feedback || null,
          status: 'running',
          git_commit_hash: null,
          started_at: new Date().toISOString(),
          completed_at: null,
        });
      }
      return localConversationService.create(data);
    },
    getById: async (id: string): Promise<Conversation | undefined> => {
      if (isCloud && session?.user?.id) {
        const provider = getSupabaseProvider();
        // We don't have a direct getById, use a workaround
        const { data } = await (provider as any).supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .single();
        return data || undefined;
      }
      return localConversationService.getById(id);
    },
    updateStatus: async (id: string, status: Conversation['status'], commitHash?: string): Promise<void> => {
      if (isCloud && session?.user?.id) {
        await getSupabaseProvider().updateConversation(id, {
          status,
          git_commit_hash: commitHash || null
        });
      } else {
        localConversationService.updateStatus(id, status, commitHash);
      }
    },
    complete: async (id: string, data: { status: Conversation['status']; git_commit_hash?: string }): Promise<void> => {
      if (isCloud && session?.user?.id) {
        await getSupabaseProvider().updateConversation(id, {
          status: data.status,
          git_commit_hash: data.git_commit_hash || null,
          completed_at: new Date().toISOString(),
        });
      } else {
        localConversationService.complete(id, data);
      }
    },
  };

  return service;
}

/**
 * Conversation message service hook
 */
export function useConversationMessageService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    create: async (conversationId: string, content: string, type: ConversationMessage['message_type'] = 'log'): Promise<ConversationMessage> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createMessage({
          conversation_id: conversationId,
          content,
          message_type: type,
        });
      }
      return localConversationMessageService.create(conversationId, content, type);
    },
  };

  return service;
}

/**
 * Activity service hook
 */
export function useActivityService() {
  const isCloud = isAuthRequired();
  const { data: session } = useSession();

  const service = {
    log: async (data: Parameters<typeof localActivityService.log>[0]): Promise<ActivityLog> => {
      if (isCloud && session?.user?.id) {
        return getSupabaseProvider().createActivityLog({
          ticket_id: data.ticket_id,
          member_id: data.member_id || null,
          action: data.action,
          old_value: data.old_value || null,
          new_value: data.new_value || null,
          details: data.details || null,
        });
      }
      return localActivityService.log(data);
    },
  };

  return service;
}
