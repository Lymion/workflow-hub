// Workflow Hub desktop shell.
// The window shows the React UI; all real work happens in the engine on
// 127.0.0.1:8765. If the engine isn't already running, the shell starts it and
// stops it again when the window closes.
//
// Installed app: the engine is a bundled program (engine/engine.exe next to the
// app's resources), so no Python is needed. Its hub folder is
// %LOCALAPPDATA%\Workflow Hub (data, your snippets, notes) and its log is
// data\engine.log there.
// Development: `npm run tauri dev` runs `python -m engine` from the repository.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, File, OpenOptions};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

struct Engine(Mutex<Option<Child>>);

fn engine_running() -> bool {
    let addr: SocketAddr = "127.0.0.1:8765".parse().unwrap();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Don't flash a console window on Windows when starting the engine.
fn hide_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn log_file(hub: &Path) -> Option<(File, File)> {
    let data = hub.join("data");
    fs::create_dir_all(&data).ok()?;
    let out = OpenOptions::new().create(true).append(true).open(data.join("engine.log")).ok()?;
    let err = out.try_clone().ok()?;
    Some((out, err))
}

/// The installed engine program, if this is an installed app.
fn bundled_engine(app: &tauri::App) -> Option<PathBuf> {
    let exe = if cfg!(windows) { "engine.exe" } else { "engine" };
    let path = app.path().resource_dir().ok()?.join("engine").join(exe);
    path.is_file().then_some(path)
}

/// The repository root in development: WORKFLOW_HUB_ROOT, or the folder above app/src-tauri.
fn repo_root() -> PathBuf {
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

fn start_installed(app: &tauri::App, exe: &Path) -> Option<Child> {
    let hub = app.path().local_data_dir().ok()?.join("Workflow Hub");
    fs::create_dir_all(&hub).ok()?;
    let mut cmd = Command::new(exe);
    cmd.current_dir(&hub).env("WORKFLOW_HUB_ROOT", &hub).stdin(Stdio::null());
    if let Some((out, err)) = log_file(&hub) {
        cmd.stdout(out).stderr(err);
    }
    match hide_console(&mut cmd).spawn() {
        Ok(child) => Some(child),
        Err(e) => {
            eprintln!("Workflow Hub: could not start the engine ({e}). Reinstall Workflow Hub.");
            None
        }
    }
}

fn start_dev() -> Option<Child> {
    let root = repo_root();
    // Prefer the project's virtual environment, then the Windows launcher, then python on PATH.
    let venv_win = root.join(".venv").join("Scripts").join("python.exe");
    let venv_unix = root.join(".venv").join("bin").join("python");
    let candidates: Vec<PathBuf> = vec![venv_win, venv_unix, PathBuf::from("py"), PathBuf::from("python"), PathBuf::from("python3")];
    for exe in candidates {
        if exe.is_absolute() && !exe.is_file() {
            continue;
        }
        let mut cmd = Command::new(&exe);
        cmd.args(["-m", "engine"]).current_dir(&root);
        if let Ok(child) = hide_console(&mut cmd).spawn() {
            return Some(child);
        }
    }
    eprintln!("Workflow Hub: could not start the engine. Run `python -m engine` in {}", root.display());
    None
}

fn start_engine(app: &tauri::App) -> Option<Child> {
    if engine_running() {
        return None; // someone already started it; leave it alone
    }
    match bundled_engine(app) {
        Some(exe) => start_installed(app, &exe),
        None => start_dev(),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let child = start_engine(app);
            app.manage(Engine(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Workflow Hub")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Engine>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
