#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[tauri::command(async)]
fn system_fonts() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.trim().to_string()))
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

mod engine_start;
mod packaged;
mod reveal;
mod text_edit;
mod traffic_lights;
#[cfg(windows)]
mod win_job;
mod window_state;

struct Backend(Mutex<Option<CommandChild>>);

type EngineStep = Result<CommandEvent, Option<engine_start::Wait>>;

fn start_limit(late: &tauri::async_runtime::Sender<EngineStep>, limit: std::time::Duration, wait: Option<engine_start::Wait>) {
    let late = late.clone();
    std::thread::spawn(move || {
        std::thread::sleep(limit);
        let _ = late.blocking_send(Err(wait));
    });
}

fn engine_failed(handle: &tauri::AppHandle, failure: engine_start::Failure, tail: &engine_start::Tail) {
    let text = engine_start::message(&failure, &tail.lines(), engine_start::engine_log().as_deref());
    eprintln!("formtxt: {text}");
    let _ = handle
        .dialog()
        .message(text)
        .title(engine_start::APP)
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .blocking_show();
    close_splash(handle);
    kill_backend(handle);
    handle.exit(1);
}

const FALLBACK_SIZE: (f64, f64) = (1280.0, 820.0);
const MIN_SIZE: (f64, f64) = (900.0, 600.0);
const SCREEN_FRACTION: f64 = 0.9;

fn kill_backend(handle: &tauri::AppHandle) {
    let state = handle.state::<Backend>();
    let child = state.0.lock().ok().and_then(|mut slot| slot.take());
    if let Some(child) = child {
        #[cfg(unix)]
        {
            let pid = child.pid().to_string();
            let signal = |sig: &str| {
                std::process::Command::new("kill")
                    .args([sig, pid.as_str()])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .is_ok_and(|s| s.success())
            };
            if signal("-TERM") {
                for _ in 0..30 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if !signal("-0") {
                        return;
                    }
                }
            }
        }
        #[cfg(windows)]
        win_job::end();
        let _ = child.kill();
    }
}

fn close_splash(handle: &tauri::AppHandle) {
    if let Some(splash) = handle.get_webview_window("splash") {
        let _ = splash.close();
    }
}

fn dev_url(handle: &tauri::AppHandle) -> Option<tauri::Url> {
    if cfg!(debug_assertions) {
        handle.config().build.dev_url.clone()
    } else {
        None
    }
}

fn open_main(handle: &tauri::AppHandle, url: tauri::Url, key: Option<String>) -> bool {
    let place = window_state::load(handle);
    let (width, height) = if place.width > 0.0 {
        (place.width, place.height)
    } else {
        handle
            .primary_monitor()
            .ok()
            .flatten()
            .map(|monitor| {
                let logical = monitor.size().to_logical::<f64>(monitor.scale_factor());
                (logical.width * SCREEN_FRACTION, logical.height * SCREEN_FRACTION)
            })
            .unwrap_or(FALLBACK_SIZE)
    };
    let builder = WebviewWindowBuilder::new(handle, "main", WebviewUrl::External(url.clone()))
        .title("FormTxt")
        .visible(reveal::BUILD_VISIBLE)
        .background_color(reveal::BACKGROUND)
        .inner_size(width, height)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .disable_drag_drop_handler();
    let origin = url.origin().ascii_serialization();
    let builder = match &key {
        Some(value) => builder.initialization_script(format!(
            "if (window.location.origin === {origin:?}) {{ window.__FORMTXT_WINDOW_KEY = {value:?}; }}"
        )),
        None => builder,
    };
    let builder = if place.width > 0.0 {
        builder.position(place.x, place.y)
    } else {
        builder.center()
    };
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    let builder = builder.on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            traffic_lights::place(&window.as_ref().window());
        }
    });
    if let Ok(window) = builder.build() {
        reveal::conceal(&window);
        traffic_lights::place(&window.as_ref().window());
        window_state::restore(&window, &place);
        true
    } else {
        close_splash(handle);
        false
    }
}

fn main() {
    reveal::mark_launch();
    let app = tauri::Builder::default()
        .manage(window_state::Memory::default())
        .on_window_event(|window, event| {
            window_state::track(window, event);
            if window.label() == "main"
                && matches!(
                    event,
                    WindowEvent::Resized(_)
                        | WindowEvent::Focused(_)
                        | WindowEvent::ThemeChanged(_)
                        | WindowEvent::ScaleFactorChanged { .. }
                )
            {
                traffic_lights::place(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            traffic_lights::set_window_title,
            reveal::app_ready,
            text_edit::text_edit,
            system_fonts
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            reveal::round_splash(&handle);
            if let Some(url) = dev_url(&handle) {
                open_main(&handle, url, None);
                return Ok(());
            }
            let engine = match packaged::engine_folder() {
                Some(program) => Ok(app.shell().command(program)),
                None => app.shell().sidecar("formtxt-engine").map_err(|_| engine_start::Failure::Missing),
            };
            let started = engine.and_then(|engine| {
                engine
                    .env("FORMTXT_PORT", "0")
                    .env("FORMTXT_ENGINE_PORT", "0")
                    .env(engine_start::PARENT_ENV, std::process::id().to_string())
                    .env(engine_start::SHELL_ENV, std::process::id().to_string())
                    .env("FORMTXT_WINDOW_KEY_STDOUT", "1")
                    .spawn()
                    .map_err(|err| engine_start::Failure::NotStarted(err.to_string()))
            });
            let (mut rx, child) = match started {
                Ok(pair) => pair,
                Err(failure) => {
                    std::thread::spawn(move || engine_failed(&handle, failure, &engine_start::Tail::default()));
                    return Ok(());
                }
            };
            #[cfg(windows)]
            win_job::hold_pid(child.pid());
            *app.state::<Backend>().0.lock().unwrap() = Some(child);

            tauri::async_runtime::spawn(async move {
                let pattern = regex::Regex::new(r"http://127\.0\.0\.1:(\d+)").unwrap();
                let key_pattern = regex::Regex::new(r"formtxt-window-key: ([A-Za-z0-9_-]{32,})").unwrap();
                let (tx, mut events) = tauri::async_runtime::channel::<EngineStep>(64);
                let late = tx.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if tx.send(Ok(event)).await.is_err() {
                            break;
                        }
                    }
                    let _ = tx.send(Err(None)).await;
                });
                start_limit(&late, engine_start::Wait::Address.limit(), Some(engine_start::Wait::Address));
                let mut port: Option<u16> = None;
                let mut key: Option<String> = None;
                let mut waiting = false;
                let mut stopped = false;
                let mut tail = engine_start::Tail::default();
                let mut failure = engine_start::Failure::Stopped(None);
                while let Some(step) = events.recv().await {
                    let text = match step {
                        Ok(CommandEvent::Stdout(bytes)) | Ok(CommandEvent::Stderr(bytes)) => String::from_utf8_lossy(&bytes).into_owned(),
                        Ok(CommandEvent::Terminated(ended)) => {
                            failure = engine_start::Failure::Stopped(ended.code);
                            stopped = true;
                            start_limit(&late, engine_start::EXIT_WAIT, None);
                            continue;
                        }
                        Ok(_) => continue,
                        Err(None) => break,
                        Err(Some(_)) if stopped => break,
                        Err(Some(engine_start::Wait::Address)) if port.is_some() => continue,
                        Err(Some(wait)) => {
                            failure = engine_start::Failure::TimedOut(wait);
                            break;
                        }
                    };
                    if key.is_none() {
                        key = key_pattern.captures(&text).map(|found| found[1].to_string());
                    }
                    for line in text.lines() {
                        tail.push(line);
                    }
                    if port.is_none() {
                        port = pattern.captures(&text).and_then(|c| c[1].parse::<u16>().ok());
                    }
                    if port.is_some() && key.is_some() {
                        break;
                    }
                    if port.is_some() && !waiting {
                        waiting = true;
                        start_limit(&late, engine_start::Wait::Key.limit(), Some(engine_start::Wait::Key));
                    }
                }
                drop(late);
                match port.filter(|_| key.is_some()) {
                    Some(port) => {
                        let url: tauri::Url = format!("http://127.0.0.1:{port}").parse().unwrap();
                        if !open_main(&handle, url, key) {
                            engine_failed(&handle, engine_start::Failure::Window, &engine_start::Tail::default());
                        }
                    }
                    None => engine_failed(&handle, failure, &tail),
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("FormTxt could not start its window");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            window_state::flush(handle);
            kill_backend(handle);
        }
    });
}
