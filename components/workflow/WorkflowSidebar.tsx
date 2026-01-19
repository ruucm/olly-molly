'use client';

import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Workflow } from '@/lib/client-db';

interface WorkflowSidebarProps {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
  onSelect: (workflowId: string) => void;
  onCreate: (name: string) => void;
  onDelete: (workflowId: string) => void;
  onRename: (workflowId: string, name: string) => void;
}

export function WorkflowSidebar({
  workflows,
  selectedWorkflowId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: WorkflowSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName('');
      setIsCreating(false);
    }
  };

  const handleRename = () => {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
    }
  };

  const startEditing = (workflow: Workflow) => {
    setEditingId(workflow.id);
    setEditingName(workflow.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const getStatusColor = (status: Workflow['status']) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="w-64 h-full flex flex-col border-r border-[var(--border-primary)] bg-[var(--bg-secondary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Workflows</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCreating(true)}
          className="!px-2"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="p-3 border-b border-[var(--border-primary)]">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Workflow name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewName('');
              }
            }}
          />
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Workflow List */}
      <div className="flex-1 overflow-y-auto">
        {workflows.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-sm text-[var(--text-muted)]">No workflows yet</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Click + to create one
            </p>
          </div>
        )}

        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className={`
              flex items-center gap-2 px-3 py-2 cursor-pointer
              transition-colors duration-150
              ${selectedWorkflowId === workflow.id
                ? 'bg-[var(--accent-primary)]/10 border-l-2 border-[var(--accent-primary)]'
                : 'hover:bg-[var(--bg-tertiary)]'
              }
            `}
            onClick={() => onSelect(workflow.id)}
          >
            {/* Status Indicator */}
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(workflow.status)}`}
              title={workflow.status}
            />

            {editingId === workflow.id ? (
              <div className="flex-1 flex items-center gap-1">
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="!py-0.5 text-sm"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') cancelEditing();
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRename();
                  }}
                  className="p-1 text-green-500 hover:text-green-400"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelEditing();
                  }}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                  {workflow.name}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(workflow);
                    }}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this workflow?')) {
                        onDelete(workflow.id);
                      }
                    }}
                    className="p-1 text-[var(--text-muted)] hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
