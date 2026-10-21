import { Plugin } from 'prosemirror-state';
import type { CommandRegistry } from '../../engine/registry';
import { toast } from '../../ui/toast';
import type { DocEditor } from '../editor';
import { addPlugin, onDocumentLoaded } from './plugins';
import { addMenuItems, closePanel, openPanel, panelOpen } from './ui';
import { auditInterface, watchAnnouncements } from './proofing/aria';
import { accessibilityIssues, applyFix as applyAccess, goToIssue as goAccess } from './proofing/access';
import { accept, addToDictionary, changeAll, current, ignoreAll, ignoreOnce, isWalking, move, setCompleteHandler, startWalk } from './proofing/actions';
import { allEntries, autocorrectPlugins } from './proofing/autocorrect';
import { applyFix, counts, issuesOf, proofingPlugin, suggestionsFor, waitForScan } from './proofing/check';
import { autoCorrectDialog, customDictionaryDialog, languageDialog, proofingOptionsDialog, readabilityDialog } from './proofing/dialogs';
import { announce } from './proofing/kit';
import { LANGUAGES, applyDocumentSettings, directionAtSelection, docLanguage, hyphenation, insertSoftHyphen, languageAtSelection, setDirection, setHyphenation, setLanguage, toggleNoHyphen } from './proofing/layout';
import { ACCESS_PANEL, AccessPanel, EDITOR_PANEL, EditorPanel, editorScore } from './proofing/panels';
import { contextMenuHandler, openAtCaret } from './proofing/menu';
import { readability } from './proofing/readability';
import { semanticsPlugin } from './proofing/semantics';
import { ReadAloud, Voice, speakPlugin } from './proofing/speech';
import { addWord } from './proofing/spell';
import { clearIgnores, getPrefs, loadPrefs, savePrefs } from './proofing/state';
import type { Category } from './proofing/types';
import { READ_PANEL, ReadPanel, VOICE_PANEL, VoicePanel } from './proofing/voicepanels';

type P = Record<string, unknown>;
type ParamDef = { name: string; type: 'string' | 'number' | 'boolean'; description: string };

export function register(reg: CommandRegistry, ed: DocEditor): void {
  const add = (id: string, label: string, group: string, description: string, run: (p: P) => unknown, params: ParamDef[] = [], keys: string[] = []): void =>
    reg.register({ id, label, group, description, run, params, keys });

  let editorPanel: EditorPanel | null = null;
  let accessPanel: AccessPanel | null = null;
  let readPanel: ReadPanel | null = null;
  let voicePanel: VoicePanel | null = null;
  const reader = new ReadAloud(ed);
  const voice = new Voice(ed);

  const showEditor = (): EditorPanel => {
    if (!editorPanel) editorPanel = new EditorPanel(ed);
    if (!panelOpen(EDITOR_PANEL)) openPanel(EDITOR_PANEL, 'Editor', editorPanel.root);
    editorPanel.schedule();
    return editorPanel;
  };
  const showAccess = (): AccessPanel => {
    if (!accessPanel) accessPanel = new AccessPanel(ed);
    if (!panelOpen(ACCESS_PANEL)) openPanel(ACCESS_PANEL, 'Accessibility checker', accessPanel.root);
    accessPanel.run();
    return accessPanel;
  };
  const showRead = (): ReadPanel => {
    if (!readPanel) readPanel = new ReadPanel(ed, reader);
    if (!panelOpen(READ_PANEL)) openPanel(READ_PANEL, 'Read aloud', readPanel.root);
    readPanel.patch();
    return readPanel;
  };
  const showVoice = (): VoicePanel => {
    if (!voicePanel) voicePanel = new VoicePanel(ed, voice);
    if (!panelOpen(VOICE_PANEL)) openPanel(VOICE_PANEL, 'Dictate and transcribe', voicePanel.root);
    voicePanel.patch();
    return voicePanel;
  };

  addPlugin(proofingPlugin());
  addPlugin(semanticsPlugin(ed));
  addPlugin(speakPlugin());
  for (const pl of autocorrectPlugins()) addPlugin(pl);
  addPlugin(new Plugin({
    props: {
      handleDOMEvents: { contextmenu: contextMenuHandler(ed) },
      handleKeyDown: (_view, e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return openAtCaret(ed) ? (e.preventDefault(), true) : false;
        return false;
      },
    },
  }));

  setCompleteHandler(() => { void import('./proofing/dialogs').then((m) => m.readabilityDialog(ed)); });

  onDocumentLoaded(() => {
    clearIgnores();
    applyDocumentSettings(ed);
    accessPanel?.later();
  });
  void loadPrefs();
  watchAnnouncements(ed);
  ed.root.addEventListener('keyup', () => accessPanel?.later());

  document.addEventListener('keydown', (e) => {
    const inEditor = !!ed.view && ed.view.dom.contains(e.target as Node);
    if (e.key === 'F7' && !e.shiftKey && !e.ctrlKey && !e.altKey && !ed.root.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      void reg.run('proofing.checkDocument').catch((err: Error) => toast(err.message, 'error'));
      return;
    }
    if (!inEditor) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === '-' || e.code === 'Minus')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      insertSoftHyphen(ed);
      return;
    }
    if (e.ctrlKey && e.key === 'Shift' && !e.altKey) {
      if (e.code === 'ShiftRight') setDirection(ed, 'rtl');
      else if (e.code === 'ShiftLeft') setDirection(ed, 'ltr');
    }
  }, true);

  add('proofing.checkDocument', 'Check spelling and grammar', 'Tools', 'Open the Editor panel and walk through each spelling, grammar, clarity and conciseness suggestion from the start of the document. Shows readability statistics at the end.', async () => {
    showEditor();
    const first = await startWalk(ed);
    return { issues: ed.view ? issuesOf(ed.view.state).length : 0, first: first ? { category: first.cat, text: first.text, message: first.message } : null };
  }, [], ['F7']);
  add('proofing.editorPanel', 'Editor', 'Tools', 'Show or hide the Editor panel with the score, counts by category and every suggestion.', () => {
    if (panelOpen(EDITOR_PANEL)) { closePanel(EDITOR_PANEL); return false; }
    showEditor();
    return true;
  });
  add('proofing.score', 'Editor score', 'Tools', 'Return the Editor score and the number of suggestions in each category without opening the panel.', async () => {
    await waitForScan();
    const view = ed.view;
    if (!view) throw new Error('Open a document first.');
    const c = counts(view.state);
    return { score: editorScore(c, ed.words()), counts: c };
  });
  add('proofing.issues', 'List suggestions', 'Tools', 'List every spelling, grammar, clarity and conciseness suggestion, with its text, message and automatic fixes.', async (p) => {
    await waitForScan();
    const view = ed.view;
    if (!view) throw new Error('Open a document first.');
    const want = String(p.category ?? '');
    return issuesOf(view.state).filter((i) => !want || i.cat === want).map((i, n) => ({ index: n, category: i.cat, rule: i.rule, text: i.text, message: i.message, fixes: i.fixes.map((f) => f.label), from: i.from, to: i.to }));
  }, [{ name: 'category', type: 'string', description: 'spelling, grammar, clarity or conciseness; empty for all' }]);
  const pickIssue = (p: P) => {
    const view = ed.view;
    if (!view) throw new Error('Open a document first.');
    if (p.issue !== undefined && p.issue !== '') {
      const all = issuesOf(view.state);
      const hit = all[Number(p.issue)];
      if (!hit) throw new Error(`There is no suggestion number ${String(p.issue)}. List them with proofing.issues.`);
      return hit;
    }
    const cur = current(ed);
    if (!cur) throw new Error('Put the cursor in a marked word or run proofing.nextIssue first.');
    return cur;
  };
  const issueParam: ParamDef = { name: 'issue', type: 'number', description: 'Index from proofing.issues; defaults to the suggestion at the cursor' };
  add('proofing.nextIssue', 'Next suggestion', 'Tools', 'Move to the next spelling or grammar suggestion.', (p) => {
    const hit = move(ed, 1, (String(p.category ?? '') || undefined) as Category | undefined);
    return hit ? { category: hit.cat, text: hit.text, message: hit.message } : null;
  }, [{ name: 'category', type: 'string', description: 'Only this category' }]);
  add('proofing.previousIssue', 'Previous suggestion', 'Tools', 'Move to the previous spelling or grammar suggestion.', (p) => {
    const hit = move(ed, -1, (String(p.category ?? '') || undefined) as Category | undefined);
    return hit ? { category: hit.cat, text: hit.text, message: hit.message } : null;
  }, [{ name: 'category', type: 'string', description: 'Only this category' }]);
  add('proofing.fix', 'Apply suggestion', 'Tools', 'Apply a suggestion to the suggestion at the cursor (or the one named by issue). suggestion is the 0-based choice from the list of replacements.', async (p) => {
    const cur = pickIssue(p);
    return accept(ed, cur, Number(p.suggestion ?? 0));
  }, [issueParam, { name: 'suggestion', type: 'number', description: '0-based replacement to apply; default 0' }]);
  add('proofing.changeAll', 'Change all', 'Tools', 'Replace every occurrence of the misspelled word or flagged phrase at the cursor with a replacement.', async (p) => {
    const cur = pickIssue(p);
    const text = p.text !== undefined ? String(p.text) : (await suggestionsFor(cur))[Number(p.suggestion ?? 0)];
    if (text === undefined) throw new Error('Give text or a valid suggestion number.');
    return changeAll(ed, cur, text);
  }, [issueParam, { name: 'text', type: 'string', description: 'Replacement text' }, { name: 'suggestion', type: 'number', description: 'Or the 0-based suggestion to use' }]);
  add('proofing.fixAll', 'Apply all automatic fixes', 'Tools', 'Apply the first automatic fix for every grammar, clarity and conciseness suggestion that has one, and optionally the first suggested spelling.', async (p) => {
    await waitForScan();
    const view = ed.view;
    if (!view) throw new Error('Open a document first.');
    const withSpelling = !!p.spelling;
    const all = issuesOf(view.state).filter((i) => i.cat === 'spelling' ? withSpelling : i.fixes.length > 0).reverse();
    let n = 0;
    for (const i of all) {
      if (i.cat === 'spelling') {
        const s = (await suggestionsFor(i))[0];
        if (s) { view.dispatch(view.state.tr.insertText(s, i.from, i.to)); n++; }
      } else if (applyFix(view, i, 0)) n++;
    }
    return n;
  }, [{ name: 'spelling', type: 'boolean', description: 'Also take the first spelling suggestion' }]);
  add('proofing.ignoreOnce', 'Ignore once', 'Tools', 'Stop marking this occurrence of the suggestion at the cursor.', (p) => { ignoreOnce(ed, pickIssue(p)); return true; }, [issueParam]);
  add('proofing.ignoreAll', 'Ignore all', 'Tools', 'Stop marking this word or phrase everywhere until the document is closed.', (p) => { ignoreAll(ed, pickIssue(p)); return true; }, [issueParam]);
  add('proofing.addToDictionary', 'Add to dictionary', 'Tools', 'Add a word to the personal dictionary kept by the engine. With no word it adds the misspelled word at the cursor.', async (p) => {
    if (p.word) { const w = String(p.word).trim(); await addWord(w); await savePrefs({}); return w; }
    const cur = pickIssue(p);
    await addToDictionary(ed, cur);
    return cur.text;
  }, [{ name: 'word', type: 'string', description: 'Word to add; defaults to the word at the cursor' }, issueParam]);
  add('proofing.removeFromDictionary', 'Remove from dictionary', 'Tools', 'Remove a word from the personal dictionary.', async (p) => { await addWord(String(p.word ?? ''), true); await savePrefs({}); return getPrefs().dictionary; }, [{ name: 'word', type: 'string', description: 'Word to remove' }]);
  add('proofing.dictionary', 'Personal dictionary', 'Tools', 'Return the words in the personal dictionary.', async () => { await loadPrefs(); return getPrefs().dictionary; });
  add('proofing.dictionaryDialog', 'Custom dictionary', 'Tools', 'Open the custom dictionary to add or remove words.', () => { customDictionaryDialog(); return true; });
  add('proofing.suggestions', 'Show suggestions', 'Tools', 'Open the suggestions menu for the marked word at the cursor.', () => openAtCaret(ed), [], ['Shift+F10']);
  add('proofing.spelling', 'Check spelling as you type', 'Tools', 'Turn the spelling underlines on or off.', async (p) => { const on = p.on === undefined ? !getPrefs().spelling : !!p.on; await savePrefs({ spelling: on }); return on; }, [{ name: 'on', type: 'boolean', description: 'true to turn on; omit to toggle' }]);
  add('proofing.grammar', 'Check grammar as you type', 'Tools', 'Turn the grammar, clarity and conciseness underlines on or off.', async (p) => { const on = p.on === undefined ? !getPrefs().grammar : !!p.on; await savePrefs({ grammar: on }); return on; }, [{ name: 'on', type: 'boolean', description: 'true to turn on; omit to toggle' }]);
  add('proofing.rule', 'Turn a grammar rule on or off', 'Tools', 'Switch one rule: repeated, article, capital, spaces, punctuation, long, passive, wordy or confusion.', async (p) => {
    const rule = String(p.rule ?? '');
    if (!(rule in getPrefs().grammarRules)) throw new Error(`Unknown rule ${rule}. Use one of ${Object.keys(getPrefs().grammarRules).join(', ')}.`);
    await savePrefs({ grammarRules: { [rule]: !!p.on } });
    return getPrefs().grammarRules;
  }, [{ name: 'rule', type: 'string', description: 'Rule name' }, { name: 'on', type: 'boolean', description: 'true to turn on' }]);
  add('proofing.options', 'Spelling and grammar options', 'Tools', 'Open the spelling and grammar options.', () => { proofingOptionsDialog(ed); return true; });

  add('proofing.language', 'Language', 'Tools', 'Open the language chooser for the selection or the whole document.', () => { languageDialog(ed); return true; });
  add('proofing.setLanguage', 'Set language', 'Tools', 'Set the proofing language of the selection, or of the document with scope document. An empty code on a selection returns it to the document language.', (p) =>
    setLanguage(ed, String(p.code ?? ''), p.scope === 'document' ? 'document' : 'selection'), [
    { name: 'code', type: 'string', description: `Language tag such as ${LANGUAGES.slice(0, 4).map((l) => l.code).join(', ')}` },
    { name: 'scope', type: 'string', description: 'selection (default) or document' },
  ]);
  add('proofing.doNotCheck', 'Do not check spelling or grammar', 'Tools', 'Mark the selection so spelling and grammar checks skip it, or clear the mark with on false.', (p) => {
    const on = p.on === undefined ? languageAtSelection(ed) !== 'zxx' : !!p.on;
    return setLanguage(ed, on ? 'zxx' : '', 'selection');
  }, [{ name: 'on', type: 'boolean', description: 'true to skip checking; false to check again; omit to toggle' }]);
  add('proofing.languageInfo', 'Language information', 'Tools', 'Return the document language and the language at the selection.', () => ({ document: docLanguage(ed), selection: languageAtSelection(ed) }));

  add('proofing.hyphenation', 'Automatic hyphenation', 'Tools', 'Turn automatic hyphenation of the whole document on or off. Hyphenation follows the language of the text.', (p) => setHyphenation(ed, p.on === undefined ? !hyphenation(ed) : !!p.on), [{ name: 'on', type: 'boolean', description: 'true to turn on; omit to toggle' }]);
  add('proofing.noHyphenate', 'Do not hyphenate this paragraph', 'Tools', 'Keep the selected paragraphs from being hyphenated automatically.', (p) => toggleNoHyphen(ed, p.on === undefined ? undefined : !!p.on), [{ name: 'on', type: 'boolean', description: 'true to stop hyphenation; omit to toggle' }]);
  add('proofing.softHyphen', 'Insert optional hyphen', 'Tools', 'Insert a soft hyphen (U+00AD) that shows only where a word breaks at the end of a line.', () => insertSoftHyphen(ed), [], ['Ctrl+-']);

  add('proofing.autocorrectOptions', 'AutoCorrect options', 'Tools', 'Open the AutoCorrect options.', () => { autoCorrectDialog(); return true; });
  add('autocorrect.list', 'List AutoCorrect entries', 'Tools', 'List every AutoCorrect entry with whether it is on and the rule switches.', () => ({ enabled: getPrefs().autocorrect.enabled, rules: getPrefs().autocorrect.rules, entries: allEntries() }));
  add('autocorrect.add', 'Add AutoCorrect entry', 'Tools', 'Add or change an AutoCorrect entry.', async (p) => {
    const from = String(p.from ?? '').trim();
    if (!from || /\s/.test(from) || !String(p.to ?? '')) throw new Error('Give from (no spaces) and to.');
    const a = getPrefs().autocorrect;
    await savePrefs({ autocorrect: { entries: { ...a.entries, [from]: String(p.to) }, removed: a.removed.filter((x) => x !== from), disabled: a.disabled.filter((x) => x !== from) } });
    return true;
  }, [{ name: 'from', type: 'string', description: 'Text to replace, without spaces' }, { name: 'to', type: 'string', description: 'Replacement' }]);
  add('autocorrect.remove', 'Remove AutoCorrect entry', 'Tools', 'Remove an AutoCorrect entry (a built-in entry is hidden).', async (p) => {
    const from = String(p.from ?? '');
    const a = getPrefs().autocorrect;
    if (from in a.entries) { const entries = { ...a.entries }; delete entries[from]; await savePrefs({ autocorrect: { entries } }); } else await savePrefs({ autocorrect: { removed: [...a.removed, from] } });
    return true;
  }, [{ name: 'from', type: 'string', description: 'Entry to remove' }]);
  add('autocorrect.toggle', 'Turn an AutoCorrect entry on or off', 'Tools', 'Switch one AutoCorrect entry without removing it.', async (p) => {
    const from = String(p.from ?? '');
    const a = getPrefs().autocorrect;
    const on = p.on === undefined ? a.disabled.includes(from) : !!p.on;
    await savePrefs({ autocorrect: { disabled: on ? a.disabled.filter((x) => x !== from) : [...a.disabled, from] } });
    return on;
  }, [{ name: 'from', type: 'string', description: 'Entry' }, { name: 'on', type: 'boolean', description: 'true to use it' }]);
  add('autocorrect.rule', 'Turn an AutoCorrect rule on or off', 'Tools', 'Switch a rule: list, smartQuotes, dashes, symbols, arrows, fractions, capitalize or ellipsis. Rule enabled switches the whole feature.', async (p) => {
    const rule = String(p.rule ?? '');
    if (rule === 'enabled') await savePrefs({ autocorrect: { enabled: !!p.on } });
    else if (rule in getPrefs().autocorrect.rules) await savePrefs({ autocorrect: { rules: { [rule]: !!p.on } } });
    else throw new Error(`Unknown rule ${rule}.`);
    return getPrefs().autocorrect;
  }, [{ name: 'rule', type: 'string', description: 'Rule name or enabled' }, { name: 'on', type: 'boolean', description: 'true to turn on' }]);

  add('proofing.readability', 'Readability statistics', 'Tools', 'Show Flesch Reading Ease, Flesch-Kincaid Grade Level, passive sentences and averages for the current tab.', () => {
    const view = ed.view;
    if (!view) throw new Error('Open a document first.');
    readabilityDialog(ed);
    return readability(view.state.doc);
  });

  add('format.directionLtr', 'Left-to-right text', 'Format', 'Make the selected paragraphs read left to right.', () => setDirection(ed, 'ltr'), [], ['Ctrl+Left Shift']);
  add('format.directionRtl', 'Right-to-left text', 'Format', 'Make the selected paragraphs read right to left, mirroring alignment, indents and lists.', () => setDirection(ed, 'rtl'), [], ['Ctrl+Right Shift']);
  add('format.direction', 'Text direction', 'Format', 'Set the direction of the selected paragraphs to ltr or rtl, or return the current direction with no value.', (p) => (p.dir ? setDirection(ed, p.dir === 'rtl' ? 'rtl' : 'ltr') : directionAtSelection(ed)), [{ name: 'dir', type: 'string', description: 'ltr or rtl' }]);

  add('speech.readAloud', 'Read aloud', 'Tools', 'Read the selection, or from the cursor to the end, with the system voices. Shows the Read aloud panel.', async () => { showRead(); return reader.start(); });
  add('speech.panel', 'Read aloud panel', 'Tools', 'Show or hide the Read aloud panel.', () => { if (panelOpen(READ_PANEL)) { closePanel(READ_PANEL); return false; } showRead(); return true; });
  add('speech.pause', 'Pause reading', 'Tools', 'Pause reading aloud.', () => reader.pause());
  add('speech.resume', 'Resume reading', 'Tools', 'Resume reading aloud.', () => reader.resume());
  add('speech.stop', 'Stop reading', 'Tools', 'Stop reading aloud.', () => reader.stop());
  add('speech.rate', 'Reading speed', 'Tools', 'Set the reading speed from 0.5 to 3 (1 is normal).', (p) => reader.setRate(Number(p.rate ?? 1)), [{ name: 'rate', type: 'number', description: 'Speed multiplier' }]);
  add('speech.voice', 'Reading voice', 'Tools', 'Choose a voice by its voiceURI or name; empty for the system default.', (p) => {
    const want = String(p.voice ?? '');
    const v = reader.voices().find((x) => x.voiceURI === want || x.name === want);
    reader.setVoice(v ? v.voiceURI : '');
    return reader.voiceURI;
  }, [{ name: 'voice', type: 'string', description: 'Voice name or URI' }]);
  add('speech.voices', 'List voices', 'Tools', 'List the speech voices installed for this browser.', () => reader.voices().map((v) => ({ name: v.name, lang: v.lang, uri: v.voiceURI })));

  add('dictation.start', 'Start dictation', 'Tools', 'Start voice typing at the cursor with the browser\'s speech recognition (it may use the browser maker\'s online service).', () => { showVoice(); voice.mode = 'dictate'; voice.start('dictate'); return true; });
  add('dictation.stop', 'Stop dictation', 'Tools', 'Stop voice typing.', () => voice.stop());
  add('dictation.toggle', 'Dictate', 'Tools', 'Open the dictation panel and start or stop voice typing.', () => { showVoice(); if (voice.active) return voice.stop(); voice.mode = 'dictate'; voice.start('dictate'); return true; });
  add('transcribe.panel', 'Transcribe', 'Tools', 'Open the panel that transcribes the microphone, or an audio file where the browser allows it, into a transcript with timestamps.', () => { showVoice(); voice.mode = 'transcribe'; voicePanel?.patch(); return true; });
  add('transcribe.start', 'Start transcription', 'Tools', 'Transcribe the microphone into timestamped paragraphs after the cursor.', () => { showVoice(); voice.start('transcribe'); return true; });
  add('transcribe.stop', 'Stop transcription', 'Tools', 'Stop transcribing.', () => voice.stop());
  add('voice.status', 'Voice typing status', 'Tools', 'Report whether speech recognition and speech synthesis exist in this browser and the state of dictation.', () => ({ recognition: voice.supported(), synthesis: reader.supported(), voices: reader.voices().length, active: voice.active, mode: voice.mode, error: voice.error }));

  add('access.check', 'Accessibility checker', 'Tools', 'Open the accessibility checker and return the issues it finds.', () => {
    const panel = showAccess();
    return panel.list().map((i, n) => ({ index: n, level: i.level, rule: i.rule, message: i.message, fix: i.fixLabel }));
  });
  add('access.panel', 'Accessibility panel', 'Tools', 'Show or hide the accessibility checker panel.', () => { if (panelOpen(ACCESS_PANEL)) { closePanel(ACCESS_PANEL); return false; } showAccess(); return true; });
  add('access.issues', 'List accessibility issues', 'Tools', 'Run the accessibility checks without opening the panel.', () => accessibilityIssues(ed).map((i, n) => ({ index: n, level: i.level, rule: i.rule, message: i.message, fix: i.fixLabel })));
  add('access.goTo', 'Go to accessibility issue', 'Tools', 'Move the cursor to an accessibility issue by index from access.issues.', (p) => {
    const list = accessibilityIssues(ed);
    const i = list[Number(p.index ?? 0)];
    if (!i || !ed.view) throw new Error('There is no such issue.');
    goAccess(ed.view, i);
    return i.message;
  }, [{ name: 'index', type: 'number', description: 'Issue index' }]);
  add('access.fix', 'Fix accessibility issue', 'Tools', 'Fix an accessibility issue by index. Issues that need text (alt text, a title, link text) take value.', (p) => {
    const list = accessibilityIssues(ed);
    const i = list[Number(p.index ?? 0)];
    if (!i) throw new Error('There is no such issue.');
    if (!i.fix) throw new Error('This issue has no automatic fix. Use access.goTo and edit it by hand.');
    const ok = applyAccess(ed, i, String(p.value ?? ''));
    accessPanel?.later();
    if (!ok) throw new Error('The fix needs a value.');
    return true;
  }, [{ name: 'index', type: 'number', description: 'Issue index from access.issues' }, { name: 'value', type: 'string', description: 'Text for alt text, title or link text fixes' }]);
  add('access.auditInterface', 'Audit the interface for screen readers', 'Tools', 'Scan the visible interface for controls without names, unlabelled form fields and dialogs, and other screen reader problems.', () => auditInterface(document));
  add('access.announce', 'Announce a message', 'Tools', 'Send a message to screen readers through the live region.', (p) => { announce(String(p.message ?? ''), !!p.urgent); return true; }, [{ name: 'message', type: 'string', description: 'Text to announce' }, { name: 'urgent', type: 'boolean', description: 'Interrupt the screen reader' }]);

  addMenuItems('Tools', [
    { cmd: 'proofing.checkDocument', label: 'Check spelling and grammar', keys: 'F7' },
    { cmd: 'proofing.editorPanel', label: 'Editor' },
    { cmd: 'proofing.language', label: 'Language' },
    { cmd: 'proofing.options', label: 'Spelling and grammar options' },
    { cmd: 'proofing.dictionaryDialog', label: 'Custom dictionary' },
    { cmd: 'proofing.autocorrectOptions', label: 'AutoCorrect options' },
  ]);
  addMenuItems('Tools', [
    { cmd: 'proofing.hyphenation', label: 'Automatic hyphenation' },
    { cmd: 'proofing.noHyphenate', label: 'Do not hyphenate this paragraph' },
    { cmd: 'proofing.softHyphen', label: 'Insert optional hyphen', keys: 'Ctrl+-' },
  ]);
  addMenuItems('Tools', [
    { cmd: 'speech.readAloud', label: 'Read aloud' },
    { cmd: 'dictation.toggle', label: 'Dictate' },
    { cmd: 'transcribe.panel', label: 'Transcribe' },
  ]);
  addMenuItems('Tools', [
    { cmd: 'proofing.readability', label: 'Readability statistics' },
    { cmd: 'access.check', label: 'Accessibility checker' },
  ]);
  addMenuItems('Format', [
    { cmd: 'format.directionLtr', label: 'Left-to-right text', keys: 'Ctrl+Left Shift' },
    { cmd: 'format.directionRtl', label: 'Right-to-left text', keys: 'Ctrl+Right Shift' },
  ]);
}
