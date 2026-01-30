'use client';

import { Play, Pause, RotateCcw, Save, Menu, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Workflow } from '@/lib/client-db';

export type AgentProvider = 'claude' | 'opencode' | 'codex';

interface WorkflowControlsProps {
  workflow: Workflow | null;
  hasNodes: boolean;
  hasUnsavedChanges: boolean;
  selectedProvider: AgentProvider;
  onProviderChange: (provider: AgentProvider) => void;
  onExecute: () => void;
  onPause: () => void;
  onReset: () => void;
  onSave: () => void;
  isMobile?: boolean;
  onToggleSidebar?: () => void;
  onToggleTicketPanel?: () => void;
}

const providerLabels: Record<AgentProvider, { full: string; short: string }> = {
  claude: { full: 'Claude', short: 'C' },
  opencode: { full: 'OpenCode', short: 'O' },
  codex: { full: 'Codex', short: 'X' },
};

const providerColors: Record<AgentProvider, string> = {
  claude: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  opencode: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  codex: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export function WorkflowControls({
  workflow,
  hasNodes,
  hasUnsavedChanges,
  selectedProvider,
  onProviderChange,
  onExecute,
  onPause,
  onReset,
  onSave,
  isMobile,
  onToggleSidebar,
  onToggleTicketPanel,
}: WorkflowControlsProps) {
  const isRunning = workflow?.status === 'running';
  const isPaused = workflow?.status === 'paused';
  const isIdle = workflow?.status === 'idle' || !workflow;
  const canExecute = hasNodes && (isIdle || isPaused);
  const canPause = isRunning;
  const canReset = !isIdle;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)]">
      {/* Mobile: Sidebar Toggle */}
      {isMobile && onToggleSidebar && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          className="!px-2"
        >
          <Menu className="w-4 h-4" />
        </Button>
      )}

      {/* Workflow Name */}
      {workflow && (
        <div className="flex items-center gap-2 mr-2 md:mr-4">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[120px] md:max-w-none">
            {workflow.name}
          </span>
          {workflow.status !== 'idle' && (
            <span
              className={`
                text-xs px-2 py-0.5 rounded-full
                ${workflow.status === 'running' ? 'bg-blue-500/20 text-blue-400' : ''}
                ${workflow.status === 'completed' ? 'bg-green-500/20 text-green-400' : ''}
                ${workflow.status === 'failed' ? 'bg-red-500/20 text-red-400' : ''}
                ${workflow.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' : ''}
              `}
            >
              {workflow.status}
            </span>
          )}
        </div>
      )}

      {/* Provider Selector */}
      <div className="flex items-center gap-1 mr-2">
        {(['claude', 'opencode', 'codex'] as AgentProvider[]).map((provider) => (
          <button
            key={provider}
            onClick={() => onProviderChange(provider)}
            disabled={isRunning}
            className={`
              px-2.5 py-1 text-xs font-medium rounded border transition-colors
              ${selectedProvider === provider
                ? providerColors[provider]
                : 'bg-transparent text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
              }
              ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span className="hidden md:inline">{providerLabels[provider].full}</span>
            <span className="md:hidden">{providerLabels[provider].short}</span>
          </button>
        ))}
      </div>

      <div className="hidden md:block w-px h-6 bg-[var(--border-primary)] mr-2" />

      <div className="flex items-center gap-2">
        {/* Execute Button */}
        <Button
          variant="primary"
          size="sm"
          onClick={onExecute}
          disabled={!canExecute}
          title={isPaused ? 'Resume workflow' : 'Execute workflow'}
        >
          <Play className="w-4 h-4" />
          <span className="hidden md:inline">{isPaused ? 'Resume' : 'Execute'}</span>
        </Button>

        {/* Pause Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onPause}
          disabled={!canPause}
          title="Pause workflow"
        >
          <Pause className="w-4 h-4" />
          <span className="hidden md:inline">Pause</span>
        </Button>

        {/* Reset Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={!canReset}
          title="Reset workflow"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden md:inline">Reset</span>
        </Button>

        {/* Divider */}
        <div className="hidden md:block w-px h-6 bg-[var(--border-primary)] mx-2" />

        {/* Save Button */}
        <Button
          variant={hasUnsavedChanges ? 'primary' : 'ghost'}
          size="sm"
          onClick={onSave}
          disabled={!hasUnsavedChanges}
          title="Save changes"
        >
          <Save className="w-4 h-4" />
          <span className="hidden md:inline">Save</span>
        </Button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mobile: Ticket Panel Toggle */}
      {isMobile && onToggleTicketPanel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTicketPanel}
          title="Toggle ticket panel"
          className="!px-2"
        >
          <PanelRight className="w-4 h-4" />
        </Button>
      )}

      {/* Help text */}
      <span className="hidden md:flex text-xs text-[var(--text-muted)]">
        Drag tickets from the panel to add nodes
      </span>
    </div>
  );
}
