export const LANGUAGES: Array<[string, string]> = [['Spanish', 'es'], ['French', 'fr'], ['German', 'de'], ['Italian', 'it'], ['Portuguese', 'pt'], ['Dutch', 'nl'], ['Swedish', 'sv'], ['Polish', 'pl'], ['Turkish', 'tr'], ['Russian', 'ru'], ['Arabic', 'ar'], ['Hindi', 'hi'], ['Japanese', 'ja'], ['Korean', 'ko'], ['Chinese (Simplified)', 'zh-CN'], ['English', 'en']];

export const TABS: Array<[string, string]> = [['chat', 'Chat'], ['write', 'Write'], ['rewrite', 'Rewrite'], ['document', 'Document'], ['summary', 'Summary'], ['research', 'Research'], ['image', 'Image']];

export const PANEL_HTML = `<div class="ft-ai">
<div class="ft-ai-off" data-off><span>AI is off. Nothing leaves this computer until you turn it on.</span><button type="button" class="ft-btn sm primary" data-act="settings">AI settings</button></div>
<div class="ft-ai-tabs" role="tablist" aria-label="AI tools">${TABS.map(([id, label]) => `<button type="button" role="tab" class="ft-ai-tab" data-tab="${id}" aria-selected="false">${label}</button>`).join('')}</div>
<div class="ft-ai-views">

<section class="ft-ai-view" data-view="chat" role="tabpanel" hidden>
  <div class="ft-ai-row"><label class="ft-ai-label" for="ft-ai-scope">About</label>
  <select class="ft-input ft-ai-select" id="ft-ai-scope" data-q="scope"><option value="document">Whole document</option><option value="selection">Selection</option><option value="none">Nothing (general chat)</option></select>
  <button type="button" class="ft-btn sm ghost" data-act="clearChat" title="Clear this document's chat">Clear</button></div>
  <div class="ft-ai-log" data-q="log" aria-live="polite" aria-label="Conversation"></div>
  <div class="ft-ai-compose">
    <div class="ft-ai-chips" data-q="chatChips"></div>
    <textarea class="ft-input ft-ai-text" data-q="chatInput" rows="3" placeholder="Ask about this document. Type / or @ to add a library document." aria-label="Message"></textarea>
    <div class="ft-ai-row"><button type="button" class="ft-btn sm ghost" data-act="attach">Attach text file</button><span class="ft-ai-grow"></span><button type="button" class="ft-btn sm primary" data-ai data-act="send">Send</button></div>
  </div>
</section>

<section class="ft-ai-view" data-view="write" role="tabpanel" hidden>
  <p class="ft-ai-hint">Describe what to write. The text goes in at the caret and Undo takes it back.</p>
  <div class="ft-ai-wrap"><textarea class="ft-input ft-ai-text" data-q="writeInput" rows="5" placeholder="For example: a short intro for a quarterly update. Type / or @ to ground it in a library document." aria-label="Prompt"></textarea></div>
  <div class="ft-ai-chips" data-q="writeChips"></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm ghost" data-act="attach">Attach text file</button></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-ai data-act="draft">Draft at caret</button><button type="button" class="ft-btn sm" data-ai data-act="create">Create first draft</button></div>
  <p class="ft-ai-note" data-q="writeNote" aria-live="polite"></p>
</section>

<section class="ft-ai-view" data-view="rewrite" role="tabpanel" hidden>
  <p class="ft-ai-hint">Select text in the document, then choose a change.</p>
  <div class="ft-ai-grid">
    <button type="button" class="ft-btn sm" data-ai data-act="rewrite" data-mode="shorter">Shorter</button>
    <button type="button" class="ft-btn sm" data-ai data-act="rewrite" data-mode="longer">Longer</button>
    <button type="button" class="ft-btn sm" data-ai data-act="rewrite" data-mode="formal">More formal</button>
    <button type="button" class="ft-btn sm" data-ai data-act="rewrite" data-mode="casual">More casual</button>
    <button type="button" class="ft-btn sm" data-ai data-act="rewrite" data-mode="simpler">Simpler</button>
  </div>
  <div class="ft-ai-row"><input class="ft-input" data-q="custom" type="text" placeholder="Or say how to change it" aria-label="Custom instruction"><button type="button" class="ft-btn sm" data-ai data-act="rewriteCustom">Rewrite</button></div>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="styleFrom" aria-label="Style sample"><option value="document">Match the rest of the document</option><option value="pasted">Match a pasted sample</option></select><button type="button" class="ft-btn sm" data-ai data-act="matchStyle">Match style</button></div>
  <textarea class="ft-input ft-ai-text" data-q="styleSample" rows="3" placeholder="Paste a paragraph written in the style to copy" aria-label="Style sample text" hidden></textarea>
  <div class="ft-ai-card">
    <div class="ft-ai-card-head" data-q="pvTitle">Suggestion</div>
    <div class="ft-ai-card-body" data-q="pvText">Your suggestion appears here.</div>
    <div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-q="pvReplace" disabled>Replace</button><button type="button" class="ft-btn sm" data-q="pvBelow" disabled>Insert below</button><button type="button" class="ft-btn sm" data-q="pvRetry" disabled>Try again</button><button type="button" class="ft-btn sm ghost" data-q="pvDiscard" disabled>Discard</button></div>
  </div>
  <div class="ft-ai-sub">Word lookup</div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-ai data-act="lookup">Look up word at caret</button></div>
  <div class="ft-ai-card ft-ai-word">
    <div class="ft-ai-card-head" data-q="wordHead">Synonyms and meaning</div>
    <div class="ft-ai-card-body" data-q="wordDef">Select a word or put the caret in one.</div>
    <div class="ft-ai-chips ft-ai-syn" data-q="wordSyn"></div>
  </div>
</section>

<section class="ft-ai-view" data-view="document" role="tabpanel" hidden>
  <div class="ft-ai-sub">Edit the whole document</div>
  <textarea class="ft-input ft-ai-text" data-q="reviseInput" rows="3" placeholder="For example: use British spelling, or make every heading a question." aria-label="Instruction for the whole document"></textarea>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-ai data-act="revise">Propose changes</button><span class="ft-ai-grow"></span><button type="button" class="ft-btn sm" data-q="acceptAll" disabled>Accept all</button><button type="button" class="ft-btn sm" data-q="suggestAll" disabled title="Add every proposal as a tracked suggestion by AI">Suggest all</button><button type="button" class="ft-btn sm ghost" data-q="rejectAll" disabled>Reject all</button></div>
  <p class="ft-ai-note" data-q="reviseNote" aria-live="polite">Proposed changes appear here, paragraph by paragraph.</p>
  <div class="ft-ai-props" data-q="props"></div>
  <div class="ft-ai-sub">Translate</div>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="lang" aria-label="Language"></select><select class="ft-input ft-ai-select" data-q="tScope" aria-label="Translate what"><option value="document">Whole document as a new document</option><option value="selection">Selection (preview)</option></select></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-ai data-act="translate">Translate</button></div>
  <div class="ft-ai-sub">Match format from another document</div>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="fmtDoc" aria-label="Source document"></select></div>
  <label class="ft-pref-check"><input type="checkbox" data-q="fmtStyles" checked> Paragraph and character styles</label>
  <label class="ft-pref-check"><input type="checkbox" data-q="fmtPage" checked> Page size, margins and columns</label>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-act="matchFormat">Copy format</button></div>
  <p class="ft-ai-note" data-q="fmtNote" aria-live="polite"></p>
</section>

<section class="ft-ai-view" data-view="summary" role="tabpanel" hidden>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="sumScope" aria-label="Summarize what"><option value="document">Whole document</option><option value="selection">Selection</option></select><button type="button" class="ft-btn sm primary" data-ai data-act="summarize">Summarize</button></div>
  <div class="ft-ai-card"><div class="ft-ai-card-body" data-q="sumText">The summary appears here.</div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-q="sumInsert" disabled>Insert at caret</button><button type="button" class="ft-btn sm" data-q="sumBlock" disabled>Insert Summary block</button></div></div>
  <div class="ft-ai-sub">Listen</div>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="listenSrc" aria-label="What to read"><option value="document">Read the document</option><option value="selection">Read the selection</option><option value="overview">AI audio overview</option></select></div>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="voice" aria-label="Voice"></select><select class="ft-input ft-ai-rate" data-q="rate" aria-label="Speed"><option value="0.8">0.8x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option></select></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-act="play">Play</button><button type="button" class="ft-btn sm" data-q="pause" disabled>Pause</button><button type="button" class="ft-btn sm ghost" data-q="stop" disabled>Stop</button></div>
  <p class="ft-ai-note" data-q="listenNote" aria-live="polite"></p>
</section>

<section class="ft-ai-view" data-view="research" role="tabpanel" hidden>
  <div class="ft-ai-row"><input class="ft-input" data-q="rsInput" type="search" placeholder="Search your library" aria-label="Search your library"><button type="button" class="ft-btn sm" data-act="search">Search</button></div>
  <p class="ft-ai-note" data-q="rsNote" aria-live="polite">Searches titles and text of every document in your library, on this computer.</p>
  <div class="ft-ai-results" data-q="results"></div>
  <div class="ft-ai-sub">Ask about the results</div>
  <textarea class="ft-input ft-ai-text" data-q="rsAsk" rows="2" placeholder="Ask a question the top results can answer" aria-label="Question about the results"></textarea>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-ai data-act="rsAskGo">Ask</button></div>
  <div class="ft-ai-card"><div class="ft-ai-card-body" data-q="rsAnswer">The answer appears here, with the documents it used.</div><div class="ft-ai-src" data-q="rsSrc"></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-q="rsInsert" disabled>Insert at caret</button></div></div>
</section>

<section class="ft-ai-view" data-view="image" role="tabpanel" hidden>
  <div class="ft-ai-off" data-q="noImage" hidden><span>This provider has no image endpoint.</span><button type="button" class="ft-btn sm" data-act="stock">Stock images</button></div>
  <textarea class="ft-input ft-ai-text" data-q="imgPrompt" rows="4" placeholder="Describe the picture" aria-label="Picture description"></textarea>
  <div class="ft-ai-row"><select class="ft-input ft-ai-select" data-q="imgSize" aria-label="Shape"><option value="1024x1024">Square</option><option value="1536x1024">Wide</option><option value="1024x1536">Tall</option></select><button type="button" class="ft-btn sm primary" data-ai data-act="image">Generate and insert</button></div>
  <div class="ft-ai-sub">Banner</div>
  <div class="ft-ai-row"><input class="ft-input" data-q="bannerTitle" type="text" placeholder="Title under the banner (optional)" aria-label="Banner title"></div>
  <div class="ft-ai-row"><button type="button" class="ft-btn sm" data-ai data-act="banner">Insert banner at the top</button></div>
  <p class="ft-ai-note" data-q="imgNote" aria-live="polite"></p>
</section>

</div>
<div class="ft-ai-foot">
  <input class="ft-input" data-q="model" type="text" list="ft-ai-model-list" spellcheck="false" aria-label="Model" title="Model"><datalist id="ft-ai-model-list" data-q="modelList"></datalist>
  <select class="ft-input" data-q="effort" aria-label="Effort" title="Effort: fast, balanced or thorough"><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="thorough">Thorough</option></select>
  <button type="button" class="ft-btn sm ghost" data-act="settings" title="AI settings">Settings</button>
</div>
<input type="file" data-q="file" accept=".txt,.md,.markdown,.csv,.json,.html,.xml,text/*" hidden>
<p class="ft-ai-status" data-q="status" aria-live="polite"></p>
</div>`;
