// Workflow Hub desktop shell.
// The window shows the React UI; all real work happens in the Python engine on
// 127.0.0.1:8765. If the engine isn't already running, the shell starts it and
// stops it again when the window closes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

struct Engine(Mutex<Option<Child>>);

fn engine_running() -> bool {
    let addr: SocketAddr = "127.0.0.1:8765".parse().unwrap();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// The repository root: WORKFLOW_HUB_ROOT, or two folders up from app/src-tauri in dev.
fn hub_root() -> PathBuf {
    if let Ok(root) = std::env::var("WORKFLOW_HUB_ROOT") {
        return PathBuf::from(root);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for dir in cwd.ancestors() {
        if dir.join("engine").join("__main__.py").is_file() {
            return dir.to_path_buf();
        }
    }
    cwd
}

fn start_engine() -> Option<Child> {
    if engine_running() {
        return None; // someone already started it; leave it alone
    }
    let root = hub_root();
    // Prefer the project's virtual environment, then the Windows launcher, then python on PATH.
    let venv_win = root.join(".venv").join("Scripts").join("python.exe");
    let venv_unix = root.join(".venv").join("bin").join("python");
    let candidates: Vec<PathBuf> = vec![venv_win, venv_unix, PathBuf::from("py"), PathBuf::from("python"), PathBuf::from("python3")];
    for exe in candidates {
        if exe.is_absolute() && !exe.is_file() {
            continue;
        }
        if let Ok(child) = Command::new(&exe).args(["-m", "engine"]).current_dir(&root).spawn() {
            return Some(child);
        }
    }
    eprintln!("Workflow Hub: could not start the engine. Run `python -m engine` in {}", root.display());
    None
}

fn main() {
    tauri::Builder::default()
        .manage(Engine(Mutex::new(start_engine())))
        .build(tauri::generate_context!())
        .expect("error while building Workflow Hub")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                if let Some(mut child) = app.state::<Engine>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
