'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  initClientDb,
  useMembers,
  useTickets,
  memberService,
  ticketService,
  projectService,
  type Member,
  type Ticket,
  type Project,
} from '@/lib/client-db';

import { CLIWarningModal } from '@/components/ui/CLIWarningModal';
import { ImageSettingsModal } from '@/components/ui/ImageSettingsModal';

interface RunningJob {
  id: string;
  ticketId: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed';
}
type UiTicket = Omit<Ticket, 'status' | 'priority'> & {
  status: string;
  priority: string;
  assignee?: Member | null;
};

type BoardMember = {
  id: string;
  name: string;
  avatar?: string | null;
  role: string;
  system_prompt: string;
  is_default: number;
  can_generate_images: number;
  can_log_screenshots: number;
};

type TeamMember = BoardMember;

type BoardTicket = Omit<UiTicket, 'assignee'> & {
  assignee?: BoardMember | null;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<BoardTicket | null>(null);
  const [ticketSidebarOpen, setTicketSidebarOpen] = useState(false);
  const [artifactsModalOpen, setArtifactsModalOpen] = useState(false);

  const [cliWarningModalOpen, setCliWarningModalOpen] = useState(false);
  const [imageSettingsModalOpen, setImageSettingsModalOpen] = useState(false);
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const appVersion = packageJson.version;

  const members = useMembers();
  const allTickets = useTickets();

  const membersById = useMemo(() => {
    return new Map(members.map((member) => [member.id, member]));
  }, [members]);

  const activeProjectId = activeProject?.id;

  const tickets = useMemo<BoardTicket[]>(() => {
    const filtered = activeProjectId
      ? allTickets.filter((ticket) => ticket.project_id === activeProjectId)
      : allTickets;
    return filtered.map((ticket) => ({
      ...ticket,
      assignee: ticket.assignee_id ? membersById.get(ticket.assignee_id) || null : null,
    }));
  }, [allTickets, activeProjectId, membersById]);



  // Check for CLI tools on mount
  useEffect(() => {
    fetch('/api/check-cli')
      .then(res => res.json())
      .then(data => {
        if (!data.anyInstalled) {
          setCliWarningModalOpen(true);
        }
      })
      .catch(err => {
        console.error('Failed to check CLI installation:', err);
      });
  }, []);

  // Poll for running jobs
  useEffect(() => {
    const fetchRunningJobs = async () => {
      try {
        const res = await fetch('/api/agent/status');
        const data = await res.json();
        setRunningJobs(data.jobs || []);
      } catch (error) {
        console.error('Failed to fetch running jobs:', error);
      }
    };
    fetchRunningJobs();
    const interval = setInterval(fetchRunningJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    initClientDb()
      .catch((error) => {
        console.error('Failed to initialize local database:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleTicketCreate = useCallback(async (data: Partial<BoardTicket>) => {
    try {
      const newTicket = ticketService.create({
        title: data.title || 'New Ticket',
        description: data.description || undefined,
        priority: data.priority as Ticket['priority'] | undefined,
        assignee_id: data.assignee_id || undefined,
        project_id: activeProject?.id,
        created_by: data.created_by ?? undefined,
      });
      return newTicket as Ticket;
    } catch (error) {
      console.error('Failed to create ticket:', error);
      return null;
    }
  }, [activeProject]);

  const handleTicketUpdate = useCallback(async (id: string, data: Partial<BoardTicket>) => {
    try {
      ticketService.update(id, {
        title: data.title,
        description: data.description,
        status: data.status as Ticket['status'] | undefined,
        priority: data.priority as Ticket['priority'] | undefined,
        assignee_id: data.assignee_id ?? undefined,
      });
    } catch (error) {
      console.error('Failed to update ticket:', error);
    }
  }, []);
  const handleTicketsReorder = useCallback(() => {
    // Order is derived from status/priority; no local ordering to persist yet.
  }, []);

  const handleTicketDelete = useCallback(async (id: string) => {
    try {
      ticketService.delete(id);
    } catch (error) {
      console.error('Failed to delete ticket:', error);
    }
  }, []);

  const handleMemberUpdate = useCallback((updatedMember: TeamMember) => {
    memberService.update(updatedMember.id, {
      name: updatedMember.name,
      avatar: updatedMember.avatar || null,
      system_prompt: updatedMember.system_prompt,
      can_generate_images: updatedMember.can_generate_images,
      can_log_screenshots: updatedMember.can_log_screenshots,
    });
  }, []);

  const handleMemberCreate = useCallback(async (data: { role: string; name: string; avatar: string; system_prompt: string; can_generate_images?: boolean; can_log_screenshots?: boolean }) => {
    try {
      memberService.create(data);
    } catch (error) {
      console.error('Failed to create member:', error);
      alert('Failed to create member. Please try again.');
    }
  }, []);

  const handleMemberDelete = useCallback(async (id: string) => {
    try {
      const result = memberService.delete(id);
      if (!result.success) {
        alert(result.error || 'Failed to delete member');
      }
    } catch (error) {
      console.error('Failed to delete member:', error);
      alert('Failed to delete member. Please try again.');
    }
  }, []);

  const handlePMTicketsCreated = useCallback(() => {
    if (activeProject?.id) {
      projectService.setActive(activeProject.id);
    }
  }, [activeProject]);

  const handleProjectChange = useCallback((project: Project | null) => {
    setActiveProject(project);
  }, []);

  const handleRefresh = useCallback(() => {
    if (activeProject?.id) {
      projectService.setActive(activeProject.id);
    }
  }, [activeProject]);



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

  const runningCount = runningJobs.filter(j => j.status === 'running').length;

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
              projectPath={activeProject?.path || null}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArtifactsModalOpen(true)}
            >
              파일 탐색
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPmModalOpen(true)}
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
              onClick={() => setImageSettingsModalOpen(true)}
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
                  onTicketsReorder={handleTicketsReorder}
                hasActiveProject={!!activeProject}
                onRefresh={handleRefresh}
                onTicketSelect={(ticket) => {
                  const fullTicket = tickets.find((item) => item.id === ticket.id) || ticket;
                  setSelectedTicket(fullTicket as BoardTicket);
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

      <ProjectArtifactsModal
        isOpen={artifactsModalOpen}
        onClose={() => setArtifactsModalOpen(false)}
        projectId={activeProject?.id || null}
        projectName={activeProject?.name || null}
        projectPath={activeProject?.path || null}
      />

      {/* PM Request Modal */}
      <PMRequestModal
        isOpen={pmModalOpen}
        onClose={() => setPmModalOpen(false)}
        onTicketsCreated={handlePMTicketsCreated}
        projectId={activeProject?.id}
      />



      {/* CLI Warning Modal */}
      <CLIWarningModal
        isOpen={cliWarningModalOpen}
        onClose={() => setCliWarningModalOpen(false)}
      />

      {/* Image Settings Modal */}
      <ImageSettingsModal
        isOpen={imageSettingsModalOpen}
        onClose={() => setImageSettingsModalOpen(false)}
      />
    </div>
  );
}
