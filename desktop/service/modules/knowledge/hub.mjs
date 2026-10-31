import path from 'node:path';
import { mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { expandHome, realFile, saveJson, within } from '../../util.mjs';
import { MarkdownKnowledgeProvider, knowledgeExcluded, knowledgeExtensions, knowledgeRefAllowed } from '../../knowledge/providers.mjs';

// One private configuration registry, shared with inherited Markdown providers.
export class KnowledgeHub {
  constructor(stateDir, sources, manager, files) {
    this.config = path.join(stateDir, 'knowledge-sources.json');
    this.sources = Array.isArray(sources) ? sources : [];
    this.manager = manager; this.files = files; this.writes = Promise.resolve();
  }
  list() {
    return this.sources.filter(item => typeof item?.root === 'string').map(({ id, label, root, projectRoot }) => ({ id: id || 'markdown', label: label || 'Documentation', root, projectRoot }));
  }
  source(id) {
    const source = this.list().find(item => item.id === id);
    if (!source) throw new Error('Source documentaire introuvable.');
    return source;
  }
  async connect(data) {
    const operation = this.writes.catch(() => {}).then(async () => {
      for (const key of ['projectRoot', 'docsRoot']) {
        if (typeof data[key] !== 'string' || !path.isAbsolute(expandHome(data[key])) || data[key].length > 4096) throw new Error('Renseignez deux chemins absolus valides.');
      }
      const projectRoot = await realpath(expandHome(data.projectRoot)).catch(() => { throw new Error('Répertoire Unreal introuvable ou inaccessible.'); });
      const entries = await readdir(projectRoot, { withFileTypes: true });
      if (!entries.some(entry => entry.isFile() && /\.uproject$/i.test(entry.name))) throw new Error('Le répertoire Unreal doit contenir un fichier .uproject à sa racine.');
      const requested = path.resolve(expandHome(data.docsRoot));
      const technical = candidate => within(projectRoot, candidate) && path.relative(projectRoot, candidate).split(path.sep).filter(Boolean).some(knowledgeExcluded);
      if (technical(requested)) throw new Error('La documentation doit être située hors des dossiers techniques Unreal.');
      let root;
      try { root = await realpath(requested); }
      catch (error) {
        if (error.code !== 'ENOENT' || data.createDirectory !== true) throw new Error('Documentation introuvable ou inaccessible. Cochez la création si nécessaire.');
        const parent = await realpath(path.dirname(requested));
        if (!(await stat(parent)).isDirectory() || technical(path.join(parent, path.basename(requested))) || knowledgeExcluded(path.basename(requested))) throw new Error('Dossier parent invalide.');
        await mkdir(requested); root = await realpath(requested);
      }
      if (!(await stat(root)).isDirectory() || knowledgeExcluded(path.basename(root)) || technical(root)) throw new Error('Choisissez un répertoire documentaire accessible, hors des dossiers techniques.');
      await readdir(root);
      const existing = this.sources.find(item => item.id === 'solas-docs');
      const source = { ...existing, id: 'solas-docs', label: 'Denoliane : Solas', root, projectRoot };
      const sources = [...this.sources.filter(item => item.id !== source.id), source];
      await saveJson(this.config, sources);
      this.sources = sources;
      this.manager.providers = [...this.manager.providers.filter(item => item.id !== source.id), new MarkdownKnowledgeProvider(root, source)];
      return this.list();
    });
    this.writes = operation; return operation;
  }
  async resolve(id, ref) {
    if (!knowledgeRefAllowed(ref)) throw new Error('Référence documentaire non autorisée.');
    const root = await realpath(this.source(id).root);
    const result = await realFile(root, ref);
    if (!knowledgeExtensions.has(path.extname(result.file).toLowerCase()) || !result.info.isFile() || path.relative(root, result.file).split(path.sep).some(knowledgeExcluded)) throw new Error('Document non autorisé.');
    return { ...result, root };
  }
  async tree(id) {
    const root = await realpath(this.source(id).root).catch(() => { throw new Error('Source documentaire introuvable ou inaccessible. Reconnectez le répertoire.'); });
    let count = 0;
    const walk = async (folder, depth = 0) => {
      if (depth > 32) throw new Error('Arborescence trop profonde.');
      const nodes = [];
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (knowledgeExcluded(entry.name) || entry.isSymbolicLink()) continue;
        if (++count > 20000) throw new Error('Source trop volumineuse : choisissez un dossier plus précis.');
        const full = path.join(folder, entry.name);
        const actual = await realpath(full);
        if (!within(root, actual)) continue;
        const ref = path.relative(root, full).split(path.sep).join('/');
        if (entry.isDirectory()) nodes.push({ name: entry.name, ref, children: await walk(full, depth + 1) });
        else if (entry.isFile() && knowledgeExtensions.has(path.extname(entry.name).toLowerCase())) nodes.push({ name: entry.name, ref });
      }
      return nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
    };
    return walk(root);
  }
  async preview(id, ref) {
    const { file, info, root } = await this.resolve(id, ref);
    if (info.size > 50 * 1024 * 1024) throw new Error('Pièce jointe supérieure à la limite de 50 Mo.');
    const preview = await this.files.preview(file);
    if (preview.url) preview.url = this.files.knowledgeUrl(root, ref);
    return preview;
  }
  async save(data) {
    const { file } = await this.resolve(data.provider, data.ref);
    const result = await this.files.saveMarkdown({ ...data, path: file });
    return { ...result, url: this.files.knowledgeUrl(await realpath(this.source(data.provider).root), data.ref) };
  }
  async create({ provider, folder = '', name }) {
    if (typeof name !== 'string' || !/^[^<>:"/\\|?*\x00-\x1f]+\.md$/i.test(name) || name.length > 160 || name.startsWith('.') || /[. ]\.md$/i.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Choisissez un nom de fichier Markdown valide, terminé par .md.');
    if (typeof folder !== 'string' || (folder && !knowledgeRefAllowed(`${folder}/document.md`))) throw new Error('Dossier non autorisé.');
    const root = await realpath(this.source(provider).root);
    const { file: parent, info } = await realFile(root, folder);
    if (!info.isDirectory() || path.relative(root, parent).split(path.sep).filter(Boolean).some(knowledgeExcluded)) throw new Error('Dossier non autorisé.');
    const ref = `${folder ? `${folder}/` : ''}${name}`;
    try { await writeFile(path.join(parent, name), '', { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Ce document existe déjà. Aucun fichier écrasé.'); throw error; }
    return { provider, ref };
  }
}
