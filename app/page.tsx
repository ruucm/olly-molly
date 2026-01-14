'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { KanbanBoard, TicketSidebar } from '@/components/kanban';
import { TeamPanel } from '@/components/team';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PMRequestModal } from '@/components/pm';
import { ProjectSelector, DevServerControl, ProjectArtifactsModal } from '@/components/project';
import { Button } from '@/components/ui/Button';
import { ResizablePane } from '@/components/ui/ResizablePane';
import packageJson from '@/package.json';
import {
  createMember,
  createTicket,
  deleteMember,
  deleteTicket,
  isTauriRuntime,
  loadBoardData,
  updateMember,
  updateTicket,
} from '@/lib/tauri-board';
import type { Project } from '@/lib/tauri-projects';
interface Member {
  id: string;
  role: string;
  name: string;
  avatar?: string | null;
  profile_image?: string | null; // Added based on common pattern for avatar/profile_image
  system_prompt: string;
  is_default: number;
  can_generate_images: number; // Added as per instruction
  can_log_screenshots: number;
  created_at?: string; // Added based on common pattern for timestamps
  updated_at?: string; // Added based on common pattern for timestamps
}

interface Ticket {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee_id?: string | null;
  assignee?: Member | null;
  project_id?: string | null;
}

export default function Dashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketSidebarOpen, setTicketSidebarOpen] = useState(false);
  const [artifactsModalOpen, setArtifactsModalOpen] = useState(false);
  const appVersion = packageJson.version;
  const [agentFeaturesEnabled, setAgentFeaturesEnabled] = useState(false);
  const devServerEnabled = false;

  const attachAssignees = useCallback((items: Ticket[], allMembers: Member[]): Ticket[] => {
    const byId = new Map(allMembers.map((member) => [member.id, member]));
    return items.map((ticket) => ({
      ...ticket,
      assignee: ticket.assignee_id ? byId.get(ticket.assignee_id) || null : null,
    }));
  }, []);

  useEffect(() => {
    isTauriRuntime().then(setAgentFeaturesEnabled).catch(() => setAgentFeaturesEnabled(false));
  }, []);

  const refreshBoard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadBoardData();
      const hydratedMembers = result.data.members;
      const hydratedTickets = attachAssignees(result.data.tickets, hydratedMembers);
      setMembers(hydratedMembers);
      setTickets(hydratedTickets);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [attachAssignees]);

  useEffect(() => {
    refreshBoard();
  }, [refreshBoard, activeProject?.id]);

  const handleTicketCreate = useCallback(async (data: Partial<Ticket>) => {
    try {
      const newTicket = await createTicket({
        title: data.title || 'New Ticket',
        description: data.description || undefined,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
      });
      const hydrated = attachAssignees([newTicket], members);
      setTickets((prev) => [...hydrated, ...prev]);
      return hydrated[0] || null;
    } catch (error) {
      console.error('Failed to create ticket:', error);
      return null;
    }
  }, [attachAssignees, members]);

  const handleTicketUpdate = useCallback(async (id: string, data: Partial<Ticket>) => {
    const existing = tickets.find((ticket) => ticket.id === id);
    if (!existing) return;
    const next = { ...existing, ...data };

    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== id) return ticket;
        const assignee =
          'assignee_id' in data
            ? data.assignee_id
              ? members.find((member) => member.id === data.assignee_id) || null
              : null
            : ticket.assignee;
        return { ...next, assignee };
      })
    );

    try {
      const updated = await updateTicket({
        id,
        title: next.title,
        description: next.description ?? null,
        status: next.status,
        priority: next.priority,
        assignee_id: next.assignee_id ?? null,
      });
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id
            ? {
                ...ticket,
                ...updated,
                assignee: updated.assignee_id
                  ? members.find((member) => member.id === updated.assignee_id) ||
                    null
                  : null,
              }
            : ticket
        )
      );
    } catch (error) {
      console.error('Failed to update ticket:', error);
    }
  }, [members, tickets]);

  const handleTicketDelete = useCallback(async (id: string) => {
    try {
      await deleteTicket(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to delete ticket:', error);
    }
  }, []);

  const handleMemberUpdate = useCallback(async (updatedMember: Member) => {
    try {
      const saved = await updateMember({
        id: updatedMember.id,
        role: updatedMember.role,
        name: updatedMember.name,
        avatar: updatedMember.avatar ?? null,
        profile_image: updatedMember.profile_image ?? null,
        system_prompt: updatedMember.system_prompt,
        can_generate_images: updatedMember.can_generate_images,
        can_log_screenshots: updatedMember.can_log_screenshots,
        is_default: updatedMember.is_default,
      });
      setMembers(prev => prev.map(m => m.id === saved.id ? saved : m));
      setTickets(prev => prev.map(ticket => (
        ticket.assignee_id === saved.id
          ? { ...ticket, assignee: saved }
          : ticket
      )));
    } catch (error) {
      console.error('Failed to update member:', error);
    }
  }, []);

  const handleMemberCreate = useCallback(async (data: { role: string; name: string; avatar: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }) => {
    try {
      const newMember = await createMember({
        role: data.role,
        name: data.name,
        avatar: data.avatar,
        system_prompt: data.system_prompt,
        can_generate_images: data.can_generate_images ? 1 : 0,
        can_log_screenshots: data.can_log_screenshots ? 1 : 0,
      });
      setMembers(prev => [...prev, newMember]);
    } catch (error) {
      console.error('Failed to create member:', error);
      alert('Failed to create member. Please try again.');
    }
  }, []);

  const handleMemberDelete = useCallback(async (id: string) => {
    try {
      await deleteMember(id);
      setMembers(prev => prev.filter(m => m.id !== id));
      setTickets(prev => prev.map(ticket => (
        ticket.assignee_id === id ? { ...ticket, assignee_id: null, assignee: null } : ticket
      )));
    } catch (error) {
      console.error('Failed to delete member:', error);
      alert('Failed to delete member. Please try again.');
    }
  }, []);

  const handlePMTicketsCreated = useCallback(() => {
    refreshBoard(); // Refresh all data for current project
  }, [refreshBoard]);

  const handleProjectChange = useCallback((project: Project | null) => {
    setActiveProject(project);
  }, []);

  const handleRefresh = useCallback(() => {
    refreshBoard();
  }, [refreshBoard]);

  const handleCreateTicket = async () => {
    const newTicket = await handleTicketCreate({
      title: 'New Ticket',
      status: 'TODO',
      priority: 'MEDIUM'
    });
    if (newTicket) {
      setSelectedTicket(newTicket);
      setTicketSidebarOpen(true);
    }
  };

  const runningCount = 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/app-icon.png"
              alt="Olly Molly"
              width={28}
              height={28}
              className="opacity-80"
            />
            <h1 className="text-sm font-medium text-[var(--text-primary)]">Olly Molly</h1>
            <span className="text-[10px] text-[var(--text-muted)]" title={`Version ${appVersion}`}>
              v{appVersion}
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--status-progress-text)]">
                <span className="w-1.5 h-1.5 bg-[var(--status-progress-text)] rounded-full gentle-pulse" />
                {runningCount} working
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ProjectSelector onProjectChange={handleProjectChange} />
            <DevServerControl
              projectId={activeProject?.id || null}
              projectName={activeProject?.name || null}
              disabled={!devServerEnabled}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!agentFeaturesEnabled) {
                  alert('Tauri 모드에서는 파일 탐색 기능이 비활성화됩니다.');
                  return;
                }
                setArtifactsModalOpen(true);
              }}
            >
              파일 탐색
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!agentFeaturesEnabled) {
                  alert('Tauri 모드에서는 PM 요청 기능이 비활성화됩니다.');
                  return;
                }
                setPmModalOpen(true);
              }}
            >
              PM 요청
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateTicket}
            >
              + New
            </Button>
            <button
              onClick={() => {
                alert('Tauri 모드에서는 이미지 설정 기능이 비활성화됩니다.');
              }}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="이미지 생성 설정"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <ThemeToggle />
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d={sidebarOpen
                    ? "M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    : "M13 5l7 7-7 7M5 5l7 7-7 7"} />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-45px)]">
        <ResizablePane
          defaultLeftWidth={ticketSidebarOpen ? 55 : 100}
          minLeftWidth={30}
          minRightWidth={25}
          left={
            <div className="h-full overflow-auto">
              <KanbanBoard
                tickets={tickets}
                members={members}
                onTicketCreate={handleTicketCreate}
                onTicketUpdate={handleTicketUpdate}
                onTicketDelete={handleTicketDelete}
                onTicketsReorder={setTickets}
                hasActiveProject={!!activeProject}
                onRefresh={handleRefresh}
                disableAgentStatus={!agentFeaturesEnabled}
                onTicketSelect={(ticket) => {
                  setSelectedTicket(ticket);
                  setTicketSidebarOpen(true);
                }}
              />
            </div>
          }
          right={
            ticketSidebarOpen && selectedTicket ? (
              <TicketSidebar
                isOpen={ticketSidebarOpen}
                onClose={() => {
                  setTicketSidebarOpen(false);
                  setSelectedTicket(null);
                }}
                ticket={selectedTicket}
                members={members}
                onTicketUpdate={handleTicketUpdate}
                onTicketDelete={handleTicketDelete}
                hasActiveProject={!!activeProject}
                disableAgentFeatures={!agentFeaturesEnabled}
              />
            ) : (
              <div className="h-full bg-secondary border-l border-primary flex items-center justify-center text-muted">
                <p>Select a ticket to view details</p>
              </div>
            )
          }
        />

        {/* Team Sidebar */}
        <aside className={`
          fixed right-0 top-[45px] bottom-0 w-1/2 bg-[var(--bg-secondary)] border-l border-[var(--border-primary)]
          p-4 transition-transform duration-200 overflow-hidden z-20
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}>
          <TeamPanel
            members={members}
            onUpdateMember={handleMemberUpdate}
            onCreateMember={handleMemberCreate}
            onDeleteMember={handleMemberDelete}
          />
        </aside>
      </div>

      {agentFeaturesEnabled && (
        <ProjectArtifactsModal
          isOpen={artifactsModalOpen}
          onClose={() => setArtifactsModalOpen(false)}
          projectId={activeProject?.id || null}
          projectName={activeProject?.name || null}
          projectPath={activeProject?.path || null}
        />
      )}

      {agentFeaturesEnabled && (
        <PMRequestModal
          isOpen={pmModalOpen}
          onClose={() => setPmModalOpen(false)}
          onTicketsCreated={handlePMTicketsCreated}
          projectId={activeProject?.id}
        />
      )}



    </div>
  );
}
