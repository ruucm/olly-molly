'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { KanbanBoard, TicketSidebar, MergeTicketModal } from '@/components/kanban';
import { TeamPanel } from '@/components/team';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PMRequestModal } from '@/components/pm';
import { ProjectSelector, DevServerControl, ProjectArtifactsModal } from '@/components/project';
import { Button } from '@/components/ui/Button';
import { ResizablePane } from '@/components/ui/ResizablePane';
import { Icon } from '@/components/ui';
import { PanelRightClose, PanelRightOpen, Settings, CheckSquare, Square } from 'lucide-react';
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
  assignees: Member[];  // Multi-assignee support
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

type BoardTicket = Omit<UiTicket, 'assignees'> & {
  assignees: BoardMember[];  // Multi-assignee support
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

  // Multi-selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);

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
      assignees: (ticket.assignee_ids || []).map(id => membersById.get(id)).filter(Boolean) as BoardMember[],
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
        assignee_ids: data.assignee_ids || [],
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
        assignee_ids: data.assignee_ids,
      });
    } catch (error) {
      console.error('Failed to update ticket:', error);
    }
  }, []);
  const handleTicketsReorder = useCallback((reorderedTickets: { id: string }[]) => {
    const updates = reorderedTickets.map((t, index) => ({
      id: t.id,
      order_index: index * 1000,
    }));
    ticketService.reorder(updates);
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

  // Selection handlers
  const handleTicketCheck = useCallback((ticketId: string) => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedTicketIds(new Set());
  }, []);

  const selectedTickets = useMemo(() => {
    // We need to map back from BoardTicket (UI) to Ticket for the modal if needed, 
    // but Modal expects Ticket. Use allTickets or tickets (BoardTicket) depending on Modal prop type.
    // MergeTicketModal expects Ticket[], and BoardTicket extends UiTicket which is compatible enough or we cast.
    // Actually tickets is BoardTicket[], checking Ticket type compatibility.
    // BoardTicket has assignee object, Ticket has assignee object. Should be compatible.
    return tickets.filter(t => selectedTicketIds.has(t.id)) as Ticket[];
  }, [tickets, selectedTicketIds]);

  const handleMergeTickets = useCallback((data: {
    title: string;
    description: string;
    priority: string;
    assignee_ids: string[];
    deleteOriginals: boolean;
  }) => {
    const newTicket = ticketService.create({
      title: data.title,
      description: data.description,
      priority: data.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      assignee_ids: data.assignee_ids,
      project_id: activeProject?.id,
    });

    if (data.deleteOriginals) {
      selectedTicketIds.forEach(id => {
        ticketService.delete(id);
      });
    }

    handleClearSelection();
    handleRefresh();
    setShowMergeModal(false);
  }, [selectedTicketIds, handleClearSelection, handleRefresh, activeProject]);



  const handleCreateTicket = async () => {
    const newTicket = await handleTicketCreate({
      title: 'New Ticket',
      status: 'TODO',
      priority: 'MEDIUM'
    });
    if (newTicket) {
      // Convert to BoardTicket with assignees array
      const boardTicket: BoardTicket = {
        ...newTicket,
        assignees: [],
      };
      setSelectedTicket(boardTicket);
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

            {/* Selection Mode Toggle */}
            <div className="flex items-center gap-2 border-l border-[var(--border-primary)] pl-2 ml-1">
              <button
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  if (selectionMode) handleClearSelection();
                }}
                className={`p-1.5 rounded-lg transition-colors ${selectionMode
                  ? 'bg-indigo-500 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                title={selectionMode ? '선택 모드 OFF' : '선택 모드'}
              >
                <Icon icon={selectionMode ? CheckSquare : Square} />
              </button>

              {selectionMode && selectedTicketIds.size > 0 && (
                <>
                  <span className="text-xs text-indigo-400 font-medium">
                    {selectedTicketIds.size}
                  </span>
                  {selectedTicketIds.size >= 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMergeModal(true)}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Merge
                    </Button>
                  )}
                  <button
                    onClick={handleClearSelection}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    title="Clear selection"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => setImageSettingsModalOpen(true)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="이미지 생성 설정"
            >
              <Icon icon={Settings} />
            </button>
            <ThemeToggle />
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Icon icon={sidebarOpen ? PanelRightClose : PanelRightOpen} />
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
                selectionMode={selectionMode}
                selectedTicketIds={selectedTicketIds}
                onTicketCheck={handleTicketCheck}
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

      {/* Merge Ticket Modal */}
      <MergeTicketModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        tickets={selectedTickets}
        members={members}
        onMerge={handleMergeTickets}
      />
    </div>
  );
}
