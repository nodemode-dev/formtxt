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
