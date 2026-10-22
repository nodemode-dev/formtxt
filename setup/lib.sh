#!/usr/bin/env bash
FORMTXT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORMTXT_ROOT
ft_say() { printf '[formtxt] %s\n' "$*"; }
ft_die() { printf '[formtxt] error: %s\n' "$*" >&2; exit 1; }
ft_venv() {
  local act="$FORMTXT_ROOT/backend/venv/bin/activate"
  [ -f "$act" ] || act="$FORMTXT_ROOT/backend/venv/Scripts/activate"
  [ -f "$act" ] || ft_die "backend venv missing, run ./formtxt install"
  # shellcheck disable=SC1090
  source "$act"
}
ft_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}
ft_python() {
  local c
  for c in python3.14 python3.13 python3.12 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
      echo "$c"
      return 0
    fi
  done
  return 1
}
ft_rust_env() {
  [ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
  export PATH
  unset RUSTC RUSTC_WORKSPACE_WRAPPER RUSTFLAGS CARGO_ENCODED_RUSTFLAGS CARGO_BUILD_RUSTFLAGS CARGO_BUILD_TARGET CARGO_TARGET_DIR CARGO_BUILD_TARGET_DIR CARGO_BUILD_RUSTC
  export RUSTC_WRAPPER="" CARGO_BUILD_RUSTC_WRAPPER=""
  if command -v rustup >/dev/null 2>&1 && rustup toolchain list 2>/dev/null | grep -q '^stable'; then
    export RUSTUP_TOOLCHAIN="${FORMTXT_RUST_TOOLCHAIN:-stable}"
  fi
}
ft_rust_fresh() {
  local target="${CARGO_TARGET_DIR:-$FORMTXT_ROOT/src-tauri/target}" now
  now="$(rustc -vV 2>/dev/null | tr '\n' ' ')"
  if [ -d "$target/release" ] && [ "$(cat "$target/.formtxt-rustc" 2>/dev/null)" != "$now" ]; then
    ft_say "the Rust compiler differs from the one that built $target; cleaning it"
    ( cd "$FORMTXT_ROOT/src-tauri" && cargo clean )
  fi
  mkdir -p "$target"
  printf '%s' "$now" > "$target/.formtxt-rustc"
}
