import '../../styles/prefs.css';
import { commands } from '../../engine/registry';
import { api } from '../../io/api';
import { saveSettings as saveAi, loadStatus as loadAi, type AIStatus } from '../../editor/ext/ai/state';
import { networkPreference } from '../../editor/ext/collab/share';
import { forgetName } from '../../editor/ext/collab/util';
import { LANGUAGES } from '../../editor/ext/proofing/layout';
import { getPrefs as proofingPrefs, onChange as onProofingChange, savePrefs as saveProofing } from '../../editor/ext/proofing/state';
import { RULE_LABELS, type GrammarRules, type AutoCorrectRules } from '../../editor/ext/proofing/types';
import { currentMode } from '../../editor/ext/review/track';
import { el, patchList, q, setClass, setHidden, setText } from '../dom';
import { icon } from '../icons';
import { shellCommands } from '../shell/cmd';
import { toast } from '../toast';
import { THEMES, readChoice, setAccent, setIntensity, setTheme } from '../themes';
import { buttonRow, checkRow, colorRow, selectRow, sliderRow, textRow, toggleRow, type Row } from './controls';
import { PrefsShell } from './dialog-shell';
import { RAIL_KEY, UI_FONT_SIZES, ZOOM_CHOICES, applyPrefs, loadPrefs, updatePrefs, type Prefs, type UiFontSize } from './store';

interface SectionDef { id: string; name: string; icon: string }

const SECTIONS: SectionDef[] = [
  { id: 'general', name: 'General', icon: 'pfGeneral' },
  { id: 'interface', name: 'Interface', icon: 'pfInterface' },
  { id: 'display', name: 'Display', icon: 'pfDisplay' },
  { id: 'proofing', name: 'Proofing', icon: 'pfProofing' },
  { id: 'save', name: 'Save', icon: 'pfSave' },
  { id: 'language', name: 'Language', icon: 'pfLanguage' },
  { id: 'accessibility', name: 'Accessibility', icon: 'pfAccess' },
  { id: 'advanced', name: 'Advanced', icon: 'pfAdvanced' },
  { id: 'ribbon', name: 'Customize Ribbon', icon: 'pfRibbon' },
  { id: 'keyboard', name: 'Keyboard', icon: 'pfKeyboard' },
  { id: 'addins', name: 'Add-ins', icon: 'pfAddins' },
  { id: 'sharing', name: 'Sharing and Collaboration', icon: 'pfShare' },
  { id: 'ai', name: 'AI', icon: 'pfAI' },
  { id: 'privacy', name: 'Privacy', icon: 'pfPrivacy' },
];

const AUTOCORRECT_LABELS: Record<keyof AutoCorrectRules, string> = {
  list: 'Replace text as you type (the AutoCorrect list)',
  smartQuotes: 'Straight quotes with smart quotes',
  dashes: 'Two hyphens between words with an en dash',
  symbols: 'Symbols such as (c), (r), (tm) and (e)',
  arrows: 'Arrows: -> and <- and ==>',
  fractions: 'Fractions such as 1/2 and 3/4',
  capitalize: 'Capitalize the first letter of sentences',
  ellipsis: 'Three periods with an ellipsis',
};

const STYLE_CHOICES: ReadonlyArray<readonly [string, string]> = [['casual', 'Casual'], ['professional', 'Professional'], ['formal', 'Formal']];
const MODE_CHOICES: ReadonlyArray<readonly [string, string]> = [['editing', 'Editing'], ['suggesting', 'Suggesting (track changes)'], ['viewing', 'Viewing (read only)']];
const EFFORT_CHOICES: ReadonlyArray<readonly [string, string]> = [['fast', 'Fast'], ['balanced', 'Balanced'], ['thorough', 'Thorough']];
const PROVIDER_CHOICES: ReadonlyArray<readonly [string, string]> = [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI-compatible (OpenAI, Ollama, LM Studio)']];
const DEFAULT_MODEL: Record<string, string> = { anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o-mini' };

interface EngineSettings { author?: string; stockImages?: boolean; linkPreviews?: boolean; pexelsKeySet?: boolean; pexelsLast4?: string; secretStore?: { store: string; backend: string } }
interface CloudState { folder: string; user?: string; passwordSet?: boolean }
interface AddinRow { id: string; name: string; enabled: boolean; permissions: string[] }

const grp = (label: string, ...content: HTMLElement[]): HTMLElement => {
  const g = el('<section class="ft-prefs-group"><h3 class="ft-prefs-label"></h3></section>');
  setText(q(g, '.ft-prefs-label'), label);
  g.append(...content);
  return g;
};
const nt = (text: string, status = false): HTMLElement => {
  const p = el(`<p class="ft-prefs-note${status ? ' ft-prefs-status' : ''}"${status ? ' role="status"' : ''}></p>`);
  setText(p, text);
  return p;
};
const cols = (...content: HTMLElement[]): HTMLElement => { const c = el('<div class="ft-prefs-cols"></div>'); c.append(...content); return c; };

async function call(id: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!shellCommands.has(id)) throw new Error(`The command ${id} is not available.`);
  const r = await shellCommands.call(id, params);
  if (!r.ran) throw new Error(`The command ${id} cannot run right now.`);
  return r.result;
}

const fail = (e: unknown): void => { toast(e instanceof Error ? e.message : String(e), 'error'); };

function hasDocument(): boolean {
  const root = document.querySelector<HTMLElement>('.ft-editor');
  return !!root && !root.hidden;
}

function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return parts.length ? ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '';
}

class PrefsDialog {
  private readonly shell = new PrefsShell('preferences', 'Preferences');
  private readonly nav = el('<div class="ft-prefs-nav" role="tablist"></div>');
  private readonly sections = new Map<string, HTMLElement>();
  private readonly pages = el('<div class="ft-prefs-pages"></div>');
  private wire: { rail: HTMLElement; port: HTMLElement; shade: SVGPathElement; line: SVGPathElement } | null = null;
  private current = '';
  private wireRaf = 0;
  private spyRaf = 0;
  private spyMuted = 0;
  private wireD = '';
  private portY = Number.NaN;
  private prefs: Prefs = loadPrefs();
  private engine: EngineSettings = {};
  private ai: AIStatus | null = null;
  private voiceKey = '';
  private resetArmed = false;
  private done: HTMLButtonElement | null = null;

  private readonly homeRow = checkRow('Show Home when FormTxt starts', (v) => this.change({ homeAtLaunch: v }));
  private readonly nameRow = textRow('User name', { placeholder: 'Your name', onCommit: (v) => this.saveName(v) });
  private readonly initialsNote = nt('', true);
  private readonly dirRow = textRow('Engine data folder', { onCommit: () => undefined });
  private readonly copyDir = el<HTMLButtonElement>('<button type="button" class="ft-btn">Copy path</button>');
  private readonly storeNote = nt('', true);
  private readonly resetBtn = el<HTMLButtonElement>('<button type="button" class="ft-btn danger">Reset All Preferences...</button>');
  private readonly resetCancel = el<HTMLButtonElement>('<button type="button" class="ft-btn ft-prefs-invisible">Cancel</button>');

  private readonly grid = el('<div class="ft-prefs-theme-grid" role="group" aria-label="Theme"></div>');
  private readonly autoRow = toggleRow('Match System Appearance', (v) => this.change({ themeAuto: v }));
  private readonly lightRow = selectRow('Light theme', Object.entries(THEMES).filter(([, t]) => t.light).map(([k, t]) => [k, t.label] as const), (v) => this.change({ themeLight: v }));
  private readonly darkRow = selectRow('Dark theme', Object.entries(THEMES).filter(([, t]) => !t.light).map(([k, t]) => [k, t.label] as const), (v) => this.change({ themeDark: v }));
  private readonly accentRow = colorRow('Accent color', (hex) => { setAccent(hex); this.syncTheme(); });
  private readonly intensityRow = sliderRow('Accent intensity (%)', 0, 150, 5, (v) => setIntensity(v / 100), { def: 100 });
  private readonly sizeRow = selectRow('Interface text size', UI_FONT_SIZES.map(([k, t]) => [k, t] as const), (v) => this.change({ uiFontSize: v as UiFontSize }));
  private readonly animRow = toggleRow('Animations', (v) => this.change({ reduceMotion: !v }));

  private readonly rulerRow = toggleRow('Ruler', (v) => this.live('view.ruler', undefined, v !== this.rulerShown()));
  private readonly pagelessRow = toggleRow('Pageless view (one continuous sheet)', (v) => this.live('view.pageless', undefined, v !== this.pageless()));
  private readonly multiRow = toggleRow('Show pages side by side', (v) => this.live('view.multiPage', { on: v, pages: 2 }, true));
  private readonly gridRow = toggleRow('Gridlines', (v) => this.change({ gridlines: v }));
  private readonly gridStepRow = sliderRow('Gridline spacing (points)', 4, 144, 2, (v) => this.change({ gridSpacing: v }), { def: 18 });
  private readonly zoomRow = selectRow('Zoom', ZOOM_CHOICES, (v) => { this.change({ startZoom: Number(v) }); this.live('view.zoom', { percent: Number(v) }, true); });

  private readonly spellRow = toggleRow('Check spelling as you type', (v) => this.proofing({ spelling: v }));
  private readonly grammarRow = toggleRow('Check grammar, clarity and conciseness as you type', (v) => this.proofing({ grammar: v }));
  private readonly styleRow = selectRow('Writing style', STYLE_CHOICES, (v) => { void call('proofing.writingStyle', { style: v }).then(() => this.syncProofing()).catch(fail); });
  private readonly ruleRows = new Map<keyof GrammarRules, Row<boolean>>();
  private readonly acOnRow = toggleRow('AutoCorrect', (v) => this.proofing({ autocorrect: { enabled: v } }));
  private readonly acRows = new Map<keyof AutoCorrectRules, Row<boolean>>();
  private readonly dictBtn = buttonRow('Personal dictionary', 'Custom dictionary...', () => this.launch('proofing.dictionaryDialog'));
  private readonly acBtn = buttonRow('AutoCorrect entries', 'AutoCorrect options...', () => this.launch('proofing.autocorrectOptions'));

  private readonly cloudFolder = textRow('Cloud folder or WebDAV address', { placeholder: 'https://cloud.example.com/remote.php/dav/files/you/FormTxt/ or a folder', onCommit: () => undefined });
  private readonly cloudUser = textRow('User name (WebDAV only)', { onCommit: () => undefined });
  private readonly cloudPass = textRow('Password or app password (WebDAV only)', { type: 'password', onCommit: () => undefined });
  private readonly cloudApply = buttonRow('Apply cloud storage', 'Apply', () => this.applyCloud(), 'primary');
  private readonly cloudNote = nt('', true);
  private readonly versionsBtn = buttonRow('Version history', 'Open version history...', () => this.launch('versions.panel'));
  private readonly recoverBtn = buttonRow('Unsaved changes', 'Recover unsaved changes...', () => this.launch('file.recover'));

  private readonly langRow = selectRow('Document language', LANGUAGES.map((l) => [l.code, l.label] as const), (v) => { void call('proofing.setLanguage', { code: v, scope: 'document' }).catch(fail); });
  private readonly hyphenRow = toggleRow('Automatic hyphenation', (v) => this.live('proofing.hyphenation', { on: v }, true));
  private readonly ltrBtn = buttonRow('Selected paragraphs', 'Left to right', () => this.live('format.directionLtr', undefined, true));
  private readonly rtlBtn = buttonRow('Selected paragraphs', 'Right to left', () => this.live('format.directionRtl', undefined, true));

  private readonly motionRow = toggleRow('Reduce motion', (v) => this.change({ reduceMotion: v }));
  private readonly rateRow = sliderRow('Read aloud speed', 0.5, 3, 0.1, (v) => { void call('speech.rate', { rate: v }).catch(fail); }, { def: 1 });
  private readonly voiceRow = selectRow('Read aloud voice', [['', 'System default']], (v) => { void call('speech.voice', { voice: v }).catch(fail); });
  private readonly contrastBtn = buttonRow('High contrast', 'Use the High Contrast theme', () => { setTheme('contrast'); this.syncTheme(); });
  private readonly a11yBtn = buttonRow('Accessibility checker', 'Run the checker...', () => this.launch('access.check'));

  private readonly modeRow = selectRow('Editing mode', MODE_CHOICES, (v) => { void call('review.setMode', { mode: v }).catch(fail); });
  private readonly compatBtn = buttonRow('Older documents', 'Convert this document to the current format', () => this.live('exchange.convertCompat', undefined, true));

  private readonly ribbonBtn = buttonRow('Ribbon', 'Customize Ribbon...', () => this.launch('ribbon.customize'));
  private readonly qatBtn = buttonRow('Quick Access Toolbar', 'Customize Quick Access Toolbar...', () => this.launch('qat.customize'));
  private readonly keysBtn = buttonRow('Keyboard shortcuts', 'Customize keyboard shortcuts...', () => this.launch('help.shortcuts'));
  private readonly paletteBtn = buttonRow('Command search', 'Open Find a command', () => this.launch('edit.commandPalette'));
  private readonly addinList = el('<div class="ft-prefs-list" role="group" aria-label="Add-ins"></div>');
  private readonly addinEmpty = nt('No add-ins found.');
  private readonly addinBtn = buttonRow('Add-ins window', 'Manage add-ins...', () => this.launch('collab.addins'));

  private readonly shareName = textRow('Display name', { placeholder: 'Your name', onCommit: (v) => this.saveName(v) });

  private readonly aiOn = toggleRow('Turn on AI features', (v) => this.saveAi({ enabled: v }));
  private readonly aiProvider = selectRow('Provider', PROVIDER_CHOICES, (v) => this.saveAi({ provider: v, model: DEFAULT_MODEL[v] ?? '' }));
  private readonly aiUrl = textRow('Address (empty for the provider default)', { type: 'url', onCommit: (v) => this.saveAi({ baseUrl: v.trim() }) });
  private readonly aiModel = textRow('Model', { onCommit: (v) => this.saveAi({ model: v.trim() }) });
  private readonly aiEffort = selectRow('Default effort', EFFORT_CHOICES, (v) => this.saveAi({ effort: v }));
  private readonly aiKey = textRow('API key', { type: 'password', onCommit: (v) => { if (v.trim()) this.saveAi({ key: v.trim() }, true); } });
  private readonly aiKeyForget = buttonRow('Saved API key', 'Forget the key', () => this.saveAi({ clearKey: true }));
  private readonly aiImgUrl = textRow('Image address', { type: 'url', onCommit: (v) => this.saveAi({ imageBaseUrl: v.trim() }) });
  private readonly aiImgModel = textRow('Image model', { onCommit: (v) => this.saveAi({ imageModel: v.trim() }) });
  private readonly aiImgKey = textRow('Image API key', { type: 'password', onCommit: (v) => { if (v.trim()) this.saveAi({ imageKey: v.trim() }, true); } });
  private readonly aiImgKeyForget = buttonRow('Saved image key', 'Forget the image key', () => this.saveAi({ clearImageKey: true }));
  private readonly aiTest = buttonRow('Connection', 'Test connection', () => this.testAi());
  private readonly aiNote = nt('', true);

  private readonly stockRow = toggleRow('Search stock pictures online', (v) => this.saveEngine({ stockImages: v }));
  private readonly previewRow = toggleRow('Fetch link previews', (v) => this.saveEngine({ linkPreviews: v }));
  private readonly pexelsRow = textRow('Pexels API key', { type: 'password', onCommit: (v) => { if (v.trim()) this.saveEngine({ pexelsKey: v.trim() }, true); } });
  private readonly pexelsForget = buttonRow('Saved Pexels key', 'Forget the key', () => this.saveEngine({ pexelsKey: '' }));
  private readonly privacyNote = nt('', true);

  constructor() {
    const shell = this.shell;
    const frame = shell.frame;
    const rule = <K extends string>(map: Map<K, Row<boolean>>, key: K, label: string, set: (v: boolean) => void): HTMLElement => {
      const r = checkRow(label, set);
      map.set(key, r);
      return r.el;
    };
    const rules = el('<div class="ft-prefs-rules"></div>');
    for (const k of Object.keys(RULE_LABELS) as Array<keyof GrammarRules>) rules.append(rule(this.ruleRows, k, RULE_LABELS[k], (v) => this.proofing({ grammarRules: { [k]: v } })));
    const acRules = el('<div class="ft-prefs-rules"></div>');
    for (const k of Object.keys(AUTOCORRECT_LABELS) as Array<keyof AutoCorrectRules>) acRules.append(rule(this.acRows, k, AUTOCORRECT_LABELS[k], (v) => this.proofing({ autocorrect: { rules: { [k]: v } } })));

    for (const id of Object.keys(THEMES)) {
      const t = THEMES[id];
      const b = el<HTMLButtonElement>(`<button type="button" class="ft-prefs-swatch" data-theme-id="${id}" aria-label="${t.label}" title="${t.label}"></button>`);
      b.style.background = t.vars['--bg-secondary'];
      b.style.borderColor = t.vars['--border-color'];
      this.grid.appendChild(b);
    }
    this.grid.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]')?.dataset.themeId;
      if (!id) return;
      setTheme(id);
      this.syncTheme();
    });

    this.copyDir.addEventListener('click', () => { void navigator.clipboard?.writeText(this.dirRow.input.value).then(() => toast('Folder path copied.'), () => toast('Copy the path from the box.', 'error')); });
    this.dirRow.input.readOnly = true;
    const dirField = el('<div class="ft-prefs-store"></div>');
    dirField.append(this.dirRow.el, this.copyDir);
    this.resetBtn.addEventListener('click', () => this.reset());
    this.resetCancel.addEventListener('click', () => this.disarm());
    const resetRow = el('<div class="ft-prefs-field ft-prefs-action"><span>Everything FormTxt remembers in this window</span><span class="ft-prefs-reset"></span></div>');
    q(resetRow, '.ft-prefs-reset').append(this.resetCancel, this.resetBtn);

    const net = el('<div class="ft-prefs-net"></div>');
    net.appendChild(networkPreference());

    this.add('General',
      grp('Startup', this.homeRow.el, nt('Home lists your recent documents and templates. With this off, FormTxt starts on the empty workspace; Home is one click away (the Home button). Takes effect the next time FormTxt starts.')),
      grp('Personalize', this.nameRow.el, this.initialsNote, nt('The name is used as the author of new documents, in version history, on comments and tracked changes, and as your name when you share a document. Comments and tracked changes in a window that is already open pick the new name up after FormTxt restarts.')),
      grp('Settings storage', dirField, this.storeNote, nt('Documents, templates, versions and engine settings live in this folder. The window\'s own preferences (this page, the theme, the rail) stay in this browser or app window.')),
      grp('Reset', resetRow, nt('Resets this page, the theme and accent, the shortcuts and the toolbar layout kept in this window. Your documents, your name and the engine\'s saved keys are kept. FormTxt reloads.')));
    this.add('Interface',
      grp('Theme', this.grid, nt('Theme and accent are shared with other NodeMode apps on this device.'), this.autoRow.el, cols(this.lightRow.el, this.darkRow.el), nt('Match System Appearance switches between the light and dark theme chosen here when the appearance of the computer changes; picking a theme by hand stays until the next change.'), this.accentRow.el, this.intensityRow.el, nt('Intensity sets how strongly the accent tints what it marks, such as selected rows and the Home banner; 100% is the design\'s.')),
      grp('Text and Scale', this.sizeRow.el, nt('Text size scales the interface text, not the text of your documents (use Zoom for that).')),
      grp('Motion', this.animRow.el));
    this.add('Display',
      grp('Document view', this.rulerRow.el, this.pagelessRow.el, this.multiRow.el, nt('These act on the open document. Ruler shows or hides the ruler above the page; side by side needs every page to be the same size.', true)),
      grp('Page guides', this.gridRow.el, this.gridStepRow.el, nt('Gridlines line up text, pictures and shapes over the page body. They are never printed. Kept for every document.')),
      grp('Zoom', this.zoomRow.el, nt('The zoom FormTxt uses at start; choosing it also zooms the open document now.')));
    this.add('Proofing',
      grp('Spelling and grammar', this.spellRow.el, this.grammarRow.el, this.styleRow.el, nt('Writing style sets how strict the Editor is: casual skips formality, inclusive-language and vocabulary checks; professional adds inclusive language and vocabulary; formal also flags contractions, slang and casual words. It changes the checks below together.')),
      grp('Grammar and style checks', rules),
      grp('AutoCorrect', this.acOnRow.el, acRules),
      grp('Lists', this.dictBtn.el, this.acBtn.el));
    this.add('Save',
      grp('Cloud storage', this.cloudFolder.el, this.cloudUser.el, this.cloudPass.el, this.cloudApply.el, this.cloudNote, nt('Every save is also copied to this place: a WebDAV address (Nextcloud, ownCloud, Box, a NAS) or a synced folder such as Dropbox or OneDrive. Leave it empty to turn this off. The password is kept by the engine and never shown again.')),
      grp('Versions and recovery', this.versionsBtn.el, this.recoverBtn.el, nt('FormTxt saves your document a moment after each change and keeps earlier versions; open Version history to compare or restore one.')));
    this.add('Language',
      grp('Proofing language', this.langRow.el, this.hyphenRow.el, nt('These act on the open document. The language also chooses the dictionary and the hyphenation patterns.', true)),
      grp('Text direction', this.ltrBtn.el, this.rtlBtn.el));
    this.add('Accessibility',
      grp('Motion', this.motionRow.el, nt('Turns off transitions and animations everywhere in FormTxt. FormTxt also follows your system\'s reduced-motion setting.')),
      grp('Reading', this.rateRow.el, this.voiceRow.el, nt('Used by Read aloud.')),
      grp('Contrast', this.contrastBtn.el),
      grp('Checker', this.a11yBtn.el));
    this.add('Advanced',
      grp('Review', this.modeRow.el, nt('The mode of the open document. Suggesting records every edit as a tracked change.', true)),
      grp('Compatibility', this.compatBtn.el, nt('Brings a document opened from an older or compatibility format up to the current FormTxt format.')));
    this.add('Customize Ribbon',
      grp('Ribbon', this.ribbonBtn.el, nt('Choose which tabs, groups and commands the ribbon shows.')),
      grp('Quick Access Toolbar', this.qatBtn.el, nt('Pin the commands you use most next to the title.')));
    this.add('Keyboard',
      grp('Shortcuts', this.keysBtn.el, this.paletteBtn.el));
    this.add('Add-ins',
      grp('Installed add-ins', this.addinList, this.addinEmpty, this.addinBtn.el, nt('Add-ins run in a sandbox with only the permissions they declare. Install or remove them in the add-ins window.')));
    this.add('Sharing and Collaboration',
      grp('Your name', this.shareName.el, nt('Shown to other people next to your cursor and in the people list when you share a document. It is the same name as in General.')),
      grp('Other computers', net));
    this.add('AI',
      grp('Provider', this.aiOn.el, this.aiProvider.el, this.aiUrl.el, this.aiModel.el, this.aiEffort.el),
      grp('Key', this.aiKey.el, this.aiKeyForget.el, nt('The key is kept by the engine (in your system\'s password store where there is one) and is never shown again; only its last four characters appear.')),
      grp('Images', this.aiImgUrl.el, this.aiImgModel.el, this.aiImgKey.el, this.aiImgKeyForget.el),
      grp('Connection', this.aiTest.el, this.aiNote, nt('While AI is off, nothing is sent anywhere. When it is on, the text you ask about goes from this computer to the provider above.')));
    this.add('Privacy',
      grp('Online features', this.stockRow.el, this.previewRow.el, nt('Stock pictures contact Openverse and, with a key, Pexels, through the engine. Link previews fetch the title of a page you link to. Nothing else leaves this computer unless you turn on AI or cloud storage.')),
      grp('Pexels', this.pexelsRow.el, this.pexelsForget.el, this.privacyNote));

    const wrap = el('<div class="ft-prefs"></div>');
    wrap.append(this.pages);
    shell.body.appendChild(wrap);
    frame.classList.add('ft-prefs-dlg');

    let collapsed = false;
    try { collapsed = localStorage.getItem(RAIL_KEY) === '1'; } catch { collapsed = false; }
    const fold = el<HTMLButtonElement>(`<button class="ft-prefs-fold" type="button">${icon('pfFold', 16)}</button>`);
    const paintRail = (): void => {
      setClass(frame, 'is-rail-collapsed', collapsed);
      const title = collapsed ? 'Expand tabs' : 'Collapse tabs';
      if (fold.title !== title) { fold.title = title; fold.setAttribute('aria-label', title); }
      fold.setAttribute('aria-expanded', String(!collapsed));
    };
    fold.addEventListener('click', () => {
      collapsed = !collapsed;
      try { localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0'); } catch { void 0; }
      paintRail();
      this.queueWire();
    });
    paintRail();
    const rail = el('<div class="ft-prefs-rail"></div>');
    rail.append(this.nav, fold);
    const wire = el<HTMLElement>('<svg class="ft-prefs-wire" aria-hidden="true"><path class="ft-prefs-wire-shade"></path><path class="ft-prefs-wire-line"></path></svg>') as unknown as SVGSVGElement;
    const port = el('<span class="ft-prefs-port" aria-hidden="true"></span>');
    frame.append(rail, wire, port);
    this.wire = { rail, port, shade: q<SVGPathElement>(wire, '.ft-prefs-wire-shade'), line: q<SVGPathElement>(wire, '.ft-prefs-wire-line') };
    this.pages.addEventListener('scroll', () => this.queueSpy(), { passive: true });
    new ResizeObserver(() => this.queueWire()).observe(frame);
    window.addEventListener('resize', () => this.queueWire());
    this.done = shell.button('Done', 'primary', () => shell.close());
    shell.onClose = () => this.disarm();
    onProofingChange(() => { if (shell.isOpen) this.syncProofing(); });
    this.addinList.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const id = box.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (!id) return;
      void call('collab.addin.enable', { id, enabled: box.checked }).then(() => this.syncAddins()).catch((err) => { fail(err); void this.syncAddins(); });
    });
    this.markSection('General');
  }

  private add(name: string, ...content: HTMLElement[]): void {
    const def = SECTIONS.find((s) => s.name === name);
    const ic = def?.icon ?? 'pfGeneral';
    const tab = el<HTMLButtonElement>(`<button class="ft-prefs-railtab" type="button" role="tab"><span class="ft-prefs-tabicon">${icon(ic, 18)}</span><span class="ft-prefs-tablabel"></span></button>`);
    tab.dataset.section = name;
    setText(q(tab, '.ft-prefs-tablabel'), name);
    tab.title = name;
    tab.addEventListener('click', () => this.showSection(name, 'smooth'));
    this.nav.appendChild(tab);
    const page = el(`<section class="ft-prefs-sec" role="tabpanel"><button class="ft-prefs-sechead" type="button" aria-expanded="true"><span class="ft-prefs-secicon">${icon(ic, 16)}</span><span class="ft-prefs-seclabel"></span><span class="ft-prefs-chev">${icon('chevronDown', 16)}</span></button><div class="ft-prefs-secbody"></div></section>`);
    page.dataset.section = name;
    setText(q(page, '.ft-prefs-seclabel'), name);
    q(page, '.ft-prefs-sechead').addEventListener('click', () => this.foldSection(name));
    q(page, '.ft-prefs-secbody').append(...content);
    this.pages.appendChild(page);
    this.sections.set(name, page);
  }

  private change(patch: Partial<Prefs>): void {
    this.prefs = updatePrefs(patch);
    applyPrefs();
    this.syncPrefs();
  }

  private launch(id: string): void {
    this.shell.close();
    void call(id).catch(fail);
  }

  private live(id: string, params: Record<string, unknown> | undefined, run: boolean): void {
    if (run) void call(id, params).catch(fail);
    window.setTimeout(() => { if (this.shell.isOpen) this.syncLive(); }, 200);
  }

  private proofing(patch: Record<string, unknown>): void {
    void saveProofing(patch).then(() => this.syncProofing()).catch(fail);
  }

  private rulerShown(): boolean {
    const r = document.querySelector<HTMLElement>('.ft-ruler');
    return !!r && !r.hidden;
  }

  private pageless(): boolean {
    return document.querySelector<HTMLElement>('.ft-pages')?.dataset.mode === 'pageless';
  }

  private saveName(value: string): void {
    const author = value.trim();
    void api.post<EngineSettings>('/settings', { author }).then((s) => { this.engine = { ...this.engine, ...s }; forgetName(); this.syncEngine(); toast(author ? 'Your name is saved.' : 'Your name is cleared.'); }).catch(fail);
  }

  private saveEngine(patch: Record<string, unknown>, clearKeyInput = false): void {
    void api.post<EngineSettings>('/settings', patch).then((s) => {
      this.engine = { ...this.engine, ...s };
      if (clearKeyInput) this.pexelsRow.input.value = '';
      this.syncEngine();
    }).catch((e) => { fail(e); this.syncEngine(); });
  }

  private saveAi(patch: Record<string, unknown>, clearInputs = false): void {
    void saveAi(patch).then((st) => {
      this.ai = st;
      if (clearInputs) { this.aiKey.input.value = ''; this.aiImgKey.input.value = ''; }
      this.syncAi();
    }).catch((e) => { fail(e); void this.refreshAi(); });
  }

  private testAi(): void {
    setText(this.aiNote, 'Testing...');
    void api.post<{ model: string }>('/ai/test').then((r) => setText(this.aiNote, `Connected. The provider answered with model ${r.model}.`)).catch((e: Error) => setText(this.aiNote, e.message));
  }

  private applyCloud(): void {
    const folder = this.cloudFolder.input.value.trim();
    setText(this.cloudNote, 'Checking...');
    void api.post<{ folder: string }>('/versions/cloud', { folder, user: this.cloudUser.input.value.trim(), password: this.cloudPass.input.value }).then((r) => {
      this.cloudPass.input.value = '';
      setText(this.cloudNote, r.folder ? 'Every save also goes to cloud storage.' : 'Cloud storage is off.');
      void this.refreshCloud();
    }).catch((e: Error) => setText(this.cloudNote, e.message));
  }

  private reset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      setText(this.resetBtn, 'Click again to reset and reload');
      setClass(this.resetCancel, 'ft-prefs-invisible', false);
      return;
    }
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('formtxt.') || k.startsWith('ft.') || k === 'nodemode_ui_settings') localStorage.removeItem(k);
    } catch { void 0; }
    location.reload();
  }

  private disarm(): void {
    if (!this.resetArmed) return;
    this.resetArmed = false;
    setText(this.resetBtn, 'Reset All Preferences...');
    setClass(this.resetCancel, 'ft-prefs-invisible', true);
  }

  show(section?: string): void {
    this.prefs = loadPrefs();
    this.syncPrefs();
    this.syncTheme();
    this.syncProofing();
    this.syncLive();
    this.syncEngine();
    void this.refreshAll();
    const target = section && this.sections.has(section) ? section : '';
    if (target) this.showSection(target);
    this.shell.open(this.done);
    if (target) this.scrollToSection(target, 'auto');
    this.queueWire();
  }

  private async refreshAll(): Promise<void> {
    await Promise.all([this.refreshEngine(), this.refreshCloud(), this.refreshAi(), this.syncAddins(), this.refreshCapabilities()]);
  }

  private async refreshEngine(): Promise<void> {
    try { this.engine = await api.get<EngineSettings>('/settings'); } catch { return; }
    this.syncEngine();
  }

  private async refreshCapabilities(): Promise<void> {
    try {
      const c = await api.get<{ dataDir?: string }>('/capabilities');
      this.dirRow.set(c.dataDir ?? '');
    } catch { void 0; }
  }

  private async refreshCloud(): Promise<void> {
    try {
      const c = await api.get<CloudState>('/versions/cloud');
      this.cloudFolder.set(c.folder);
      this.cloudUser.set(c.user ?? '');
      const hint = c.passwordSet ? 'A password is saved; type a new one to replace it' : 'Password or app password';
      if (this.cloudPass.input.placeholder !== hint) this.cloudPass.input.placeholder = hint;
    } catch { void 0; }
  }

  private async refreshAi(): Promise<void> {
    try { this.ai = await loadAi(); } catch { return; }
    this.syncAi();
  }

  private syncPrefs(): void {
    const p = this.prefs;
    this.homeRow.set(p.homeAtLaunch);
    this.autoRow.set(p.themeAuto);
    this.lightRow.set(p.themeLight);
    this.darkRow.set(p.themeDark);
    this.sizeRow.set(p.uiFontSize);
    this.animRow.set(!p.reduceMotion);
    this.motionRow.set(p.reduceMotion);
    this.gridRow.set(p.gridlines);
    this.gridStepRow.set(p.gridSpacing);
    this.gridStepRow.setEnabled(p.gridlines);
    this.zoomRow.set(String(p.startZoom));
  }

  private syncTheme(): void {
    const c = readChoice();
    this.accentRow.set(c.accentColor);
    this.intensityRow.set(Math.round((c.intensity ?? 1) * 100));
    for (const b of Array.from(this.grid.children) as HTMLElement[]) {
      const id = b.dataset.themeId ?? '';
      const on = id === c.theme;
      setClass(b, 'is-active', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    }
  }

  private syncProofing(): void {
    const p = proofingPrefs();
    this.spellRow.set(p.spelling);
    this.grammarRow.set(p.grammar);
    const r = p.grammarRules;
    this.styleRow.set(r.formal ? 'formal' : !r.inclusive && !r.vocabulary ? 'casual' : 'professional');
    for (const [k, row] of this.ruleRows) row.set(r[k]);
    this.acOnRow.set(p.autocorrect.enabled);
    for (const [k, row] of this.acRows) { row.set(p.autocorrect.rules[k]); row.setEnabled(p.autocorrect.enabled); }
  }

  private syncLive(): void {
    const doc = hasDocument();
    this.rulerRow.set(this.rulerShown());
    this.pagelessRow.set(this.pageless());
    const pages = document.querySelector<HTMLElement>('.ft-pages');
    this.multiRow.set(pages?.dataset.multi === 'on');
    for (const r of [this.rulerRow, this.pagelessRow, this.multiRow]) r.setEnabled(doc);
    this.hyphenRow.set(document.querySelector('[data-hyphenate]')?.getAttribute('data-hyphenate') === 'on');
    for (const r of [this.langRow, this.hyphenRow, this.ltrBtn, this.rtlBtn, this.compatBtn, this.modeRow]) r.setEnabled(doc);
    this.modeRow.set(currentMode());
    if (doc && shellCommands.has('proofing.languageInfo')) void call('proofing.languageInfo').then((r) => { const d = (r as { document?: string }).document; if (d) this.langRow.set(d); }).catch(() => undefined);
    for (const [btn, id] of [[this.ribbonBtn, 'ribbon.customize'], [this.qatBtn, 'qat.customize'], [this.keysBtn, 'help.shortcuts'], [this.paletteBtn, 'edit.commandPalette'], [this.versionsBtn, 'versions.panel'], [this.recoverBtn, 'file.recover'], [this.dictBtn, 'proofing.dictionaryDialog'], [this.acBtn, 'proofing.autocorrectOptions'], [this.a11yBtn, 'access.check'], [this.addinBtn, 'collab.addins']] as const) btn.setEnabled(shellCommands.has(id) && (doc || !['versions.panel', 'file.recover', 'access.check'].includes(id)));
    this.compatBtn.setEnabled(doc && shellCommands.has('exchange.convertCompat'));
    const speech = shellCommands.has('speech.rate');
    this.rateRow.setEnabled(speech);
    this.voiceRow.setEnabled(speech);
    try { const rate = Number(localStorage.getItem('ft.speech.rate') ?? '1'); this.rateRow.set(Number.isFinite(rate) && rate > 0 ? rate : 1); } catch { void 0; }
    if (speech) void this.syncVoices();
  }

  private async syncVoices(): Promise<void> {
    try {
      const list = (await call('speech.voices')) as Array<{ name: string; lang: string; uri: string }>;
      const key = list.map((v) => v.uri).join('|');
      const sel = this.voiceRow.select;
      if (key !== this.voiceKey) {
        this.voiceKey = key;
        const keep = sel.value;
        const options = [['', 'System default'], ...list.map((v) => [v.uri, `${v.name} (${v.lang})`])];
        sel.replaceChildren(...options.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
        sel.value = keep;
      }
      let uri = '';
      try { uri = localStorage.getItem('ft.speech.voice') ?? ''; } catch { uri = ''; }
      this.voiceRow.set(list.some((v) => v.uri === uri) ? uri : '');
    } catch { void 0; }
  }

  private async syncAddins(): Promise<void> {
    if (!shellCommands.has('collab.addin.list')) { setHidden(this.addinEmpty, false); return; }
    let rows: AddinRow[] = [];
    try { rows = (await call('collab.addin.list')) as AddinRow[]; } catch { return; }
    patchList(this.addinList, rows, {
      key: (a) => a.id,
      create: () => el('<label class="ft-prefs-field ft-prefs-toggle-row"><span></span><span class="ft-prefs-toggle"><input type="checkbox"><span class="ft-prefs-toggle-track"><span class="ft-prefs-toggle-knob"></span></span></span></label>'),
      update: (node, a) => {
        setText(node.querySelector('span'), a.name);
        const box = node.querySelector<HTMLInputElement>('input');
        if (box && box.checked !== a.enabled) box.checked = a.enabled;
      },
    });
    setHidden(this.addinEmpty, rows.length > 0);
  }

  private syncEngine(): void {
    const e = this.engine;
    this.nameRow.set(e.author ?? '');
    this.shareName.set(e.author ?? '');
    setText(this.initialsNote, e.author ? `Initials: ${initialsOf(e.author)}` : 'Initials are made from your name.');
    this.stockRow.set(e.stockImages !== false);
    this.previewRow.set(e.linkPreviews !== false);
    const hint = e.pexelsKeySet ? (e.pexelsLast4 ? `Saved, ends in ${e.pexelsLast4}` : 'A key is saved; paste a new one to replace it') : 'Paste a free key from pexels.com/api';
    if (this.pexelsRow.input.placeholder !== hint) this.pexelsRow.input.placeholder = hint;
    this.pexelsForget.setEnabled(!!e.pexelsKeySet);
    const store = e.secretStore;
    const where = store ? (store.store === 'system' ? 'Keys are kept in your system\'s password store.' : 'Keys are kept in a file on this computer that only you can read.') : '';
    setText(this.privacyNote, where);
    setText(this.storeNote, where);
  }

  private syncAi(): void {
    const s = this.ai;
    if (!s) return;
    this.aiOn.set(s.enabled);
    this.aiProvider.set(s.provider);
    this.aiUrl.set(s.baseUrl);
    if (this.aiUrl.input.placeholder !== s.defaultBaseUrl) this.aiUrl.input.placeholder = s.defaultBaseUrl;
    this.aiModel.set(s.model);
    this.aiEffort.set(s.effort);
    const st = s as AIStatus & { keyLast4?: string; imageKeyLast4?: string };
    const keyHint = s.keySet ? (st.keyLast4 ? `Saved, ends in ${st.keyLast4}` : 'Saved') : s.provider === 'anthropic' ? 'Paste your Anthropic API key' : 'Optional for local servers';
    if (this.aiKey.input.placeholder !== keyHint) this.aiKey.input.placeholder = keyHint;
    this.aiKeyForget.setEnabled(s.keySet);
    this.aiImgUrl.set(s.imageBaseUrl);
    this.aiImgModel.set(s.imageModel);
    const imgHint = s.imageKeySet ? (st.imageKeyLast4 ? `Saved, ends in ${st.imageKeyLast4}` : 'Saved') : 'Uses the main key when empty';
    if (this.aiImgKey.input.placeholder !== imgHint) this.aiImgKey.input.placeholder = imgHint;
    this.aiImgKeyForget.setEnabled(s.imageKeySet);
    for (const r of [this.aiProvider, this.aiUrl, this.aiModel, this.aiEffort, this.aiKey, this.aiImgUrl, this.aiImgModel, this.aiImgKey, this.aiTest]) r.setEnabled(true);
  }

  private showSection(name: string, scroll: ScrollBehavior | null = null): void {
    if (!this.sections.has(name)) return;
    this.markSection(name);
    if (scroll) this.scrollToSection(name, scroll);
  }

  private markSection(name: string): void {
    if (this.current === name) return;
    this.current = name;
    for (const [n, page] of this.sections) setClass(page, 'is-current', n === name);
    for (const tab of Array.from(this.nav.children) as HTMLElement[]) {
      const on = tab.dataset.section === name;
      setClass(tab, 'is-active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    this.queueWire();
  }

  private scrollToSection(name: string, behavior: ScrollBehavior): void {
    const sec = this.sections.get(name);
    if (!sec) return;
    if (sec.classList.contains('is-folded')) this.foldSection(name);
    const top = sec.getBoundingClientRect().top - this.pages.getBoundingClientRect().top + this.pages.scrollTop - 12;
    this.spyMuted = performance.now() + 700;
    this.pages.scrollTo({ top, behavior });
  }

  private foldSection(name: string): void {
    const sec = this.sections.get(name);
    if (!sec) return;
    const folded = !sec.classList.contains('is-folded');
    setClass(sec, 'is-folded', folded);
    setHidden(q(sec, '.ft-prefs-secbody'), folded);
    q(sec, '.ft-prefs-sechead').setAttribute('aria-expanded', String(!folded));
    this.queueWire();
    this.queueSpy();
  }

  private queueSpy(): void {
    if (this.spyRaf) return;
    this.spyRaf = requestAnimationFrame(() => {
      this.spyRaf = 0;
      const pages = this.pages;
      if (!pages.clientHeight || performance.now() < this.spyMuted) return;
      const edge = pages.getBoundingClientRect().top + 24;
      const names = Array.from(this.sections.keys());
      let best = '';
      let bestD = Infinity;
      if (pages.scrollHeight > pages.clientHeight + 4 && pages.scrollTop + pages.clientHeight >= pages.scrollHeight - 2) best = names[names.length - 1] ?? '';
      else for (const [n, sec] of this.sections) {
        const top = sec.getBoundingClientRect().top;
        const d = top <= edge ? edge - top : top - edge + 100000;
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) this.markSection(best);
    });
  }

  private queueWire(): void {
    if (this.wireRaf) return;
    this.wireRaf = requestAnimationFrame(() => { this.wireRaf = 0; this.drawWire(); });
  }

  private drawWire(): void {
    const s = this.wire;
    if (!s || this.shell.scrim.hidden) return;
    const F = this.shell.frame.getBoundingClientRect();
    const tab = this.nav.querySelector<HTMLElement>('.ft-prefs-railtab.is-active');
    if (!F.width || !tab) return;
    if (getComputedStyle(s.port).display === 'none') return;
    const N = this.nav.getBoundingClientRect();
    let T = tab.getBoundingClientRect();
    if (T.top < N.top || T.bottom > N.bottom) {
      this.nav.scrollTop += T.top < N.top ? T.top - N.top - 6 : T.bottom - N.bottom + 6;
      T = tab.getBoundingClientRect();
    }
    const R = s.rail.getBoundingClientRect();
    const H = this.shell.head.getBoundingClientRect();
    const portY = Math.round(H.bottom - F.top);
    const sx = Math.round(T.right - F.left);
    const ty = Math.round(T.top - F.top + T.height / 2);
    const rr = R.right - F.left;
    const trunk = Math.round(rr - rr * 0.45);
    const dy = portY - ty;
    const r = 10;
    const dir = dy > 0 ? 1 : -1;
    const d = Math.abs(dy) < 2 * r ? `M ${sx} ${ty} H ${trunk} V ${portY} H -7` : `M ${sx} ${ty} H ${trunk - r} a ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${r} ${dir * r} V ${portY - dir * r} a ${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${r} ${dir * r} H -7`;
    if (d !== this.wireD) { this.wireD = d; s.shade.setAttribute('d', d); s.line.setAttribute('d', d); }
    if (portY !== this.portY) { this.portY = portY; s.port.style.transform = `translateY(${portY}px)`; }
  }
}

let instance: PrefsDialog | null = null;

export function openPreferences(section?: string): void {
  instance ??= new PrefsDialog();
  instance.show(section);
}

export function registerPrefsCommands(): void {
  for (const s of SECTIONS) {
    const id = `prefs.${s.id}`;
    if (commands.has(id)) continue;
    commands.register({
      id,
      label: `Preferences: ${s.name}`,
      group: 'App',
      description: `Open Preferences at the ${s.name} section.`,
      run: () => { openPreferences(s.name); return true; },
    });
  }
}

export { applyPrefs, loadPrefs } from './store';
