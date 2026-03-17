'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConversations, useConversationMessages, syncFromServer, type Ticket, type Member, type ConversationMessage } from '@/lib/client-db';

function stripAnsi(input: string): string {
  return input
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function classifyLogLine(line: string): 'stderr' | 'error' | 'normal' {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('[stderr]')) return 'stderr';
  if (trimmed.startsWith('[error]')) return 'error';
  if (/^\s*(error:|fatal:)/i.test(trimmed)) return 'error';
  return 'normal';
}

interface WorkflowNodeLogPanelProps {
  ticket: Ticket;
  assignees: Member[];
  onClose: () => void;
}

export function WorkflowNodeLogPanel({ ticket, assignees, onClose }: WorkflowNodeLogPanelProps) {
  const conversations = useConversations(ticket.id);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const messages = useConversationMessages(selectedConversationId);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Sync conversations from server (ComfyUI pattern - server is source of truth)
  const syncFromServerData = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/sync?ticket_id=${ticket.id}`);
      const data = await res.json();

      if (data.conversations) {
        for (const conv of data.conversations) {
          syncFromServer.upsertConversation(conv);
        }
      }
      if (data.messages) {
        for (const msg of data.messages) {
          syncFromServer.upsertMessage(msg);
        }
      }
      // Sync ticket status from server
      if (data.ticketStatuses) {
        for (const statusUpdate of data.ticketStatuses) {
          syncFromServer.updateTicketStatus(statusUpdate.ticket_id, statusUpdate.status);
        }
      }
    } catch (error) {
      console.error('[WorkflowNodeLogPanel] Error syncing from server:', error);
    }
  }, [ticket.id]);

  // Sync from server when ticket changes and periodically while panel is open
  useEffect(() => {
    syncFromServerData();

    // Poll every 2 seconds for updates
    const interval = setInterval(syncFromServerData, 2000);
    return () => clearInterval(interval);
  }, [syncFromServerData]);

  // Reset selected conversation when ticket changes
  useEffect(() => {
    setSelectedConversationId(null);
  }, [ticket.id]);

  // Select the most recent conversation by default
  useEffect(() => {
    if (conversations.length > 0) {
      const sorted = [...conversations].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      // Always select the most recent conversation
      if (!selectedConversationId || !conversations.find(c => c.id === selectedConversationId)) {
        setSelectedConversationId(sorted[0].id);
      }
    }
  }, [conversations, selectedConversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  // Group consecutive log messages to prevent fragmented display from streaming chunks
  const groupedMessages = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const groups: Array<{
      id: string;
      type: ConversationMessage['message_type'];
      content: string;
      created_at: string;
    }> = [];

    for (const msg of sorted) {
      const lastGroup = groups[groups.length - 1];
      if (msg.message_type === 'log' && lastGroup?.type === 'log') {
        lastGroup.content += msg.content;
      } else {
        groups.push({
          id: msg.id,
          type: msg.message_type,
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    }
    return groups;
  }, [messages]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMessageTypeStyle = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-300 bg-red-500/10 border-red-500/30';
      case 'success':
        return 'text-green-400';
      case 'system':
        return 'text-blue-400';
      default:
        return 'text-[var(--text-secondary)]';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="w-full md:w-96 h-full flex flex-col border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
            {ticket.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {assignees.length > 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                {assignees.map((a) => a.name).join(', ')}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conversation Tabs */}
      {conversations.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border-primary)] overflow-x-auto">
          {conversations
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((conv, idx) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversationId(conv.id)}
                className={`
                  flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap
                  transition-colors
                  ${selectedConversationId === conv.id
                    ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                {getStatusIcon(conv.status)}
                <span>Run #{conversations.length - idx}</span>
              </button>
            ))}
        </div>
      )}

      {/* Conversation Info */}
      {selectedConversation && (
        <div className="px-3 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {getStatusIcon(selectedConversation.status)}
              <span className="text-[var(--text-muted)]">
                {selectedConversation.provider.toUpperCase()}
              </span>
            </div>
            <span className="text-[var(--text-muted)]">
              {formatTime(selectedConversation.started_at)}
              {selectedConversation.completed_at && (
                <> - {formatTime(selectedConversation.completed_at)}</>
              )}
            </span>
          </div>
          {selectedConversation.git_commit_hash && (
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              Commit: <code className="text-green-400">{selectedConversation.git_commit_hash.slice(0, 7)}</code>
            </div>
          )}
        </div>
      )}

      {/* Log Messages */}
      <div
        ref={logContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
          setAutoScroll(isAtBottom);
        }}
      >
        {conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
            <p>No execution logs yet</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <p>Waiting for logs...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedMessages.map((group) => {
              const lines = stripAnsi(group.content).split('\n');
              const isError = group.type === 'error';
              const debugIdx = isError ? lines.findIndex(l => l.includes('--- Debug Info ---')) : -1;

              return (
                <div key={group.id} className={`rounded border border-[var(--border-primary)] p-2 ${getMessageTypeStyle(group.type)}`}>
                  <span className="text-[var(--text-muted)] mr-2 text-[10px]">[{formatTime(group.created_at)}]</span>
                  <div className="mt-1 space-y-0.5">
                    {(debugIdx !== -1 ? lines.slice(0, debugIdx) : lines).map((line, idx) => {
                      const kind = classifyLogLine(line);
                      const lineClass = kind === 'stderr' || kind === 'error' ? 'text-red-300' : '';
                      return (
                        <div key={idx} className={`whitespace-pre-wrap break-words ${lineClass}`}>
                          {line}
                        </div>
                      );
                    })}
                    {debugIdx !== -1 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-red-400/70 hover:text-red-300 text-[10px] uppercase tracking-wider select-none">
                          Debug Info
                        </summary>
                        <div className="mt-1 pl-2 border-l-2 border-red-500/30 text-red-400/60 space-y-0.5">
                          {lines.slice(debugIdx + 1).map((line, idx) => (
                            <div key={idx} className="whitespace-pre-wrap break-words">{line}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-primary)]">
        <span className="text-xs text-[var(--text-muted)]">
          {messages.length} messages
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAutoScroll(true);
            if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
          }}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Scroll to bottom
        </Button>
      </div>
    </div>
  );
}
