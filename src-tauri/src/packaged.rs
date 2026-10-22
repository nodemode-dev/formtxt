const ENGINE: &str = if cfg!(windows) { "formtxt-engine.exe" } else { "formtxt-engine" };

pub fn engine_folder() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    [dir.join("../Resources/engine"), dir.join("engine")]
        .into_iter()
        .map(|folder| folder.join(ENGINE))
        .find(|program| program.is_file())
}
