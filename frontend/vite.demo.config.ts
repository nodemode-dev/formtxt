import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const DEMO_PORT = 5213;
const SHARED = 'review';
const PAGES: Record<string, { out: string; title: string }> = {
  review: { out: '../demo', title: 'FormTxt demo: A report under review' },
  paper: { out: '../demos/paper', title: 'FormTxt demo: A paper with references' },
  newsletter: { out: '../demos/newsletter', title: 'FormTxt demo: A two-column newsletter' },
};

const demoPage = (mode: string): Plugin => ({
  name: 'formtxt-demo-page',
  enforce: 'pre',
  transform(html, id) {
    if (!id.endsWith('/frontend/index.html')) return null;
    return html
      .replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="../demo/src/main.ts"></script>')
      .replace(/\s*<link rel="(?:icon|apple-touch-icon|preload|manifest)"[^>]*>/g, '')
      .replace('</title>', '</title>\n  <link rel="icon" href="data:,">')
      .replace(/<html([^>]*)>/, `<html$1 data-demo="building" data-demo-id="${mode}">`)
      .replace('</head>', '  <style>html[data-demo="building"] #app { visibility: hidden !important; } html[data-demo="building"]::before { content: "Starting FormTxt"; position: fixed; left: 0; right: 0; top: calc(50% - 30px); font: 13px -apple-system, "Segoe UI", system-ui, sans-serif; color: #a4a4a4; text-align: center; } html[data-demo="building"]::after { content: ""; position: fixed; left: calc(50% - 90px); top: calc(50% - 2px); width: 180px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #f97316, #fdba74) 0 0 / 60px 3px no-repeat #222127; animation: demo-start 1.4s ease-in-out infinite alternate; } @keyframes demo-start { to { background-position: 120px 0; } }</style>\n</head>')
      .replace(/<title>[^<]*<\/title>/, `<title>${PAGES[mode].title}</title>`);
  },
});

const COVER = '`${import.meta.env.BASE_URL}demos/${d.id}.webp`';
const demoCovers = (): Plugin => ({
  name: 'formtxt-demo-covers',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/frontend/src/demos/index.ts')) return null;
    if (!code.includes(COVER)) this.error('formtxt-demo-covers: demoCover in src/demos/index.ts changed; update vite.demo.config.ts.');
    return { code: `const DEMO_COVERS = import.meta.glob<string>('../../public/demos/*.webp', { query: '?url', import: 'default', eager: true });\n${code.replace(COVER, 'DEMO_COVERS[`../../public/demos/${d.id}.webp`]')}`, map: null };
  },
});

const PACK = /\/frontend\/src\/data\/([\w-]+)\.json$/;
const dataPacks = (mode: string): Plugin => {
  const files = new Map<string, string>();
  return {
    name: 'formtxt-demo-data-packs',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('.json?url') || !importer) return null;
      const found = await this.resolve(source.slice(0, -4), importer, { skipSelf: true });
      const name = found && PACK.exec(found.id)?.[1];
      if (!found || !name) return null;
      files.set(name, found.id);
      return `\0formtxt-pack:${name}`;
    },
    load(id) {
      if (!id.startsWith('\0formtxt-pack:')) return null;
      const name = id.slice('\0formtxt-pack:'.length);
      if (mode === SHARED) this.emitFile({ type: 'asset', fileName: `assets/${name}.js`, source: `(window.FT_PACKS = window.FT_PACKS || {})[${JSON.stringify(name)}] = ${readFileSync(files.get(name) ?? '', 'utf8').trim()};\n` });
      return `export default ${JSON.stringify(`formtxt-pack:${name}`)};`;
    },
  };
};

const FULL_FONTS = fileURLToPath(new URL('./public/fonts/full/', import.meta.url));
const LARGE = /\.(woff2?|ttf|webp|png|jpe?g|svg)$/;
const sharedAssets = (mode: string): Plugin => ({
  name: 'formtxt-demo-shared-assets',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const text: string[] = [];
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk') text.push(file.code);
      else if (file.fileName.endsWith('.css') && typeof file.source === 'string') {
        file.source = file.source.replace(/src:([^;}]*)/g, (all, list: string) => {
          const woff2 = list.split(/,(?=\s*url\()/).find((s) => /\.woff2[)"']/.test(s));
          return woff2 ? `src:${woff2.trim()}` : all;
        });
        text.push(file.source);
      }
    }
    const used = text.join('\n');
    for (const name of Object.keys(bundle)) {
      if (!LARGE.test(name)) continue;
      const base = posix.basename(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (mode !== SHARED || !new RegExp(`${base}(?![\\w.])`).test(used)) delete bundle[name];
    }
  },
});
const assetUrl = (mode: string, out: string) => (filename: string, { hostType }: { hostType: 'js' | 'css' | 'html' }) => {
  if (mode === SHARED || !LARGE.test(filename)) return undefined;
  const target = posix.join(posix.relative(out, PAGES[SHARED].out), filename);
  if (hostType === 'js') return { runtime: `new URL(${JSON.stringify(target)}, document.baseURI).href` };
  return posix.relative(posix.join(out, hostType === 'css' ? 'assets' : '.'), posix.join(PAGES[SHARED].out, filename));
};

const symbol = (cp: number): boolean => (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f000 && cp <= 0x1faff);
const unit = (n: number): string => `\\u${n.toString(16).toUpperCase().padStart(4, '0')}`;
const escape = (code: string): string => {
  let out = '';
  for (const ch of code) {
    const cp = ch.codePointAt(0) ?? 0;
    out += !symbol(cp) ? ch : cp > 0xffff ? unit(0xd800 + ((cp - 0x10000) >> 10)) + unit(0xdc00 + ((cp - 0x10000) & 0x3ff)) : unit(cp);
  }
  return out;
};
const escapeSymbols = (): Plugin => ({
  name: 'formtxt-demo-escape-symbols',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk') file.code = escape(file.code);
      else if (file.fileName.endsWith('.js') && typeof file.source === 'string') file.source = escape(file.source);
    }
  },
});

const classicScript = (): Plugin => ({
  name: 'formtxt-demo-classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/;
    const found = html.match(tag);
    if (!found) return html;
    return html.replace(tag, '').replace('</body>', `<script defer src="${found[1]}"></script>\n</body>`).replace(/ crossorigin(?=[ >])/g, '');
  },
});

export default defineConfig(({ mode }) => {
  const id = PAGES[mode] ? mode : SHARED;
  const page = PAGES[id];
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    publicDir: false,
    assetsInclude: ['**/*.ftxt'],
    resolve: { alias: [{ find: /^\/fonts\/full\/(.*)$/, replacement: `${FULL_FONTS}$1`, customResolver: (source: string) => decodeURIComponent(source) }] },
    define: { __FT_DEMO_PACKS__: JSON.stringify(posix.join(posix.relative(page.out, PAGES[SHARED].out), 'assets')) },
    plugins: [demoPage(id), demoCovers(), dataPacks(id), classicScript(), escapeSymbols(), sharedAssets(id)],
    experimental: { renderBuiltUrl: assetUrl(id, page.out) },
    server: { host: false, port: DEMO_PORT, strictPort: true, fs: { allow: ['..'] } },
    preview: { host: false, port: DEMO_PORT + 1, strictPort: true },
    build: {
      outDir: fileURLToPath(new URL(page.out, import.meta.url)),
      emptyOutDir: false,
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      modulePreload: false,
      chunkSizeWarningLimit: 20000,
      rollupOptions: {
        output: {
          format: 'iife' as const,
          inlineDynamicImports: true,
          entryFileNames: 'assets/demo.js',
          assetFileNames: (info: { names?: string[] }) => (info.names?.some((n) => n.endsWith('.css')) ? 'assets/demo.css' : 'assets/[name][extname]'),
        },
      },
    },
  };
});
