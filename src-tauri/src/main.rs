#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Manager, State};
use uuid::Uuid;

#[derive(Debug)]
struct AppState {
  db_path: PathBuf,
}

#[derive(Serialize)]
struct Member {
  id: String,
  role: String,
  name: String,
  avatar: Option<String>,
}

#[derive(Serialize)]
struct Ticket {
  id: String,
  title: String,
  description: Option<String>,
  status: String,
  priority: String,
  assignee_id: Option<String>,
}

#[derive(Serialize)]
struct BoardData {
  members: Vec<Member>,
  tickets: Vec<Ticket>,
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

fn init_db(db_path: &Path) -> Result<(), String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }

  let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
  conn
    .execute_batch(include_str!("../schema.sql"))
    .map_err(|err| err.to_string())?;
  Ok(())
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

#[tauri::command]
fn get_board_data(state: State<AppState>) -> Result<BoardData, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  let mut member_stmt =
    conn
      .prepare("SELECT id, role, name, avatar FROM members ORDER BY is_default DESC, name ASC")
      .map_err(|err| err.to_string())?;
  let members = member_stmt
    .query_map([], |row| {
      Ok(Member {
        id: row.get(0)?,
        role: row.get(1)?,
        name: row.get(2)?,
        avatar: row.get(3)?,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<Member>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;

  let mut ticket_stmt = conn
    .prepare(
      "SELECT id, title, description, status, priority, assignee_id FROM tickets ORDER BY updated_at DESC",
    )
    .map_err(|err| err.to_string())?;
  let tickets = ticket_stmt
    .query_map([], |row| {
      Ok(Ticket {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        priority: row.get(4)?,
        assignee_id: row.get(5)?,
      })
    })
    .map_err(|err| err.to_string())?
    .collect::<Result<Vec<Ticket>, rusqlite::Error>>()
    .map_err(|err| err.to_string())?;

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
fn create_ticket(
  state: State<AppState>,
  input: CreateTicketInput,
) -> Result<Ticket, String> {
  let conn = Connection::open(&state.db_path).map_err(|err| err.to_string())?;

  let id = format!("tck-{}", Uuid::new_v4());
  let status = "TODO".to_string();
  let priority = input.priority.unwrap_or_else(|| "MEDIUM".to_string());

  conn
    .execute(
      "INSERT INTO tickets (id, title, description, status, priority, assignee_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      (
        &id,
        &input.title,
        &input.description,
        &status,
        &priority,
        &input.assignee_id,
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
  })
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
      app.manage(AppState { db_path });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_board_data,
      create_ticket,
      list_projects,
      create_empty_project,
      set_active_project,
      delete_project,
      execute_agent
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
