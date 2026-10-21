import { api } from '../io/api';
import type { CommandRegistry } from '../engine/registry';

export async function mirrorCatalogue(registry: CommandRegistry): Promise<number> {
  const rows = registry.list().map((c) => ({ id: c.id, label: c.label, group: c.group, description: c.description, keys: c.keys ?? [], params: c.params ?? [] }));
  const out = await api.post<{ size: number }>('/commands/catalogue', { commands: rows });
  return out.size;
}
