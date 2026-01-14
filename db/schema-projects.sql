-- Projects table for storing target project configurations
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent work logs - detailed execution history
CREATE TABLE IF NOT EXISTS agent_work_logs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  command TEXT NOT NULL,
  prompt TEXT,
  output TEXT,
  status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  git_commit_hash TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_work_logs_ticket ON agent_work_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_agent_work_logs_agent ON agent_work_logs(agent_id);
