"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { executeAgent, type AgentProvider } from "@/lib/tauri-agent";
import type { Project } from "@/lib/tauri-projects";

type Member = {
  id: string;
  name: string;
  avatar?: string | null;
  role: string;
};

type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee_id?: string | null;
};

interface TicketSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  members: Member[];
  activeProject: Project | null;
  onTicketUpdate: (id: string, data: Partial<Ticket>) => void;
}

const statusOptions = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "NEED_FIX", label: "Need Fix" },
  { value: "COMPLETE", label: "Complete" },
  { value: "ON_HOLD", label: "On Hold" },
];

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export function TicketSidebar({
  isOpen,
  onClose,
  ticket,
  members,
  activeProject,
  onTicketUpdate,
}: TicketSidebarProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("TODO");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [provider, setProvider] = useState<AgentProvider>("opencode");
  const [feedback, setFeedback] = useState("");
  const [executing, setExecuting] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticket) return;
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setAssigneeId(ticket.assignee_id ?? "");
    setOutput("");
    setError(null);
  }, [ticket?.id]);

  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...members.map((member) => ({
        value: member.id,
        label: `${member.avatar ?? member.role} ${member.name}`,
      })),
    ],
    [members]
  );

  if (!isOpen || !ticket) return null;

  const handleSave = () => {
    onTicketUpdate(ticket.id, {
      title,
      description: description || null,
      status,
      priority,
      assignee_id: assigneeId || null,
    });
  };

  const handleExecute = async () => {
    if (!activeProject) {
      setError("Select an active project first.");
      return;
    }
    if (!assigneeId) {
      setError("Assign an agent first.");
      return;
    }

    setExecuting(true);
    setError(null);
    setOutput("");

    try {
      handleSave();
      const result = await executeAgent({
        ticketId: ticket.id,
        title,
        description,
        provider,
        feedback: feedback.trim() || undefined,
        projectId: activeProject.id,
      });
      setOutput(result.output);
      onTicketUpdate(ticket.id, { status: "IN_PROGRESS" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to execute.";
      setError(message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--paper)] shadow-xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Ticket
          </p>
          <h3 className="text-lg font-semibold text-[var(--ink)]">
            {ticket.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={statusOptions}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={priorityOptions}
          />
          <Select
            label="Assignee"
            value={assigneeId}
            onChange={setAssigneeId}
            options={assigneeOptions}
          />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Execute Agent
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Provider will run inside the active project directory.
          </p>

          <div className="mt-3 flex gap-2">
            {(["opencode", "claude"] as AgentProvider[]).map((value) => (
              <button
                key={value}
                onClick={() => setProvider(value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  provider === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {value === "opencode" ? "OpenCode" : "Claude"}
              </button>
            ))}
          </div>

          <Textarea
            className="mt-3"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback for the agent"
            rows={3}
            disabled={executing}
          />

          {error ? (
            <p className="mt-3 text-sm text-rose-500">{error}</p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button onClick={handleExecute} disabled={executing}>
              {executing ? "Running..." : "Run Agent"}
            </Button>
            <Button variant="ghost" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>

        {output ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Output
            </p>
            <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--ink)]">
              {output}
            </pre>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
