use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::Manager;

struct ServerState {
    server_process: Mutex<Option<Child>>,
}

fn build_runtime_path() -> String {
    let mut entries: Vec<String> = Vec::new();

    if let Ok(existing) = std::env::var("PATH") {
        for entry in existing.split(':') {
            if !entry.is_empty() && !entries.iter().any(|e| e == entry) {
                entries.push(entry.to_string());
            }
        }
    }

    let defaults = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];

    for entry in defaults {
        if !entries.iter().any(|e| e == entry) {
            entries.push(entry.to_string());
        }
    }

    entries.join(":")
}

fn find_server_dir(app: &tauri::App) -> Option<PathBuf> {
    // Try resource_dir first (production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let server_dir = resource_dir.join("server");
        if server_dir.exists() {
            log::info!("Found server in resource_dir: {:?}", server_dir);
            return Some(server_dir);
        }
    }
    
    // Try executable path (alternative production location)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(app_dir) = exe_path.parent() {
            // macOS: Contents/MacOS -> Contents/Resources
            let resources_dir = app_dir.parent().map(|p| p.join("Resources"));
            if let Some(res_dir) = resources_dir {
                let server_dir = res_dir.join("server");
                if server_dir.exists() {
                    log::info!("Found server via exe path: {:?}", server_dir);
                    return Some(server_dir);
                }
            }
        }
    }
    
    log::error!("Could not find server directory");
    None
}

fn find_node_binary(server_dir: &PathBuf) -> Option<PathBuf> {
    let bundled_node = if cfg!(target_os = "windows") {
        server_dir.join("node.exe")
    } else {
        server_dir.join("node")
    };

    if bundled_node.exists() {
        log::info!("Found bundled Node.js at: {:?}", bundled_node);
        return Some(bundled_node);
    }

    if let Some(node_path) = find_node_in_path() {
        return Some(node_path);
    }

    log::error!("Could not find Node.js binary");
    None
}

#[cfg(target_os = "windows")]
fn find_node_in_path() -> Option<PathBuf> {
    let possible_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];

    for path in possible_paths {
        let node_path = PathBuf::from(path);
        if node_path.exists() {
            log::info!("Found Node.js at: {:?}", node_path);
            return Some(node_path);
        }
    }

    if let Ok(output) = Command::new("where").arg("node").output() {
        if output.status.success() {
            if let Some(first_line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                let path = PathBuf::from(first_line.trim());
                if path.exists() {
                    log::info!("Found Node.js via where: {:?}", path);
                    return Some(path);
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn find_node_in_path() -> Option<PathBuf> {
    // Try common Node.js locations on macOS/Linux
    let possible_paths = [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
    ];

    for path in possible_paths {
        let node_path = PathBuf::from(path);
        if node_path.exists() {
            log::info!("Found Node.js at: {:?}", node_path);
            return Some(node_path);
        }
    }

    if let Ok(output) = Command::new("which").arg("node").output() {
        if output.status.success() {
            if let Some(first_line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                let path = PathBuf::from(first_line.trim());
                if path.exists() {
                    log::info!("Found Node.js via which: {:?}", path);
                    return Some(path);
                }
            }
        }
    }

    None
}

fn start_next_server(server_dir: PathBuf) -> Option<Child> {
    let server_js = server_dir.join("server.js");
    
    log::info!("Starting Next.js server from: {:?}", server_dir);
    
    if !server_js.exists() {
        log::error!("server.js not found at {:?}", server_js);
        return None;
    }
    
    let node_path = find_node_binary(&server_dir)?;
    log::info!("Using Node.js from: {:?}", node_path);

    let runtime_path = build_runtime_path();
    log::info!("Using PATH for server: {}", runtime_path);
    
    let child = Command::new(&node_path)
        .arg(&server_js)
        .current_dir(&server_dir)
        .env("PORT", "1234")
        .env("HOSTNAME", "localhost")
        .env("PATH", runtime_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            log::error!("Failed to start server: {}", e);
            e
        })
        .ok()?;
    
    log::info!("Next.js server started with PID: {}", child.id());
    Some(child)
}

#[allow(dead_code)]
fn kill_server(state: &tauri::State<ServerState>) {
    if let Ok(mut server) = state.server_process.lock() {
        if let Some(ref mut child) = *server {
            log::info!("Killing Next.js server with PID: {}", child.id());
            let _ = child.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(ServerState {
            server_process: Mutex::new(None),
        })
        .setup(|app| {
            log::info!("App setup starting...");
            
            // In production, start the Next.js server
            #[cfg(not(debug_assertions))]
            {
                log::info!("Production mode detected, looking for server...");
                
                if let Some(server_dir) = find_server_dir(app) {
                    let state = app.state::<ServerState>();
                    let mut server = state.server_process.lock().unwrap();
                    *server = start_next_server(server_dir);
                    
                    // Wait for server to start
                    log::info!("Waiting for server to start...");
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    log::info!("Server should be ready now");
                } else {
                    log::error!("Server directory not found!");
                }
            }
            
            #[cfg(debug_assertions)]
            {
                log::info!("Debug mode - using external dev server");
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
