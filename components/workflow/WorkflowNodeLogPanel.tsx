'use client';

import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConversations, useConversationMessages, type Ticket, type Member } from '@/lib/client-db';

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

  // Select the most recent conversation by default
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversationId) {
      const sorted = [...conversations].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSelectedConversationId(sorted[0].id);
    }
  }, [conversations, selectedConversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

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
        return 'text-red-400';
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
    <div className="w-96 h-full flex flex-col border-l border-[var(--border-primary)] bg-[var(--bg-secondary)]">
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
          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-4 h-4" />
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
        className="flex-1 overflow-y-auto p-3 font-mono text-xs"
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
          <div className="space-y-1">
            {messages.map((msg) => (
              <div key={msg.id} className={`${getMessageTypeStyle(msg.message_type)} whitespace-pre-wrap break-all`}>
                <span className="text-[var(--text-muted)] mr-2">[{formatTime(msg.created_at)}]</span>
                {msg.content}
              </div>
            ))}
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
