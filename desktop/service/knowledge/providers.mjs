import { access, realpath, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { within } from '../util.mjs';

const textFiles = new Set(['.md', '.markdown', '.txt']);
export const knowledgeExtensions = new Set([...textFiles, '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.ico']);
export const knowledgeExcluded = name => name.startsWith('.') || /^(node_modules|vendor|dependencies|target|Content|Intermediate|Binaries|Saved|DerivedDataCache|Plugins|Engine|Source)$/i.test(name);
export const knowledgeRefAllowed = ref => typeof ref === 'string' && !path.isAbsolute(ref) && !/[<>:"|?*\x00-\x1f]/.test(ref) && !ref.split(/[\\/]/).some(part => !part || part === '..' || knowledgeExcluded(part)) && knowledgeExtensions.has(path.extname(ref).toLowerCase());
const titleOf = (file, text) => text.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, path.extname(file));

export class LocalKnowledgeProvider {
  constructor(library) { this.id = 'local-repository'; this.label = 'This Workspace repository'; this.library = library; }
  async searchText(query) { return this.library.search(query); }
  async retrieve(file, offset) { return this.library.read(file, offset); }
  async skills(query) { return this.library.skills(query); }
  async search(query) { return [{ providerId: this.id, ref: query, title: 'Repository context matches', excerpt: await this.searchText(query) }]; }
}

export class MarkdownKnowledgeProvider {
  constructor(root, { id = 'markdown', label = 'Markdown knowledge source' } = {}) {
    this.id = id; this.label = label; this.root = root;
  }
  async rootPath() { return realpath(this.root); }
  async files(folder = null, result = [], budget = { count: 0 }, depth = 0) {
    folder ||= await this.rootPath();
    if (depth > 32) throw new Error('Arborescence trop profonde.');
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (knowledgeExcluded(entry.name) || entry.isSymbolicLink()) continue;
      if (++budget.count > 20000) throw new Error('Source trop volumineuse : choisissez un dossier documentaire plus précis.');
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await this.files(file, result, budget, depth + 1);
      else if (entry.isFile() && textFiles.has(path.extname(entry.name).toLowerCase())) result.push(file);
    }
    return result;
  }
  async search(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Use a short knowledge search phrase.');
    const root = await this.rootPath();
    const needle = query.toLowerCase(); const hits = [];
    for (const file of await this.files()) {
      const actual = await realpath(file).catch(() => null);
      if (!actual || !within(root, actual) || !textFiles.has(path.extname(actual).toLowerCase())) continue;
      const info = await stat(actual).catch(() => null);
      if (!info?.isFile() || info.size > 2 * 1024 * 1024) continue;
      const text = await readFile(actual, 'utf8').catch(() => '');
      const index = text.toLowerCase().indexOf(needle);
      if (index < 0 && !`${path.relative(root, file)} ${titleOf(file, text)}`.toLowerCase().includes(needle)) continue;
      hits.push({ providerId: this.id, ref: path.relative(root, file).split(path.sep).join('/'), title: titleOf(file, text), excerpt: text.slice(Math.max(0, index - 180), index + 420), source: actual, modifiedAt: info?.mtime.toISOString() || null });
      if (hits.length >= 100) break;
    }
    return hits.slice(0, 100);
  }
  async retrieve(ref, offset = 0) {
    if (!knowledgeRefAllowed(ref)) throw new Error('Knowledge references must be supported files relative to their provider.');
    const root = await this.rootPath(); const file = path.resolve(root, ref); if (!within(root, file)) throw new Error('Knowledge reference leaves its provider root.');
    const actual = await realpath(file); if (!within(root, actual) || !textFiles.has(path.extname(actual).toLowerCase())) throw new Error('Only Markdown knowledge documents can be read.');
    if ((await stat(actual)).size > 2 * 1024 * 1024) throw new Error('Document supérieur à la limite de 2 Mo.');
    const text = await readFile(actual, 'utf8'); const start = Math.max(0, Number(offset) || 0);
    return { providerId: this.id, ref: path.relative(root, actual).split(path.sep).join('/'), title: titleOf(actual, text), text: text.slice(start, start + 24000), nextOffset: start + 24000 < text.length ? start + 24000 : null, source: actual };
  }
}

export class KnowledgeManager {
  constructor(library, providers = []) {
    this.local = new LocalKnowledgeProvider(library);
    this.providers = [this.local, ...providers];
  }
  provider(id) { return this.providers.find(item => item.id === id) || null; }
  async searchText(query) { return this.local.searchText(query); }
  async read(file, offset) { return this.local.retrieve(file, offset); }
  async skills(query) { return this.local.skills(query); }
  async search(query, providerId) {
    const providers = providerId ? [this.provider(providerId)].filter(Boolean) : this.providers;
    return (await Promise.all(providers.map(provider => provider.search(query)))).flat();
  }
  async retrieve(providerId, ref, offset) {
    const provider = this.provider(providerId); if (!provider?.retrieve) throw new Error(`Knowledge provider is unavailable: ${providerId}`);
    return provider.retrieve(ref, offset);
  }
  list() { return this.providers.map(({ id, label }) => ({ id, label })); }
}
