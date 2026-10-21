import { keymap } from 'prosemirror-keymap';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { addPlugin, onDocumentLoaded } from './plugins';
import { addMenuItems } from './ui';
import { api } from '../../io/api';
import { matchFormat } from './ai/format';
import { openSettings } from './ai/settings-dialog';
import { AIPanel } from './ai/panel';
import { cached, loadStatus, saveSettings } from './ai/state';

type P = Record<string, unknown>;
type Param = { name: string; type: 'string' | 'number' | 'boolean'; description: string };
const S = (name: string, description: string): Param => ({ name, type: 'string', description });
const B = (name: string, description: string): Param => ({ name, type: 'boolean', description });

const MODES: Array<[string, string, string]> = [
  ['shorter', 'Make shorter', 'Rewrite the selection so it is shorter.'],
  ['longer', 'Make longer', 'Rewrite the selection so it is longer and fuller.'],
  ['formal', 'Make more formal', 'Rewrite the selection in a more formal tone.'],
  ['casual', 'Make more casual', 'Rewrite the selection in a more casual tone.'],
  ['simpler', 'Simplify', 'Rewrite the selection in simpler words.'],
];

export function register(reg: CommandRegistry, ed: DocEditor): void {
  let panel: AIPanel | null = null;
  const get = (): AIPanel => (panel ??= new AIPanel(ed));
  const add = (id: string, label: string, description: string, run: (p: P) => unknown, params: Param[] = [], keys: string[] = []): void =>
    reg.register({ id, label, group: 'AI', description, params, keys, run });
  const apply = (p: P): 'preview' | 'replace' | 'below' => (p.apply === 'replace' || p.apply === 'below' ? p.apply : 'preview');
  const APPLY = S('apply', 'preview (default, shows the suggestion in the panel), replace or below');

  add('ai.togglePanel', 'AI assistant panel', 'Show or hide the AI side panel with chat, writing, rewrite, summary, research and image tools.', () => get().toggle());
  add('ai.settings', 'AI settings', 'Turn AI on or off and choose the provider, address, key and model. AI is off by default and nothing is sent anywhere while it is off.', async () => { await openSettings(); return true; });
  add('ai.status', 'AI status', 'Report whether AI is on, the provider, the model and whether an image endpoint is set. Keys are never returned.', async () => loadStatus());
  add('ai.setModel', 'Choose AI model and effort', 'Pick the model and the effort level: fast, balanced or thorough. Effort sets the answer length limit and, for Anthropic, the extended thinking budget.', async (p) => {
    const patch: P = {};
    if (p.model) patch.model = String(p.model);
    if (p.effort) patch.effort = String(p.effort);
    const s = Object.keys(patch).length ? await saveSettings(patch) : (cached() ?? (await loadStatus()));
    return { model: s.model, effort: s.effort };
  }, [S('model', 'Model name'), S('effort', 'fast, balanced or thorough')]);
  add('ai.sources', 'Choose AI sources', 'Set the library documents the assistant is grounded in, by id separated by commas, or clear them. Answers say which documents they used.', async (p) => {
    const ids = String(p.ids ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const refs = [];
    for (const id of ids) {
      const r = await api.get<{ title: string }>(`/ai/library/${encodeURIComponent(id)}/text?limit=100`);
      refs.push({ id, title: r.title, kind: 'library' as const });
    }
    get().setSources(refs);
    return refs.map((r) => r.title);
  }, [S('ids', 'Document ids, separated by commas; empty clears')]);

  add('ai.chat', 'Chat about the document', 'Ask the assistant a question about the document, the selection or the chosen sources and get an answer in the panel.', async (p) => {
    const pn = get();
    if (!p.prompt) { pn.focusInput('chat', 'chatInput'); return true; }
    pn.show('chat');
    return pn.chat(String(p.prompt), String(p.scope ?? 'document'));
  }, [S('prompt', 'The question'), S('scope', 'document (default), selection or none')]);
  add('ai.promptBox', 'Help me write', 'Open the writing prompt box. Describe what to write and it is drafted at the caret.', () => { get().focusInput('write', 'writeInput'); return true; }, [], ['Ctrl+Alt+J']);
  add('ai.draft', 'Draft text at the caret', 'Write text from a prompt and insert it at the caret. Undo takes it back.', async (p) => {
    if (!p.prompt) { get().focusInput('write', 'writeInput'); return true; }
    get().show('write');
    return get().draft(String(p.prompt), false);
  }, [S('prompt', 'What to write')]);
  add('ai.createDraft', 'Create a first draft', 'Write a complete first draft from a prompt and the chosen library documents, as real headings, lists and paragraphs.', async (p) => {
    if (!p.prompt) { get().focusInput('write', 'writeInput'); return true; }
    get().show('write');
    return get().draft(String(p.prompt), true);
  }, [S('prompt', 'What the document should cover')]);

  add('ai.rewrite', 'Rewrite selection', 'Rewrite the selected text. Mode is shorter, longer, formal, casual, simpler or custom (with an instruction). Shows a preview with Replace, Insert below and Try again unless apply is replace or below.', async (p) => {
    if (p.mode === 'custom' && !p.instruction) { get().focusInput('rewrite', 'custom'); return true; }
    return get().rewrite(String(p.mode ?? (p.instruction ? 'custom' : 'shorter')), String(p.instruction ?? ''), apply(p));
  }, [S('mode', 'shorter, longer, formal, casual, simpler or custom'), S('instruction', 'How to change it, for mode custom'), APPLY]);
  for (const [mode, label, desc] of MODES) {
    add(`ai.${mode === 'formal' ? 'moreFormal' : mode === 'casual' ? 'moreCasual' : mode === 'simpler' ? 'simplify' : mode}`, label, `${desc} Shows a preview unless apply is replace or below.`, async (p) => get().rewrite(mode, '', apply(p)), [APPLY]);
  }
  add('ai.matchStyle', 'Match writing style', 'Rewrite the selected paragraphs to match the style of a sample paragraph, or of the rest of the document when no sample is given.', async (p) =>
    get().matchStyle(String(p.sample ?? ''), apply(p)), [S('sample', 'A paragraph in the target style; empty uses the rest of the document'), APPLY]);

  add('ai.summarize', 'Summarize the document', 'Summarize the document or the selection into the panel, at the caret, or as a Summary block at the top.', async (p) => {
    const into = p.into === 'block' || p.into === 'caret' ? p.into : 'panel';
    if (into === 'panel') get().show('summary');
    return get().summarize(p.scope === 'selection', into);
  }, [S('into', 'panel (default), caret or block'), S('scope', 'document (default) or selection')]);
  add('ai.summaryBlock', 'Insert or refresh Summary block', 'Write a summary and put it in a Summary block at the top of the document; if a Summary block exists it is refreshed.', async () => get().summarize(false, 'block'));

  add('ai.editDocument', 'Edit with AI across the document', 'Apply an instruction to the whole document and review the proposed paragraph changes in the panel; accept or reject each or all.', async (p) => {
    if (!p.instruction) { get().focusInput('document', 'reviseInput'); return true; }
    return get().revise(String(p.instruction));
  }, [S('instruction', 'What to change throughout the document')]);
  add('ai.acceptChanges', 'Accept AI changes', 'Accept one proposed paragraph change by its key, or all of them.', (p) => get().acceptProposal(String(p.id ?? 'all')), [S('id', 'Proposal key (r0, r1...) or all')]);
  add('ai.suggestChanges', 'Add AI changes as suggestions', 'Turn one proposed paragraph change, or all of them, into tracked suggestions by AI that Review accepts or rejects word by word.', (p) => get().suggestProposal(String(p.id ?? 'all')), [S('id', 'Proposal key (r0, r1...) or all')]);
  add('ai.rejectChanges', 'Reject AI changes', 'Reject one proposed paragraph change by its key, or all of them.', (p) => get().rejectProposal(String(p.id ?? 'all')), [S('id', 'Proposal key (r0, r1...) or all')]);
  add('ai.listChanges', 'List AI changes', 'List the proposed paragraph changes waiting for review.', () => get().proposalList());

  add('ai.translate', 'Translate', 'Translate the whole document into a new document that keeps headings, lists and tables, or the selection into a preview.', async (p) => {
    if (!p.language) { get().focusInput('document', 'lang'); return true; }
    get().show('document');
    return get().translate(String(p.language), p.scope === 'selection');
  }, [S('language', 'Language code such as es, fr, de, ja, zh-CN'), S('scope', 'document (default) or selection')]);
  add('ai.thesaurus', 'Thesaurus and dictionary', 'Show synonyms and a short meaning for the selected word; click a synonym in the panel to replace the word.', async () => { get().show('rewrite'); return get().lookup(); });
  add('ai.matchFormat', 'Match format from another document', 'Copy paragraph and character styles and page setup from another library document onto this one. Works without AI.', async (p) => {
    if (!p.from) { get().focusInput('document', 'fmtDoc'); return true; }
    return matchFormat(ed, String(p.from), { styles: p.styles !== false, page: p.page !== false });
  }, [S('from', 'Document id to copy from'), B('styles', 'Copy styles (default true)'), B('page', 'Copy page setup (default true)')]);

  add('ai.listen', 'Listen to the document', 'Read the document, the selection or an AI audio overview aloud with the system voices.', async (p) => {
    get().show('summary');
    await get().play(String(p.source ?? 'document'));
    return true;
  }, [S('source', 'document (default), selection or overview')]);
  add('ai.listenPause', 'Pause or resume listening', 'Pause the reading, or resume it when paused.', () => { const l = get(); if (l.listening() === 'paused') l.resume(); else l.pause(); return l.listening(); });
  add('ai.listenStop', 'Stop listening', 'Stop reading aloud.', () => { get().stop(); return true; });

  add('ai.image', 'Generate an image', 'Generate a picture from a prompt with the OpenAI-compatible images endpoint and insert it at the caret.', async (p) => {
    if (!p.prompt) { get().focusInput('image', 'imgPrompt'); return true; }
    get().show('image');
    return get().image(String(p.prompt), String(p.size ?? '1024x1024'));
  }, [S('prompt', 'What the picture shows'), S('size', '1024x1024 (default), 1536x1024 or 1024x1536')]);
  add('ai.banner', 'Insert a banner', 'Generate a wide picture and put it with a title at the top of the document.', async (p) => {
    if (!p.prompt) { get().focusInput('image', 'imgPrompt'); return true; }
    get().show('image');
    return get().banner(String(p.prompt), String(p.title ?? ''));
  }, [S('prompt', 'What the banner shows'), S('title', 'Title shown under the banner')]);

  add('ai.search', 'Search the library', 'Search titles and text of every document in the library from the Research panel. Works without AI.', async (p) => {
    if (!p.query) { get().focusInput('research', 'rsInput'); return true; }
    const rows = await get().search(String(p.query));
    return rows.map((r) => ({ id: r.id, title: r.title, snippet: r.snippet }));
  }, [S('query', 'Words to look for')]);
  add('ai.ask', 'Ask about search results', 'Ask a question the top library search results can answer; the answer names the documents it used.', async (p) => {
    const pn = get();
    if (p.query) await pn.search(String(p.query));
    return pn.askResults(String(p.question ?? ''));
  }, [S('question', 'The question'), S('query', 'Search first for these words')]);

  addMenuItems('AI', [
    { cmd: 'ai.togglePanel', label: 'AI assistant panel' },
    { cmd: 'ai.promptBox', label: 'Help me write...', keys: 'Ctrl+Alt+J' },
    { cmd: 'ai.chat', label: 'Chat about this document...' },
    { cmd: 'ai.settings', label: 'AI settings...' },
  ], false);
  addMenuItems('AI', [
    { cmd: 'ai.shorter', label: 'Make shorter' },
    { cmd: 'ai.longer', label: 'Make longer' },
    { cmd: 'ai.moreFormal', label: 'Make more formal' },
    { cmd: 'ai.moreCasual', label: 'Make more casual' },
    { cmd: 'ai.simplify', label: 'Simplify' },
    { cmd: 'ai.matchStyle', label: 'Match writing style' },
    { cmd: 'ai.thesaurus', label: 'Thesaurus and dictionary' },
  ]);
  addMenuItems('AI', [
    { cmd: 'ai.summarize', label: 'Summarize in the panel' },
    { cmd: 'ai.summaryBlock', label: 'Insert or refresh Summary block' },
    { cmd: 'ai.editDocument', label: 'Edit across the document...' },
    { cmd: 'ai.translate', label: 'Translate document' },
    { cmd: 'ai.matchFormat', label: 'Match format from a document...' },
  ]);
  addMenuItems('AI', [
    { cmd: 'ai.createDraft', label: 'Create a first draft...' },
    { cmd: 'ai.image', label: 'Generate image...' },
    { cmd: 'ai.banner', label: 'Insert banner...' },
    { cmd: 'ai.search', label: 'Research the library...' },
    { cmd: 'ai.listen', label: 'Listen to the document' },
    { cmd: 'ai.listenStop', label: 'Stop listening' },
  ]);

  addPlugin(keymap({ 'Mod-Alt-j': () => { void reg.run('ai.promptBox'); return true; } }));
  addPlugin(new Plugin({
    props: {
      decorations(state) {
        if (!cached()?.enabled) return null;
        const sel = state.selection;
        const $p = sel.$from;
        if (!sel.empty || $p.depth !== 1 || $p.parent.type.name !== 'paragraph' || $p.parent.content.size !== 0 || $p.parent.attrs.list) return null;
        return DecorationSet.create(state.doc, [Decoration.node($p.before(), $p.after(), { class: 'ft-ai-empty' })]);
      },
    },
  }));
  onDocumentLoaded(() => { void loadStatus().catch(() => undefined); panel?.loadHistory(); });
  void loadStatus().catch(() => undefined);
}
