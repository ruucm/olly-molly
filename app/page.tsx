"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  createTicket,
  loadBoardData,
  type BoardData,
  type BoardLoadResult,
} from "@/lib/tauri-board";
import { ProjectSelector } from "@/components/project/ProjectSelector";
import { TicketSidebar } from "@/components/kanban/TicketSidebar";
import type { Project } from "@/lib/tauri-projects";

const columns = [
  { key: "TODO", label: "Todo" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "IN_REVIEW", label: "In Review" },
  { key: "NEED_FIX", label: "Need Fix" },
  { key: "COMPLETE", label: "Complete" },
  { key: "ON_HOLD", label: "On Hold" },
];

const priorityTone: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function Home() {
  const [boardData, setBoardData] = useState<BoardData>({
    members: [],
    tickets: [],
  });
  const [dataSource, setDataSource] = useState<BoardLoadResult["source"]>("seed");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    assignee_id: "",
  });

  const assigneeOptions = useMemo(
    () =>
      boardData.members.map((member) => ({
        id: member.id,
        label: member.name,
      })),
    [boardData.members]
  );

  const selectedTicket =
    boardData.tickets.find((ticket) => ticket.id === selectedTicketId) || null;

  useEffect(() => {
    let isMounted = true;

    loadBoardData().then((result) => {
      if (!isMounted) return;
      setBoardData(result.data);
      setDataSource(result.source);
      setLoadError(result.error ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const resetForm = () => {
    setFormState({
      title: "",
      description: "",
      priority: "MEDIUM",
      assignee_id: "",
    });
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.title.trim()) {
      setSubmitError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const ticket = await createTicket({
        title: formState.title.trim(),
        description: formState.description.trim() || undefined,
        priority: formState.priority,
        assignee_id: formState.assignee_id || undefined,
      });

      setBoardData((prev) => ({
        ...prev,
        tickets: [ticket, ...prev.tickets],
      }));

      setIsComposerOpen(false);
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      setSubmitError(message || "Failed to create ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fef6ea,_#f7f4ef_55%,_#efe7dc)] text-[var(--ink)]">
      <header className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--paper)]">
        <div className="paper-grid absolute inset-0 opacity-70" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
              Olly Molly Control Desk
            </p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Your Local AI Team !, Focused and Visible.
            </h1>
            <p className="max-w-xl text-base leading-7 text-[var(--muted)]">
              Kanban grounded in the project schema: tickets, priorities, and
              agent assignments stay aligned from planning to ship.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ProjectSelector onProjectChange={setActiveProject} />
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => setIsComposerOpen(true)}
            >
              New Ticket
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--border)] bg-white/70 px-6 py-5 shadow-sm backdrop-blur">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Active Agents</h2>
            <p className="text-sm text-[var(--muted)]">
              Default team members from the schema.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {boardData.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]"
              >
                <span className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-semibold">
                  {member.avatar ?? member.role}
                </span>
                <span>{member.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--paper)] px-5 py-3 text-sm text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span className="font-semibold text-[var(--ink)]">
              {dataSource === "tauri" ? "Tauri backend connected" : "Local preview"}
            </span>
          </div>
          <span className="font-mono uppercase tracking-[0.2em] text-[10px]">
            {dataSource === "tauri" ? "sqlite" : "seed"}
          </span>
        </section>

        {loadError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            Backend unavailable: {loadError}
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Kanban Board</h2>
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              Schema-aligned statuses
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-6">
            {columns.map((column) => {
              const columnTickets = boardData.tickets.filter(
                (ticket) => ticket.status === column.key
              );

              return (
                <div
                  key={column.key}
                  className="flex min-w-[260px] flex-1 flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--paper)] p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      <span>{column.label}</span>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                      {columnTickets.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {columnTickets.map((ticket) => {
                      const assignee = boardData.members.find(
                        (member) => member.id === ticket.assignee_id
                      );

                      return (
                        <article
                          key={ticket.id}
                          className="cursor-pointer rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          onClick={() => setSelectedTicketId(ticket.id)}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                            <span>{ticket.id}</span>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] ${priorityTone[ticket.priority]}`}
                            >
                              {ticket.priority}
                            </span>
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">
                            {ticket.title}
                          </h3>
                          <p className="mt-2 text-sm text-[var(--muted)]">
                            {ticket.description}
                          </p>
                          <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                            <span className="rounded-full border border-[var(--border)] bg-[var(--paper)] px-2 py-1 font-mono">
                              {ticket.status}
                            </span>
                            <span className="flex items-center gap-2 font-medium text-[var(--ink)]">
                              <span className="rounded-full border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-[11px] font-semibold">
                                {assignee?.avatar}
                              </span>
                              {assignee?.name}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {isComposerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-10">
          <div className="w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--paper)] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                  New Ticket
                </p>
                <h3 className="text-2xl font-semibold text-[var(--ink)]">
                  Create a focused task
                </h3>
              </div>
              <button
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]"
                onClick={() => {
                  setIsComposerOpen(false);
                  resetForm();
                }}
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--ink)]">
                  Title
                </label>
                <input
                  className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  placeholder="Describe the task"
                  value={formState.title}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--ink)]">
                  Description
                </label>
                <textarea
                  className="h-24 w-full resize-none rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  placeholder="Context or acceptance notes"
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--ink)]">
                    Priority
                  </label>
                  <select
                    className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    value={formState.priority}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        priority: event.target.value,
                      }))
                    }
                  >
                    {Object.keys(priorityTone).map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--ink)]">
                    Assignee
                  </label>
                  <select
                    className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    value={formState.assignee_id}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        assignee_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {submitError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {submitError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-[var(--muted)]">
                  New tickets start in TODO.
                </p>
                <button
                  className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Creating..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <TicketSidebar
        isOpen={Boolean(selectedTicket)}
        onClose={() => setSelectedTicketId(null)}
        ticket={selectedTicket}
        members={boardData.members}
        activeProject={activeProject}
        onTicketUpdate={(id, data) =>
          setBoardData((prev) => ({
            ...prev,
            tickets: prev.tickets.map((ticket) =>
              ticket.id === id ? { ...ticket, ...data } : ticket
            ),
          }))
        }
      />
    </div>
  );
}
