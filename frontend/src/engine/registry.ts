export interface CommandParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
}

export interface Command {
  id: string;
  label: string;
  group: string;
  description: string;
  keys?: string[];
  params?: CommandParam[];
  run: (params: Record<string, unknown>) => unknown | Promise<unknown>;
}

type Listener = (cmd: Command) => void;

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly listeners = new Set<Listener>();

  register(cmd: Command): void {
    if (this.commands.has(cmd.id)) throw new Error(`command registered twice: ${cmd.id}`);
    this.commands.set(cmd.id, cmd);
    for (const l of this.listeners) l(cmd);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  list(): Command[] {
    return Array.from(this.commands.values());
  }

  async run(id: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const cmd = this.commands.get(id);
    if (!cmd) throw new Error(`No command has the id ${id}.`);
    return cmd.run(params);
  }

  onRegister(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const commands = new CommandRegistry();
