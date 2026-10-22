let loaded: string[] = [];
let pending: Promise<string[]> | null = null;

export function systemFontsAvailable(): boolean {
  return '__TAURI_INTERNALS__' in window || 'queryLocalFonts' in window;
}

export function systemFonts(): string[] {
  return loaded;
}

export function loadSystemFonts(exclude: string[] = []): Promise<string[]> {
  if (pending) return pending;
  const raw = async (): Promise<string[]> => {
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string[]>('system_fonts');
    }
    if ('queryLocalFonts' in window) {
      const faces = await (window as unknown as { queryLocalFonts(): Promise<Array<{ family: string }>> }).queryLocalFonts();
      return faces.map((f) => f.family);
    }
    return [];
  };
  const skip = new Set(exclude.map((n) => n.toLowerCase()));
  pending = raw().catch(() => [] as string[]).then((names) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of names) {
      const k = n.trim().toLowerCase();
      if (!k || seen.has(k) || skip.has(k)) continue;
      seen.add(k);
      out.push(n.trim());
    }
    loaded = out.sort((a, b) => a.localeCompare(b));
    return loaded;
  });
  return pending;
}
