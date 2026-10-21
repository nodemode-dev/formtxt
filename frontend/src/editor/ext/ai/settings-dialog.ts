import { Dialog } from '../../../ui/dialog';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { api } from '../../../io/api';
import { loadStatus, saveSettings, type AIStatus } from './state';

export async function openSettings(): Promise<void> {
  const s = await loadStatus();
  const d = new Dialog('AI settings', 520);
  const on = el<HTMLInputElement>('<input type="checkbox" aria-label="Turn on AI">');
  const onRow = el('<label class="ft-pref-check"></label>');
  onRow.append(on, document.createTextNode(' Turn on AI features. While this is off, nothing is sent anywhere. When it is on, the text you ask about goes from this computer to the provider you set below.'));
  d.body.appendChild(onRow);
  const provider = el<HTMLSelectElement>('<select class="ft-input" aria-label="Provider"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI-compatible (OpenAI, Ollama, LM Studio)</option></select>');
  d.field('Provider', provider);
  const url = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" autocomplete="off">');
  d.field('Address (leave empty for the provider default)', url);
  const key = el<HTMLInputElement>('<input class="ft-input" type="password" autocomplete="off" spellcheck="false">');
  d.field('API key (stored on this computer, never shown again)', key);
  const model = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" autocomplete="off" list="ft-ai-models">');
  const list = el('<datalist id="ft-ai-models"></datalist>');
  d.field('Model', model);
  d.body.appendChild(list);
  const effort = el<HTMLSelectElement>('<select class="ft-input" aria-label="Effort"><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="thorough">Thorough</option></select>');
  d.field('Default effort', effort);
  const imgUrl = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" autocomplete="off" placeholder="Same as the provider when it is OpenAI-compatible">');
  d.field('Image address (OpenAI-compatible images endpoint)', imgUrl);
  const imgKey = el<HTMLInputElement>('<input class="ft-input" type="password" autocomplete="off" spellcheck="false">');
  d.field('Image API key (optional)', imgKey);
  const imgModel = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" autocomplete="off" placeholder="such as gpt-image-1">');
  d.field('Image model', imgModel);
  const note = el('<p class="ft-ai-note" aria-live="polite"></p>');
  d.body.appendChild(note);
  let cur: AIStatus = s;

  const paint = (st: AIStatus): void => {
    cur = st;
    on.checked = st.enabled;
    provider.value = st.provider;
    url.value = st.baseUrl;
    url.placeholder = st.defaultBaseUrl;
    key.placeholder = st.keySet ? 'A key is saved; paste a new one to replace it' : st.provider === 'anthropic' ? 'Paste your Anthropic API key' : 'Optional for local servers';
    model.value = st.model;
    effort.value = st.effort;
    imgUrl.value = st.imageBaseUrl;
    imgKey.placeholder = st.imageKeySet ? 'A key is saved; paste a new one to replace it' : 'Uses the main key when empty';
    imgModel.value = st.imageModel;
    list.replaceChildren(...st.models.map((m) => el(`<option value="${m}"></option>`)));
  };
  paint(s);
  provider.addEventListener('change', () => {
    url.placeholder = provider.value === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
    list.replaceChildren(...(provider.value === 'anthropic' ? ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'] : ['gpt-4o-mini', 'gpt-4o', 'llama3.2', 'qwen2.5']).map((m) => el(`<option value="${m}"></option>`)));
    if (provider.value !== cur.provider) model.value = provider.value === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini';
  });

  const patch = (): Record<string, unknown> => {
    const p: Record<string, unknown> = { enabled: on.checked, provider: provider.value, baseUrl: url.value.trim(), model: model.value.trim(), effort: effort.value, imageBaseUrl: imgUrl.value.trim(), imageModel: imgModel.value.trim() };
    if (key.value.trim()) p.key = key.value.trim();
    if (imgKey.value.trim()) p.imageKey = imgKey.value.trim();
    return p;
  };
  const save = async (): Promise<AIStatus> => {
    const st = await saveSettings(patch());
    key.value = '';
    imgKey.value = '';
    paint(st);
    return st;
  };
  const test = d.button('Test connection', 'ghost', () => {
    setText(note, 'Testing...');
    test.disabled = true;
    void save().then(() => api.post<{ model: string }>('/ai/test')).then((r) => setText(note, `Connected. The provider answered with model ${r.model}.`))
      .catch((e: Error) => setText(note, e.message)).finally(() => { test.disabled = false; });
  });
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Save', 'primary', () => {
    void save().then((st) => { d.close(); toast(st.enabled ? 'AI is on.' : 'AI is off.'); }).catch((e: Error) => setText(note, e.message));
  });
  setHidden(note, false);
  d.open(on);
}
