'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { KanbanBoard, TicketSidebar, MergeTicketModal } from '@/components/kanban';
import { TeamPanel } from '@/components/team';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PMRequestModal } from '@/components/pm';
import { ProjectSelector, ProjectArtifactsModal, DevServerControl } from '@/components/project';
import { WorkflowCanvas } from '@/components/workflow';
import { Button } from '@/components/ui/Button';
import { ResizablePane } from '@/components/ui/ResizablePane';
import { Icon } from '@/components/ui';
import { PanelRightClose, PanelRightOpen, Settings, CheckSquare, Square, LayoutDashboard, GitBranch, Menu, X, Plus, FolderOpen, MessageSquare, Users } from 'lucide-react';
import packageJson from '@/package.json';
import {
  initClientDb,
  useMembers,
  useMarketAgents,
  useTickets,
  memberService,
  marketAgentService,
  ticketService,
  projectService,
  userSettingsService,
  type Member,
  type MarketAgent,
  type Ticket,
  type Project,
} from '@/lib/client-db';
import { AgentMarketModal } from '@/components/market';
import type { AgentCategory } from '@/agents';

import { EmailSetup } from '@/components/onboarding/EmailSetup';
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

type ViewMode = 'kanban' | 'workflow';

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
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailChecked, setEmailChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // View mode state
  const [activeView, setActiveView] = useState<ViewMode>('kanban');

  // Multi-selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);

  const appVersion = packageJson.version;

  const members = useMembers();
  const marketAgents = useMarketAgents();
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
      .then(async () => {
        const email = await userSettingsService.getEmail();
        setUserEmail(email);
        setEmailChecked(true);
      })
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

  const handleMemberReorder = useCallback((updates: { id: string; order_index: number }[]) => {
    memberService.reorder(updates);
  }, []);

  const handleAddFromMarket = useCallback((agentId: string) => {
    try {
      memberService.addFromMarket(agentId);
    } catch (error) {
      console.error('Failed to add agent from market:', error);
      alert('Failed to add agent. Please try again.');
    }
  }, []);

  const handleCreateMarketAgent = useCallback((data: {
    role: string;
    name: string;
    avatar: string;
    system_prompt: string;
    description: string;
    category: AgentCategory;
    tags: string[];
    can_generate_images: boolean;
    can_log_screenshots: boolean;
  }) => {
    try {
      marketAgentService.create(data);
    } catch (error) {
      console.error('Failed to create market agent:', error);
      alert('Failed to create agent. Please try again.');
    }
  }, []);

  const handleDeleteMarketAgent = useCallback((id: string) => {
    try {
      const result = marketAgentService.delete(id);
      if (!result.success) {
        alert(result.error || 'Failed to delete agent');
      }
    } catch (error) {
      console.error('Failed to delete market agent:', error);
      alert('Failed to delete agent. Please try again.');
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

  // Show email setup for first-time users
  if (emailChecked && !userEmail) {
    return (
      <EmailSetup onComplete={(email) => setUserEmail(email)} />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div className={`
        fixed top-0 left-0 bottom-0 w-[280px] bg-[var(--bg-primary)] z-50 transform transition-transform duration-300 md:hidden
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2">
            <Image src="/app-icon.png" alt="Olly Molly" width={24} height={24} className="opacity-80" />
            <span className="font-medium text-[var(--text-primary)]">Olly Molly</span>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-[var(--text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          <div className="mb-4">
            <ProjectSelector onProjectChange={handleProjectChange} />
          </div>
          <button
            onClick={() => { setActiveView('kanban'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${activeView === 'kanban' ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
          >
            <LayoutDashboard className="w-5 h-5" /> Kanban
          </button>
          <button
            onClick={() => { setActiveView('workflow'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${activeView === 'workflow' ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
          >
            <GitBranch className="w-5 h-5" /> Workflow
          </button>
          <hr className="my-3 border-[var(--border-primary)]" />
          <button
            onClick={() => { setArtifactsModalOpen(true); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <FolderOpen className="w-5 h-5" /> 파일 탐색
          </button>
          <button
            onClick={() => { setPmModalOpen(true); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <MessageSquare className="w-5 h-5" /> PM 요청
          </button>
          <button
            onClick={() => { setSidebarOpen(true); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <Users className="w-5 h-5" /> 팀 멤버
          </button>
          <hr className="my-3 border-[var(--border-primary)]" />
          <button
            onClick={() => { setImageSettingsModalOpen(true); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <Settings className="w-5 h-5" /> 설정
          </button>
          <div className="px-4 py-2">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
        <div className="px-2 md:px-4 py-2 flex items-center justify-between">
          {/* Mobile: Hamburger + Logo */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Image
              src="/app-icon.png"
              alt="Olly Molly"
              width={28}
              height={28}
              className="opacity-80 hidden md:block"
            />
            <h1 className="text-sm font-medium text-[var(--text-primary)] hidden md:block">Olly Molly</h1>
            <span className="text-[10px] text-[var(--text-muted)] hidden lg:inline" title={`Version ${appVersion}`}>
              v{appVersion}
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--status-progress-text)]">
                <span className="w-1.5 h-1.5 bg-[var(--status-progress-text)] rounded-full gentle-pulse" />
                <span className="hidden sm:inline">{runningCount} working</span>
              </span>
            )}

            {/* View Mode Tabs - Desktop only */}
            <div className="hidden md:flex items-center gap-1 ml-4 bg-[var(--bg-secondary)] rounded-lg p-0.5">
              <button
                onClick={() => setActiveView('kanban')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${activeView === 'kanban'
                    ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <Icon icon={LayoutDashboard} />
                Kanban
              </button>
              <button
                onClick={() => setActiveView('workflow')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${activeView === 'workflow'
                    ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <Icon icon={GitBranch} />
                Workflow
              </button>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            <ProjectSelector onProjectChange={handleProjectChange} />
            <DevServerControl />
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

          {/* Mobile Actions */}
          <div className="flex md:hidden items-center gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateTicket}
              className="!px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-45px)] md:h-[calc(100vh-45px)]">
        {activeView === 'kanban' ? (
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
              !isMobile && ticketSidebarOpen && selectedTicket ? (
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
        ) : (
          <div className="flex-1">
            {activeProject ? (
              <WorkflowCanvas
                projectId={activeProject.id}
                tickets={allTickets.filter((t) => t.project_id === activeProject.id)}
                members={members}
                defaultAgentId={members.find((m) => m.role === 'FE_DEV')?.id || members[0]?.id || ''}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-[var(--bg-primary)]">
                <div className="text-center">
                  <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                    Select a Project
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Choose a project to view or create workflows
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Ticket Sidebar Overlay */}
        {isMobile && ticketSidebarOpen && selectedTicket && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => {
              setTicketSidebarOpen(false);
              setSelectedTicket(null);
            }}
          />
        )}
        <div className={`
          fixed inset-0 z-40 md:hidden bg-[var(--bg-primary)]
          transform transition-transform duration-300 ease-out
          safe-area-bottom
          ${ticketSidebarOpen && selectedTicket ? 'translate-x-0' : 'translate-x-full'}
        `}>
          {isMobile && ticketSidebarOpen && selectedTicket && (
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
          )}
        </div>

        {/* Team Sidebar Backdrop - Mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Team Sidebar */}
        <aside className={`
          fixed right-0 top-0 md:top-[45px] bottom-0
          w-[85vw] max-w-[320px] md:w-1/2 md:max-w-none
          bg-[var(--bg-secondary)] border-l border-[var(--border-primary)]
          transition-transform duration-300 z-40 md:z-20
          flex flex-col
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}>
          {/* Mobile Header */}
          <div className="flex md:hidden items-center justify-between p-4 border-b border-[var(--border-primary)] flex-shrink-0">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">팀 멤버</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto min-h-0">
            <TeamPanel
              members={members}
              onUpdateMember={handleMemberUpdate}
              onCreateMember={handleMemberCreate}
              onDeleteMember={handleMemberDelete}
              onReorderMembers={handleMemberReorder}
              onOpenMarket={() => setMarketModalOpen(true)}
            />
          </div>
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

      {/* Agent Market Modal */}
      <AgentMarketModal
        isOpen={marketModalOpen}
        onClose={() => setMarketModalOpen(false)}
        marketAgents={marketAgents}
        members={members}
        onAddToTeam={handleAddFromMarket}
        onCreateMarketAgent={handleCreateMarketAgent}
        onDeleteMarketAgent={handleDeleteMarketAgent}
      />
    </div>
  );
}
