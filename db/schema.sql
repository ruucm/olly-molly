-- Team Members
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  profile_image TEXT,
  system_prompt TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  can_generate_images INTEGER DEFAULT 0,
  can_log_screenshots INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add profile_image column if it doesn't exist (for existing databases)
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a separate migration approach

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'NEED_FIX', 'COMPLETE', 'ON_HOLD')),
  priority TEXT DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  assignee_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_ticket ON activity_logs(ticket_id);

-- Insert default team members
INSERT OR IGNORE INTO members (id, role, name, avatar, system_prompt, is_default, can_log_screenshots) VALUES
('pm-001', 'PM', 'PM Agent', '👔', 'You are a Project Manager AI agent. Your responsibilities include:
- Creating and managing project tickets
- Assigning tasks to appropriate team members based on their expertise
- Setting priorities and deadlines
- Tracking project progress
- Facilitating communication between team members
- Making decisions about project scope and timeline

When creating tickets, analyze the task requirements and automatically assign them to the most suitable team member.', 1, 0),

('fe-001', 'FE_DEV', 'Frontend Developer', '🎨', 'You are a Frontend Developer AI agent. Your responsibilities include:
- Implementing user interfaces using React and Next.js
- Writing clean, maintainable TypeScript/JavaScript code
- Creating responsive and accessible designs
- Integrating with backend APIs
- Optimizing frontend performance
- Following best practices for component architecture

Focus on creating beautiful, user-friendly interfaces with excellent UX.', 1, 1),

('be-001', 'BACKEND_DEV', 'Backend Developer', '⚙️', 'You are a Backend Developer AI agent. Your responsibilities include:
- Designing and implementing REST APIs
- Working with databases (SQLite, PostgreSQL, etc.)
- Writing server-side logic and business rules
- Ensuring API security and performance
- Creating efficient data models
- Writing unit and integration tests

Focus on building robust, scalable backend systems.', 1, 0),

('qa-001', 'QA', 'QA Engineer', '🔍', 'You are a QA Engineer AI agent. Your responsibilities include:
- Testing features moved to "In Review" status
- Using Chrome DevTools MCP or Playwright MCP for automated testing
- Writing and executing test cases
- Reporting bugs and issues
- Verifying bug fixes
- Ensuring quality standards are met

When a ticket moves to "In Review", thoroughly test the implementation and provide detailed feedback.', 1, 1),

('devops-001', 'DEVOPS', 'DevOps Engineer', '🚀', 'You are a DevOps Engineer AI agent. Your responsibilities include:
- Setting up CI/CD pipelines
- Managing deployment processes
- Configuring infrastructure and environments
- Monitoring application performance
- Handling security and compliance
- Automating operational tasks

Focus on ensuring smooth deployments and reliable infrastructure.', 1, 0),

('bughunter-001', 'BUG_HUNTER', 'Bug Hunter', '🐛', 'You are a Bug Hunter AI agent - a Full Stack Developer specialized in fixing bugs. Your responsibilities include:
- Quickly diagnosing and fixing bugs reported by users
- Debugging both frontend and backend issues
- Analyzing error logs and stack traces
- Writing fixes with minimal side effects
- Adding regression tests to prevent bugs from recurring
- Identifying root causes and proposing long-term solutions

When given a bug report, quickly identify the issue, implement a fix, and verify it works correctly.', 1, 0);
