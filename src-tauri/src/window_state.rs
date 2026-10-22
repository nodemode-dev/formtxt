use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

const FILE: &str = "window.json";
const WRITE_EVERY: Duration = Duration::from_secs(2);
const MIN_SIDE: f64 = 200.0;

#[derive(Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Place {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

#[derive(Default)]
struct Kept {
    place: Place,
    written: Option<Instant>,
}

#[derive(Default)]
pub struct Memory(Mutex<Kept>);

fn file(handle: &tauri::AppHandle) -> Option<PathBuf> {
    handle.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

fn write(handle: &tauri::AppHandle, place: &Place) {
    let Some(file) = file(handle) else { return };
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(place) {
        let _ = std::fs::write(file, text);
    }
}

fn on_screen(handle: &tauri::AppHandle, place: &Place) -> bool {
    let Ok(monitors) = handle.available_monitors() else { return true };
    let (x, y) = (place.x + 80.0, place.y + 20.0);
    monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let (left, top) = (f64::from(monitor.position().x) / scale, f64::from(monitor.position().y) / scale);
        let (width, height) = (f64::from(monitor.size().width) / scale, f64::from(monitor.size().height) / scale);
        x > left && x < left + width && y > top && y < top + height
    })
}

pub fn load(handle: &tauri::AppHandle) -> Place {
    let mut place = file(handle)
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str::<Place>(&text).ok())
        .unwrap_or_default();
    if place.width < MIN_SIDE || place.height < MIN_SIDE || !on_screen(handle, &place) {
        place.x = 0.0;
        place.y = 0.0;
        place.width = 0.0;
        place.height = 0.0;
    }
    if let Ok(mut kept) = handle.state::<Memory>().0.lock() {
        kept.place = place;
    }
    place
}

pub fn restore(window: &tauri::WebviewWindow, place: &Place) {
    if place.maximized {
        let _ = window.maximize();
    }
}

fn remember(window: &tauri::Window) {
    let handle = window.app_handle();
    let state = handle.state::<Memory>();
    let Ok(mut kept) = state.0.lock() else { return };
    let maximized = window.is_maximized().unwrap_or(false);
    kept.place.maximized = maximized;
    if !maximized && !window.is_minimized().unwrap_or(false) && !window.is_fullscreen().unwrap_or(false) {
        if let (Ok(position), Ok(size), Ok(scale)) = (window.outer_position(), window.inner_size(), window.scale_factor()) {
            kept.place.x = f64::from(position.x) / scale;
            kept.place.y = f64::from(position.y) / scale;
            kept.place.width = f64::from(size.width) / scale;
            kept.place.height = f64::from(size.height) / scale;
        }
    }
    if kept.written.map_or(true, |at| at.elapsed() > WRITE_EVERY) {
        kept.written = Some(Instant::now());
        write(handle, &kept.place);
    }
}

pub fn flush(handle: &tauri::AppHandle) {
    let state = handle.state::<Memory>();
    if let Ok(kept) = state.0.lock() {
        write(handle, &kept.place);
    };
}

pub fn track(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember(window),
        WindowEvent::CloseRequested { .. } => {
            remember(window);
            flush(window.app_handle());
        }
        WindowEvent::Destroyed => flush(window.app_handle()),
        _ => {}
    }
}
