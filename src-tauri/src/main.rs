#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState {
  db_path: PathBuf,
  jobs: Arc<Mutex<HashMap<String, RunningJobState>>>,
}

#[derive(Serialize, Clone)]
struct Member {
  id: String,
  role: String,
  name: String,
  avatar: Option<String>,
  profile_image: Option<String>,
  system_prompt: String,
  is_default: i64,
  can_generate_images: i64,
  can_log_screenshots: i64,
}

#[derive(Serialize)]
struct Ticket {
  id: String,
  title: String,
  description: Option<String>,
  status: String,
  priority: String,
  assignee_id: Option<String>,
  project_id: Option<String>,
}

#[derive(Serialize)]
struct BoardData {
  members: Vec<Member>,
  tickets: Vec<Ticket>,
}

#[derive(Serialize, Clone)]
struct Conversation {
  id: String,
  ticket_id: String,
  agent_id: String,
  provider: String,
  prompt: Option<String>,
  feedback: Option<String>,
  status: String,
  git_commit_hash: Option<String>,
  started_at: String,
  completed_at: Option<String>,
  created_at: String,
  agent: Option<Member>,
}

#[derive(Serialize, Clone)]
struct ConversationMessage {
  id: String,
  conversation_id: String,
  content: String,
  message_type: String,
  created_at: String,
}

#[derive(Serialize, Clone)]
struct RunningJob {
  id: String,
  conversation_id: String,
  ticket_id: String,
  agent_id: String,
  agent_name: String,
  provider: String,
  status: String,
  output: String,
  started_at: String,
}

struct RunningJobState {
  job: RunningJob,
  child: Option<std::process::Child>,
}

#[derive(Serialize)]
struct Project {
  id: String,
  name: String,
  path: String,
  description: Option<String>,
  is_active: i64,
}

#[derive(Deserialize)]
struct CreateTicketInput {
  title: String,
  description: Option<String>,
  priority: Option<String>,
  #[serde(alias = "assigneeId")]
  assignee_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateTicketInput {
  id: String,
  title: String,
  description: Option<String>,
  status: String,
  priority: String,
  assignee_id: Option<String>,
}

#[derive(Deserialize)]
struct CreateMemberInput {
  role: String,
  name: String,
  avatar: Option<String>,
  profile_image: Option<String>,
  system_prompt: String,
  can_generate_images: i64,
  can_log_screenshots: i64,
}

#[derive(Deserialize)]
struct UpdateMemberInput {
  id: String,
  role: String,
  name: String,
  avatar: Option<String>,
  profile_image: Option<String>,
  system_prompt: String,
  can_generate_images: i64,
  can_log_screenshots: i64,
}

#[derive(Deserialize)]
struct CreateEmptyProjectInput {
  name: String,
  parent_path: Option<String>,
}

#[derive(Deserialize)]
struct ExecuteAgentInput {
  ticket_id: String,
  title: String,
  description: Option<String>,
  provider: String,
  feedback: Option<String>,
  project_id: Option<String>,
}

#[derive(Serialize)]
struct ExecuteAgentResult {
  success: bool,
  output: String,
}

#[derive(Deserialize)]
struct StartAgentJobInput {
  ticket_id: String,
  feedback: Option<String>,
  provider: Option<String>,
}

#[derive(Serialize)]
struct StartAgentJobResult {
  success: bool,
  job_id: String,
  conversation_id: String,
  ticket_status: String,
}

#[derive(Serialize)]
struct AgentStatusResponse {
  jobs: Vec<RunningJob>,
  job: Option<RunningJob>,
  output: Option<String>,
}

#[derive(Serialize)]
struct ConversationListResponse {
  conversations: Vec<Conversation>,
}

#[derive(Serialize)]
struct ConversationDetailResponse {
  conversation: Conversation,
  messages: Vec<ConversationMessage>,
}

fn init_db(db_path: &Path) -> Result<(), String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }

  let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
  conn
    .pragma_update(None, "journal_mode", &"WAL")
    .map_err(|err| err.to_string())?;
  conn
    .pragma_update(None, "busy_timeout", &5000)
    .map_err(|err| err.to_string())?;
  conn
    .execute_batch(include_str!("../schema.sql"))
    .map_err(|err| err.to_string())?;
  Ok(())
}

fn insert_conversation_message(
  db_path: &Path,
  conversation_id: &str,
  content: &str,
  message_type: &str,
) {
  let mut attempts = 0;
  loop {
    attempts += 1;
    let result = Connection::open(db_path).and_then(|conn| {
      let _ = conn.pragma_update(None, "busy_timeout", &5000);
      conn.execute(
        "INSERT INTO conversation_messages (id, conversation_id, content, message_type) VALUES (?1, ?2, ?3, ?4)",
        (
          format!("msg-{}", Uuid::new_v4()),
          conversation_id,
          content,
          message_type,
        ),
      )
    });

    if result.is_ok() || attempts >= 5 {
      break;
    }
    std::thread::sleep(Duration::from_millis(200));
  }
}

fn build_agent_prompt(
  ticket: &Ticket,
  agent: &Member,
  project: &Project,
  feedback: Option<&str>,
) -> String {
  let is_qa = agent.role == "QA";
  let qa_instruction = if is_qa {
    "\nIMPORTANT:\n1. PORT CONFIGURATION: When running tests or starting servers for the TARGET PROJECT, you MUST use port 3001 (or any port other than 1234) to avoid conflict with this dashboard app. Use \"PORT=3001 npm run dev\" or equivalent.\n2. TOOL USAGE: You MUST use the Playwright MCP tools for automated testing. Do NOT rely solely on manual terminal commands."
  } else {
    ""
  };

  let image_generation_instruction = if agent.can_generate_images == 1 {
    format!(
      "\n\nIMAGE GENERATION (if configured in Settings):\nIf you need images for your implementation (backgrounds, icons, illustrations, etc.), you can generate them using the Image Generation API:\n- Endpoint: POST http://localhost:1234/api/image/generate\n- Body: {{ \"prompt\": \"detailed image description\", \"width\": 1024, \"height\": 1024, \"projectPath\": \"{}\" }}\n- NOTE: The server will use the provider configured in the app settings. No manual configuration needed.\n- Generated images will be saved to {}/public/generated/\n- Use descriptive prompts for best results (style, colors, composition)\n- Supported sizes: any width/height, defaults to 1024x1024\n- If you get an error about settings not configured, skip image generation",
      project.path, project.path
    )
  } else {
    String::new()
  };

  let screenshot_instruction = if agent.can_log_screenshots == 1 {
    "\n\nSCREENSHOT REQUIREMENT:\nIf you make any UI/visual changes, you MUST take screenshots to document your work:\n1. Start the dev server with PORT=3001 (e.g., \"PORT=3001 npm run dev\")\n2. Use browser automation tools to capture screenshots\n3. Save screenshots to the \".agent-screenshots/\" folder in the project root\n4. Name files descriptively (e.g., \"feature-result.png\", \"bug-fix-result.png\")\n5. Include multiple screenshots if you changed multiple pages/components\nThis is MANDATORY for visual changes so other agents can reference your work."
      .to_string()
  } else {
    String::new()
  };

  let feedback_section = feedback
    .map(|text| format!("\n\nIMPORTANT FEEDBACK FROM USER:\n{}\n\nPlease address this feedback specifically in your implementation.", text))
    .unwrap_or_default();

  format!(
    "You are acting as {} ({}) for the project \"{}\".\n\n{}\n\n---\n\nTASK TO COMPLETE:\nTitle: {}\n{}\n{}\n\n---\n\nINSTRUCTIONS:\n1. Analyze the task requirements carefully\n2. Make the necessary code changes to complete this task\n3. Focus only on what's needed for this specific task\n4. Write clean, well-documented code\n5. After completing, provide a brief summary of changes made\n6. COMMIT REQUIREMENT (MANDATORY): If you made any code or file changes, you MUST create a git commit before finishing. Do not skip this step unless there are truly no changes to commit.\n7. CRITICAL: You are working on the external project \"{}\". When starting its server, ALWAYS use port 3001 (e.g. \"PORT=3001 npm run dev\"). NEVER use port 1234.{}{}{}\n\nPlease complete this task now.",
    agent.name,
    agent.role,
    project.name,
    agent.system_prompt,
    ticket.title,
    ticket
      .description
      .as_deref()
      .map(|text| format!("Description: {}", text))
      .unwrap_or_default(),
    feedback_section,
    project.name,
    qa_instruction,
    image_generation_instruction,
    screenshot_instruction
  )
}

fn expand_path(input: &str) -> Result<PathBuf, String> {
  if let Some(stripped) = input.strip_prefix("~/") {
    let home = std::env::var("HOME").map_err(|err| err.to_string())?;
    return Ok(PathBuf::from(home).join(stripped));
  }
  Ok(PathBuf::from(input))
}

fn get_project_by_id(conn: &Connection, id: &str) -> Result<Option<Project>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, path, description, is_active FROM projects WHERE id = ?1",
    )
    .map_err(|err| err.to_string())?;
  let mut rows = stmt.query([id]).map_err(|err| err.to_string())?;
  if let Some(row) = rows.next().map_err(|err| err.to_string())? {
    return Ok(Some(Project {
      id: row.get(0).map_err(|err| err.to_string())?,
      name: row.get(1).map_err(|err| err.to_string())?,
      path: row.get(2).map_err(|err| err.to_string())?,
      description: row.get(3).map_err(|err| err.to_string())?,
      is_active: row.get(4).map_err(|err| err.to_string())?,
    }));
  }
  Ok(None)
}

fn get_active_project(conn: &Connection) -> Result<Option<Project>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, path, description, is_active FROM projects WHERE is_active = 1 LIMIT 1",
    )
    .map_err(|err| err.to_string())?;
  let mut rows = stmt.query([]).map_err(|err| err.to_string())?;
  if let Some(row) = rows.next().map_err(|err| err.to_string())? {
    return Ok(Some(Project {
      id: row.get(0).map_err(|err| err.to_string())?,
      name: row.get(1).map_err(|err| err.to_string())?,
      path: row.get(2).map_err(|err| err.to_string())?,
      description: row.get(3).map_err(|err| err.to_string())?,
      is_active: row.get(4).map_err(|err| err.to_string())?,
    }));
  }
  Ok(None)
}

fn get_member_by_id(conn: &Connection, id: &str) -> Result<Option<Member>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, role, name, avatar, profile_image, system_prompt, is_default, can_generate_images, can_log_screenshots FROM members WHERE id = ?1",
    )
    .map_err(|err| err.to_string())?;
  let mut rows = stmt.query([id]).map_err(|err| err.to_string())?;
  if let Some(row) = rows.next().map_err(|err| err.to_string())? {
    return Ok(Some(Member {
      id: row.get(0).map_err(|err| err.to_string())?,
      role: row.get(1).map_err(|err| err.to_string())?,
      name: row.get(2).map_err(|err| err.to_string())?,
      avatar: row.get(3).map_err(|err| err.to_string())?,
      profile_image: row.get(4).map_err(|err| err.to_string())?,
      system_prompt: row.get(5).map_err(|err| err.to_string())?,
      is_default: row.get(6).map_err(|err| err.to_string())?,
      can_generate_images: row.get(7).map_err(|err| err.to_string())?,
      can_log_screenshots: row.get(8).map_err(|err| err.to_string())?,
    }));
  }
  Ok(None)
}

fn get_ticket_by_id(conn: &Connection, id: &str) -> Result<Option<Ticket>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, title, description, status, priority, assignee_id, project_id FROM tickets WHERE id = ?1",
    )
    .map_err(|err| err.to_string())?;
  let mut rows = stmt.query([id]).map_err(|err| err.to_string())?;
  if let Some(row) = rows.next().map_err(|err| err.to_string())? {
    return Ok(Some(Ticket {
      id: row.get(0).map_err(|err| err.to_string())?,
      title: row.get(1).map_err(|err| err.to_string())?,
      description: row.get(2).map_err(|err| err.to_string())?,
      status: row.get(3).map_err(|err| err.to_string())?,
      priority: row.get(4).map_err(|err| err.to_string())?,
      assignee_id: row.get(5).map_err(|err| err.to_string())?,
      project_id: row.get(6).map_err(|err| err.to_string())?,
    }));
  }
  Ok(None)
}

fn get_conversation_by_id(conn: &Connection, id: &str) -> Result<Option<Conversation>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT c.id, c.ticket_id, c.agent_id, c.provider, c.prompt, c.feedback, c.status, c.git_commit_hash, c.started_at, c.completed_at, c.created_at, m.id, m.role, m.name, m.avatar, m.profile_image, m.system_prompt, m.is_default, m.can_generate_images, m.can_log_screenshots FROM conversations c LEFT JOIN members m ON c.agent_id = m.id WHERE c.id = ?1",
    )
    .map_err(|err| err.to_string())?;
  let mut rows = stmt.query([id]).map_err(|err| err.to_string())?;
  if let Some(row) = rows.next().map_err(|err| err.to_string())? {
    let agent_id: Option<String> = row.get(11).map_err(|err| err.to_string())?;
    let agent = if agent_id.is_some() {
      Some(Member {
        id: row.get(11).map_err(|err| err.to_string())?,
        role: row.get(12).map_err(|err| err.to_string())?,
        name: row.get(13).map_err(|err| err.to_string())?,
        avatar: row.get(14).map_err(|err| err.to_string())?,
        profile_image: row.get(15).map_err(|err| err.to_string())?,
        system_prompt: row.get(16).map_err(|err| err.to_string())?,
        is_default: row.get(17).map_err(|err| err.to_string())?,
        can_generate_images: row.get(18).map_err(|err| err.to_string())?,
        can_log_screenshots: row.get(19).map_err(|err| err.to_string())?,
      })
    } else {
      None
    };
    return Ok(Some(Conversation {
      id: row.get(0).map_err(|err| err.to_string())?,
      ticket_id: row.get(1).map_err(|err| err.to_string())?,
      agent_id: row.get(2).map_err(|err| err.to_string())?,
      provider: row.get(3).map_err(|err| err.to_string())?,
      prompt: row.get(4).map_err(|err| err.to_string())?,
      feedback: row.get(5).map_err(|err| err.to_string())?,
      status: row.get(6).map_err(|err| err.to_string())?,
      git_commit_hash: row.get(7).map_err(|err| err.to_string())?,
      started_at: row.get(8).map_err(|err| err.to_string())?,
      completed_at: row.get(9).map_err(|err| err.to_string())?,
      created_at: row.get(10).map_err(|err| err.to_string())?,
      agent,
    }));
  }
  Ok(None)
}

fn list_conversations_by_ticket(conn: &Connection, ticket_id: &str) -> Result<Vec<Conversation>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT c.id, c.ticket_id, c.agent_id, c.provider, c.prompt, c.feedback, c.status, c.git_commit_hash, c.started_at, c.completed_at, c.created_at, m.id, m.role, m.name, m.avatar, m.profile_image, m.system_prompt, m.is_default, m.can_generate_images, m.can_log_screenshots FROM conversations c LEFT JOIN members m ON c.agent_id = m.id WHERE c.ticket_id = ?1 ORDER BY c.started_at DESC",
    )
    .map_err(|err| err.to_string())?;
  let conversations = stmt
    .query_map([ticket_id], |row| {
      let agent_id: Option<String> = row.get(11)?;
      let agent = if agent_id.is_some() {
        Some(Member {
          id: row.get(11)?,
          role: row.get(12)?,
          name: row.get(13)?,
          avatar: row.get(14)?,
          profile_image: row.get(15)?,
          system_prompt: row.get(16)?,
          is_default: row.get(17)?,
          can_generate_images: row.get(18)?,
          can_log_screenshots: row.get(19)?,
        })
      } else {
        None
      };
      Ok(Conversation {
        id: row.get(0)?,
        ticket_id: row.get(1)?,
        agent_id: row.get(2)?,
        provider: row.get(3)?,
        prompt: row.get(4)?,
        feedback: row.get(5)?,
        status: row.get(6)?,
        git_commit_hash: row.get(7)?,
        started_at: row.get(8)?,
        completed_at: row.get(9)?,
        created_at: row.get(10)?,
        agent,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<Conversation>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;
  Ok(conversations)
}

fn list_messages_by_conversation(conn: &Connection, conversation_id: &str) -> Result<Vec<ConversationMessage>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, conversation_id, content, message_type, created_at FROM conversation_messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
    )
    .map_err(|err| err.to_string())?;
  let messages = stmt
    .query_map([conversation_id], |row| {
      Ok(ConversationMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        content: row.get(2)?,
        message_type: row.get(3)?,
        created_at: row.get(4)?,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<ConversationMessage>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;
  Ok(messages)
}

#[tauri::command]
fn get_board_data(state: State<AppState>) -> Result<BoardData, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  let active_project = get_active_project(&conn)?;

  let mut member_stmt = conn
    .prepare(
      "SELECT id, role, name, avatar, profile_image, system_prompt, is_default, can_generate_images, can_log_screenshots FROM members ORDER BY is_default DESC, name ASC",
    )
    .map_err(|err| err.to_string())?;
  let members = member_stmt
    .query_map([], |row| {
      Ok(Member {
        id: row.get(0)?,
        role: row.get(1)?,
        name: row.get(2)?,
        avatar: row.get(3)?,
        profile_image: row.get(4)?,
        system_prompt: row.get(5)?,
        is_default: row.get(6)?,
        can_generate_images: row.get(7)?,
        can_log_screenshots: row.get(8)?,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<Member>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;

  let mut ticket_stmt = conn
    .prepare(
      "SELECT id, title, description, status, priority, assignee_id, project_id FROM tickets WHERE project_id = ?1 ORDER BY updated_at DESC",
    )
    .map_err(|err| err.to_string())?;
  let tickets = match active_project {
    Some(project) => ticket_stmt
      .query_map([project.id], |row| {
        Ok(Ticket {
          id: row.get(0)?,
          title: row.get(1)?,
          description: row.get(2)?,
          status: row.get(3)?,
          priority: row.get(4)?,
          assignee_id: row.get(5)?,
          project_id: row.get(6)?,
        })
      })
      .map_err(|err| err.to_string())?
      .collect::<Result<Vec<Ticket>, rusqlite::Error>>()
      .map_err(|err| err.to_string())?,
    None => Vec::new(),
  };

  Ok(BoardData { members, tickets })
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let mut stmt = conn
    .prepare("SELECT id, name, path, description, is_active FROM projects ORDER BY is_active DESC, name ASC")
    .map_err(|err| err.to_string())?;
  let projects = stmt
    .query_map([], |row| {
      Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        description: row.get(3)?,
        is_active: row.get(4)?,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<Project>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;
  Ok(projects)
}

#[tauri::command]
fn create_empty_project(
  state: State<AppState>,
  input: CreateEmptyProjectInput,
) -> Result<Project, String> {
  let parent = if let Some(parent_path) = input.parent_path.as_deref() {
    expand_path(parent_path)?
  } else {
    expand_path("~/Projects")?
  };

  let project_path = parent.join(&input.name);
  std::fs::create_dir_all(&project_path).map_err(|err| err.to_string())?;

  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let id = format!("prj-{}", Uuid::new_v4());

  conn
    .execute("UPDATE projects SET is_active = 0", [])
    .map_err(|err| err.to_string())?;

  conn
    .execute(
      "INSERT INTO projects (id, name, path, description, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
      (&id, &input.name, project_path.to_string_lossy().to_string(), Option::<String>::None),
    )
    .map_err(|err| err.to_string())?;

  Ok(Project {
    id,
    name: input.name,
    path: project_path.to_string_lossy().to_string(),
    description: None,
    is_active: 1,
  })
}

#[tauri::command]
fn set_active_project(state: State<AppState>, id: String) -> Result<(), String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  conn
    .execute("UPDATE projects SET is_active = 0", [])
    .map_err(|err| err.to_string())?;
  conn
    .execute(
      "UPDATE projects SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      [id],
    )
    .map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
fn delete_project(state: State<AppState>, id: String) -> Result<(), String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  conn
    .execute("DELETE FROM projects WHERE id = ?1", [id])
    .map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
async fn execute_agent(
  state: State<'_, AppState>,
  input: ExecuteAgentInput,
) -> Result<ExecuteAgentResult, String> {
  let _ = &input.ticket_id;
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let project = if let Some(project_id) = input.project_id.as_deref() {
    get_project_by_id(&conn, project_id)?
  } else {
    get_active_project(&conn)?
  };

  let project = project.ok_or("No active project selected")?;
  let prompt = format!(
    "You are working on the project \"{}\" at path \"{}\".\n\nTASK:\nTitle: {}\n{}\n{}\nPlease complete the task.",
    project.name,
    project.path,
    input.title,
    input
      .description
      .as_deref()
      .map(|text| format!("Description: {}", text))
      .unwrap_or_default(),
    input
      .feedback
      .as_deref()
      .map(|text| format!("Feedback: {}", text))
      .unwrap_or_default()
  );

  let provider = input.provider.to_lowercase();
  let (exec, args) = if provider == "opencode" {
    ("opencode", vec!["run".to_string(), prompt])
  } else {
    ("claude", vec!["--print".to_string(), "--dangerously-skip-permissions".to_string(), prompt])
  };

  let output = tauri::async_runtime::spawn_blocking(move || {
    let result = Command::new(exec)
      .args(args)
      .current_dir(&project.path)
      .env("PORT", "3001")
      .output();

    match result {
      Ok(result) => {
        let mut output = String::from_utf8_lossy(&result.stdout).to_string();
        let stderr = String::from_utf8_lossy(&result.stderr).to_string();
        if !stderr.trim().is_empty() {
          output.push_str("\n[stderr]\n");
          output.push_str(&stderr);
        }
        if result.status.success() {
          Ok(output)
        } else {
          Err(output)
        }
      }
      Err(err) => Err(err.to_string()),
    }
  })
  .await
  .map_err(|err| err.to_string())??;

  Ok(ExecuteAgentResult {
    success: true,
    output,
  })
}

#[tauri::command]
async fn start_agent_job(
  state: State<'_, AppState>,
  input: StartAgentJobInput,
) -> Result<StartAgentJobResult, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  let ticket = get_ticket_by_id(&conn, &input.ticket_id)?
    .ok_or("Ticket not found")?;
  let assignee_id = ticket
    .assignee_id
    .clone()
    .ok_or("Ticket has no assignee")?;
  let agent = get_member_by_id(&conn, &assignee_id)?
    .ok_or("Agent not found")?;
  let project = get_active_project(&conn)?.ok_or("No active project selected")?;

  let provider = input
    .provider
    .unwrap_or_else(|| "claude".to_string());
  let prompt = build_agent_prompt(&ticket, &agent, &project, input.feedback.as_deref());

  let conversation_id = format!("conv-{}", Uuid::new_v4());
  conn
    .execute(
      "INSERT INTO conversations (id, ticket_id, agent_id, provider, prompt, feedback, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'running')",
      (
        &conversation_id,
        &ticket.id,
        &agent.id,
        &provider,
        &prompt,
        &input.feedback,
      ),
    )
    .map_err(|err| err.to_string())?;

  conn
    .execute(
      "INSERT INTO conversation_messages (id, conversation_id, content, message_type) VALUES (?1, ?2, ?3, 'system')",
      (
        format!("msg-{}", Uuid::new_v4()),
        &conversation_id,
        "⏳ Agent execution started",
      ),
    )
    .map_err(|err| err.to_string())?;

  conn
    .execute(
      "UPDATE tickets SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      [&ticket.id],
    )
    .map_err(|err| err.to_string())?;

  let job_id = format!("job-{}", Uuid::new_v4());
  let started_at = chrono::Utc::now().to_rfc3339();
  let job = RunningJob {
    id: job_id.clone(),
    conversation_id: conversation_id.clone(),
    ticket_id: ticket.id.clone(),
    agent_id: agent.id.clone(),
    agent_name: agent.name.clone(),
    provider: provider.clone(),
    status: "running".to_string(),
    output: String::new(),
    started_at,
  };

  let (exec, args, use_stdin) = match provider.as_str() {
    "opencode" => ("opencode", vec!["run".to_string(), "-".to_string()], true),
    "codex" => (
      "codex",
      vec![
        "exec".to_string(),
        "--dangerously-bypass-approvals-and-sandbox".to_string(),
        "-".to_string(),
      ],
      true,
    ),
    _ => (
      "claude",
      vec![
        "--print".to_string(),
        "--dangerously-skip-permissions".to_string(),
        "--output-format=stream-json".to_string(),
        "--include-partial-messages".to_string(),
        "--verbose".to_string(),
      ],
      true,
    ),
  };

  let mut child = Command::new(exec)
  .current_dir(&project.path)
  .env("PORT", "3001")
  .args(args)
  .stdin(std::process::Stdio::piped())
  .stdout(std::process::Stdio::piped())
  .stderr(std::process::Stdio::piped())
  .spawn()
  .map_err(|err| err.to_string())?;

  if use_stdin {
    if let Some(mut stdin) = child.stdin.take() {
      use std::io::Write;
      stdin.write_all(prompt.as_bytes()).map_err(|err| err.to_string())?;
      stdin.write_all(b"\n").map_err(|err| err.to_string())?;
    }
  }

  let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
  let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
  let db_path_stdout = state.db_path.clone();
  let db_path_stderr = state.db_path.clone();
  let job_id_stdout = job_id.clone();
  let job_id_stderr = job_id.clone();
  let conversation_id_stdout = conversation_id.clone();
  let conversation_id_stderr = conversation_id.clone();
  let jobs_stdout = state.jobs.clone();
  let jobs_stderr = state.jobs.clone();

  std::thread::spawn(move || {
    let mut reader = stdout;
    let mut buffer = [0u8; 4096];
    loop {
      match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(count) => {
          let content = String::from_utf8_lossy(&buffer[..count]).to_string();
          insert_conversation_message(
            &db_path_stdout,
            &conversation_id_stdout,
            &content,
            "log",
          );
          if let Ok(mut jobs) = jobs_stdout.lock() {
            if let Some(job_state) = jobs.get_mut(&job_id_stdout) {
              job_state.job.output.push_str(&content);
            }
          }
        }
        Err(_) => break,
      }
    }
  });

  std::thread::spawn(move || {
    let mut reader = stderr;
    let mut buffer = [0u8; 4096];
    loop {
      match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(count) => {
          let content = String::from_utf8_lossy(&buffer[..count]).to_string();
          insert_conversation_message(
            &db_path_stderr,
            &conversation_id_stderr,
            &content,
            "error",
          );
          if let Ok(mut jobs) = jobs_stderr.lock() {
            if let Some(job_state) = jobs.get_mut(&job_id_stderr) {
              job_state.job.output.push_str(&content);
            }
          }
        }
        Err(_) => break,
      }
    }
  });

  {
    let mut jobs = state.jobs.lock().map_err(|_| "Failed to lock jobs")?;
    jobs.insert(
      job_id.clone(),
      RunningJobState {
        job: job.clone(),
        child: Some(child),
      },
    );
  }

  let db_path = state.db_path.clone();
  let jobs = state.jobs.clone();
  let job_id_clone = job_id.clone();
  let conversation_id_clone = conversation_id.clone();
  let ticket_id_clone = ticket.id.clone();
  tauri::async_runtime::spawn_blocking(move || {
    let status_result = loop {
      let mut jobs_guard = jobs.lock().map_err(|_| "Failed to lock jobs")?;
      let job_state = jobs_guard.get_mut(&job_id_clone).ok_or("Job not found")?;
      let child = job_state.child.as_mut().ok_or("Process already completed")?;
      match child.try_wait().map_err(|err| err.to_string())? {
        Some(status) => break Ok::<_, String>(status.success()),
        None => {}
      }
      drop(jobs_guard);
      std::thread::sleep(Duration::from_millis(500));
    };

    let success = status_result.unwrap_or(false);
    let status = if success { "completed" } else { "failed" }.to_string();

    {
      let mut jobs_guard = jobs.lock().map_err(|_| "Failed to lock jobs")?;
      if let Some(job_state) = jobs_guard.get_mut(&job_id_clone) {
        job_state.job.status = status.clone();
      }
    }

    let conn = Connection::open(&db_path).map_err(|err| err.to_string())?;
    let completed_at = chrono::Utc::now().to_rfc3339();

    conn
      .execute(
        "UPDATE conversations SET status = ?1, completed_at = ?2 WHERE id = ?3",
        (&status, &completed_at, &conversation_id_clone),
      )
      .map_err(|err| err.to_string())?;

    let message_type = if status == "completed" { "success" } else { "error" };
    let completion_message = if status == "completed" {
      "✅ Task completed successfully"
    } else {
      "❌ Task failed"
    };

    conn
      .execute(
        "INSERT INTO conversation_messages (id, conversation_id, content, message_type) VALUES (?1, ?2, ?3, ?4)",
        (
          format!("msg-{}", Uuid::new_v4()),
          &conversation_id_clone,
          completion_message,
          message_type,
        ),
      )
      .map_err(|err| err.to_string())?;

    if status == "completed" {
      conn
        .execute(
          "UPDATE tickets SET status = 'IN_REVIEW', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
          [&ticket_id_clone],
        )
        .map_err(|err| err.to_string())?;
    }

    let jobs_cleanup = jobs.clone();
    let job_id_cleanup = job_id_clone.clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_secs(60));
      if let Ok(mut jobs_guard) = jobs_cleanup.lock() {
        jobs_guard.remove(&job_id_cleanup);
      }
    });

    Ok::<(), String>(())
  });

  Ok(StartAgentJobResult {
    success: true,
    job_id,
    conversation_id,
    ticket_status: "IN_PROGRESS".to_string(),
  })
}

#[tauri::command]
fn get_agent_status(
  state: State<AppState>,
  ticket_id: Option<String>,
  job_id: Option<String>,
) -> Result<AgentStatusResponse, String> {
  let jobs = state.jobs.lock().map_err(|_| "Failed to lock jobs")?;
  let list: Vec<RunningJob> = jobs.values().map(|state| state.job.clone()).collect();
  let job = if let Some(id) = job_id {
    jobs.get(&id).map(|state| state.job.clone())
  } else if let Some(ticket) = ticket_id {
    jobs
      .values()
      .find(|state| state.job.ticket_id == ticket)
      .map(|state| state.job.clone())
  } else {
    None
  };
  let output = job.as_ref().map(|item| item.output.clone());
  Ok(AgentStatusResponse {
    jobs: list,
    job,
    output,
  })
}

#[tauri::command]
fn cancel_agent_job(state: State<AppState>, job_id: String) -> Result<bool, String> {
  let mut jobs = state.jobs.lock().map_err(|_| "Failed to lock jobs")?;
  let job_state = match jobs.get_mut(&job_id) {
    Some(job) => job,
    None => return Ok(false),
  };

  if job_state.job.status != "running" {
    return Ok(false);
  }

  if let Some(child) = job_state.child.as_mut() {
    let _ = child.kill();
  }
  job_state.job.status = "cancelled".to_string();
  job_state.job.output.push_str("\n[cancelled] Job was cancelled by user");

  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  conn
    .execute(
      "UPDATE conversations SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
      [&job_state.job.conversation_id],
    )
    .map_err(|err| err.to_string())?;
  conn
    .execute(
      "INSERT INTO conversation_messages (id, conversation_id, content, message_type) VALUES (?1, ?2, ?3, 'system')",
      (
        format!("msg-{}", Uuid::new_v4()),
        &job_state.job.conversation_id,
        "⏹ Job was cancelled by user",
      ),
    )
    .map_err(|err| err.to_string())?;

  let jobs_cleanup = state.jobs.clone();
  let job_id_cleanup = job_id.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_secs(60));
    if let Ok(mut jobs_guard) = jobs_cleanup.lock() {
      jobs_guard.remove(&job_id_cleanup);
    }
  });

  Ok(true)
}

#[tauri::command]
fn list_conversations(state: State<AppState>, ticket_id: String) -> Result<ConversationListResponse, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let conversations = list_conversations_by_ticket(&conn, &ticket_id)?;
  Ok(ConversationListResponse { conversations })
}

#[tauri::command]
fn get_conversation(state: State<AppState>, id: String) -> Result<ConversationDetailResponse, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let conversation = get_conversation_by_id(&conn, &id)?
    .ok_or("Conversation not found")?;
  let messages = list_messages_by_conversation(&conn, &id)?;
  Ok(ConversationDetailResponse {
    conversation,
    messages,
  })
}

#[tauri::command]
fn create_ticket(
  state: State<AppState>,
  input: CreateTicketInput,
) -> Result<Ticket, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let active_project = get_active_project(&conn)?;
  let project_id = match active_project {
    Some(project) => Some(project.id),
    None => return Err("No active project selected".to_string()),
  };

  let id = format!("tck-{}", Uuid::new_v4());
  let status = "TODO".to_string();
  let priority = input.priority.unwrap_or_else(|| "MEDIUM".to_string());

  conn
    .execute(
      "INSERT INTO tickets (id, title, description, status, priority, assignee_id, project_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      (
        &id,
        &input.title,
        &input.description,
        &status,
        &priority,
        &input.assignee_id,
        &project_id,
      ),
    )
    .map_err(|err| err.to_string())?;

  Ok(Ticket {
    id,
    title: input.title,
    description: input.description,
    status,
    priority,
    assignee_id: input.assignee_id,
    project_id,
  })
}

#[tauri::command]
fn update_ticket(state: State<AppState>, input: UpdateTicketInput) -> Result<Ticket, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  conn
    .execute(
      "UPDATE tickets SET title = ?1, description = ?2, status = ?3, priority = ?4, assignee_id = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
      (
        &input.title,
        &input.description,
        &input.status,
        &input.priority,
        &input.assignee_id,
        &input.id,
      ),
    )
    .map_err(|err| err.to_string())?;

  match get_ticket_by_id(&conn, &input.id)? {
    Some(ticket) => Ok(ticket),
    None => Err("Ticket not found".to_string()),
  }
}

#[tauri::command]
fn delete_ticket(state: State<AppState>, id: String) -> Result<(), String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  conn
    .execute("DELETE FROM tickets WHERE id = ?1", [&id])
    .map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
fn create_member(state: State<AppState>, input: CreateMemberInput) -> Result<Member, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  let id = format!("mem-{}", Uuid::new_v4());

  conn
    .execute(
      "INSERT INTO members (id, role, name, avatar, profile_image, system_prompt, is_default, can_generate_images, can_log_screenshots) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)",
      (
        &id,
        &input.role,
        &input.name,
        &input.avatar,
        &input.profile_image,
        &input.system_prompt,
        &input.can_generate_images,
        &input.can_log_screenshots,
      ),
    )
    .map_err(|err| err.to_string())?;

  match get_member_by_id(&conn, &id)? {
    Some(member) => Ok(member),
    None => Err("Member not found after insert".to_string()),
  }
}

#[tauri::command]
fn update_member(state: State<AppState>, input: UpdateMemberInput) -> Result<Member, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  conn
    .execute(
      "UPDATE members SET role = ?1, name = ?2, avatar = ?3, profile_image = ?4, system_prompt = ?5, can_generate_images = ?6, can_log_screenshots = ?7, updated_at = CURRENT_TIMESTAMP WHERE id = ?8",
      (
        &input.role,
        &input.name,
        &input.avatar,
        &input.profile_image,
        &input.system_prompt,
        &input.can_generate_images,
        &input.can_log_screenshots,
        &input.id,
      ),
    )
    .map_err(|err| err.to_string())?;

  match get_member_by_id(&conn, &input.id)? {
    Some(member) => Ok(member),
    None => Err("Member not found".to_string()),
  }
}

#[tauri::command]
fn delete_member(state: State<AppState>, id: String) -> Result<(), String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;
  conn
    .execute(
      "UPDATE tickets SET assignee_id = NULL WHERE assignee_id = ?1",
      [&id],
    )
    .map_err(|err| err.to_string())?;
  conn
    .execute("DELETE FROM members WHERE id = ?1", [&id])
    .map_err(|err| err.to_string())?;
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?;
      let db_path = app_data_dir.join("olly-molly.db");
      init_db(&db_path)?;
      app.manage(AppState {
        db_path,
        jobs: Arc::new(Mutex::new(HashMap::new())),
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_board_data,
      create_ticket,
      update_ticket,
      delete_ticket,
      create_member,
      update_member,
      delete_member,
      start_agent_job,
      get_agent_status,
      cancel_agent_job,
      list_conversations,
      get_conversation,
      list_projects,
      create_empty_project,
      set_active_project,
      delete_project,
      execute_agent
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
