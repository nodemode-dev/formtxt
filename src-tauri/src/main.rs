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

mod packaged;
mod reveal;
mod text_edit;
mod traffic_lights;
mod window_state;

struct Backend(Mutex<Option<CommandChild>>);

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

fn open_main(handle: &tauri::AppHandle, url: tauri::Url) {
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
    let builder = WebviewWindowBuilder::new(handle, "main", WebviewUrl::External(url))
        .title("FormTxt")
        .visible(reveal::BUILD_VISIBLE)
        .background_color(reveal::BACKGROUND)
        .inner_size(width, height)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .disable_drag_drop_handler();
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
    } else {
        close_splash(handle);
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
                open_main(&handle, url);
                return Ok(());
            }
            let engine = match packaged::engine_folder() {
                Some(program) => app.shell().command(program),
                None => app
                    .shell()
                    .sidecar("formtxt-engine")
                    .expect("the FormTxt engine sidecar is missing; bundle its binary"),
            };
            let sidecar = engine
                .env("FORMTXT_PORT", "0")
                .env("FORMTXT_ENGINE_PORT", "0")
                .env("FORMTXT_PARENT_PID", std::process::id().to_string());
            let (mut rx, child) = sidecar.spawn().expect("the FormTxt engine failed to spawn");
            *app.state::<Backend>().0.lock().unwrap() = Some(child);

            tauri::async_runtime::spawn(async move {
                let pattern = regex::Regex::new(r"http://127\.0\.0\.1:(\d+)").unwrap();
                let mut port: Option<u16> = None;
                while let Some(event) = rx.recv().await {
                    let text = match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
                        CommandEvent::Terminated(_) => break,
                        _ => continue,
                    };
                    if let Some(found) = pattern.captures(&text).and_then(|c| c[1].parse::<u16>().ok()) {
                        port = Some(found);
                        break;
                    }
                }
                match port {
                    Some(port) => {
                        let url: tauri::Url = format!("http://127.0.0.1:{port}").parse().unwrap();
                        open_main(&handle, url);
                    }
                    None => {
                        close_splash(&handle);
                        let _ = handle
                            .dialog()
                            .message("The FormTxt engine failed to start. Please relaunch the app.")
                            .blocking_show();
                        kill_backend(&handle);
                        handle.exit(1);
                    }
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
