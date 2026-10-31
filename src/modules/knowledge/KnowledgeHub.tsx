import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../desktop/client'
import type { Preview } from '../../desktop/types'
import { knowledgeHash } from '../../lib/route'
import MarkdownDocument, { MarkdownView } from '../../components/MarkdownDocument'
import { ZoomImage } from '../../components/ImagePreview'
import ConnectionPanel from './ConnectionPanel'
import type { DocumentNode, KnowledgeHit, KnowledgeSource } from './types'
import './knowledge.css'

function Tree({ nodes, selected, source }: { nodes: DocumentNode[]; selected?: string; source: string }) {
  return <ul>{nodes.map(node => <li key={node.ref}>{node.children ?
    <details open={selected?.startsWith(`${node.ref}/`) || undefined}><summary>{node.name}</summary><Tree nodes={node.children} selected={selected} source={source} /></details> :
    <a href={knowledgeHash(source, node.ref)} aria-current={selected === node.ref ? 'page' : undefined} title={node.ref}>{node.name}</a>
  }</li>)}</ul>
}

function folders(nodes: DocumentNode[]): string[] {
  return nodes.flatMap(node => node.children ? [node.ref, ...folders(node.children)] : [])
}

export default function KnowledgeHub({ source, documentRef, onDirty }: {
  source?: string; documentRef?: string; onDirty: (dirty: boolean) => void
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [sourcesReady, setSourcesReady] = useState(false)
  const [settings, setSettings] = useState(false)
  const [tree, setTree] = useState<DocumentNode[]>([])
  const [treeBusy, setTreeBusy] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [file, setFile] = useState<Preview | null>(null)
  const [readError, setReadError] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [readVersion, setReadVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [folder, setFolder] = useState('')
  const [name, setName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const dirty = useRef(false)
  const handleDirty = useCallback((value: boolean) => { dirty.current = value; onDirty(value) }, [onDirty])
  const mayLeave = () => !dirty.current || window.confirm('Quitter le document sans enregistrer ? Le brouillon sera conservé.')
  const active = sources.find(item => item.id === source) || (!source ? sources.find(item => item.id === 'solas-docs') || sources[0] : undefined)
  const id = active?.id

  useEffect(() => {
    let live = true
    api<KnowledgeSource[]>('/knowledge/sources').then(value => { if (live) setSources(value) })
      .catch(error => { if (live) setTreeError(error.message) }).finally(() => { if (live) setSourcesReady(true) })
    return () => { live = false }
  }, [])
  useEffect(() => {
    let live = true
    setTree([]); setTreeError(''); setFolder(''); setCreating(false)
    if (id) {
      setTreeBusy(true)
      api<DocumentNode[]>(`/knowledge/tree?provider=${encodeURIComponent(id)}`).then(value => { if (live) setTree(value) })
        .catch(error => { if (live) setTreeError(error.message) }).finally(() => { if (live) setTreeBusy(false) })
    }
    return () => { live = false }
  }, [id, refresh, active?.root])
  useEffect(() => {
    let live = true
    setFile(null); setReadError(''); handleDirty(false)
    if (id && documentRef) {
      setFileBusy(true)
      api<Preview>(`/preview?provider=${encodeURIComponent(id)}&ref=${encodeURIComponent(documentRef)}`).then(value => { if (live) setFile(value) })
        .catch(error => { if (live) setReadError(error.message) }).finally(() => { if (live) setFileBusy(false) })
    }
    return () => { live = false }
  }, [id, documentRef, active?.root, handleDirty])
  // A refresh updates props on the existing editor, preserving any draft and its revision.
  useEffect(() => {
    let live = true
    if (id && documentRef && (readVersion || refresh)) {
      api<Preview>(`/preview?provider=${encodeURIComponent(id)}&ref=${encodeURIComponent(documentRef)}`).then(value => { if (live) { setFile(value); setReadError('') } })
        .catch(error => { if (live) setReadError(error.message) })
    }
    return () => { live = false }
  }, [readVersion, refresh, id, documentRef, active?.root])
  useEffect(() => {
    let live = true
    setHits([]); setSearchError(''); setSearchBusy(!!id && !!query.trim())
    const timer = window.setTimeout(() => {
      if (!id || !query.trim()) return
      api<KnowledgeHit[]>(`/knowledge/search?provider=${encodeURIComponent(id)}&q=${encodeURIComponent(query.trim())}`)
        .then(value => { if (live) { setHits(value.slice(0, 100)); setReadVersion(v => v + 1) } })
        .catch(error => { if (live) setSearchError(error.message) }).finally(() => { if (live) setSearchBusy(false) })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [id, query, refresh])

  const openLink = (href: string) => {
    if (!id || !documentRef || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return false
    try {
      const target = new URL(href.replace(/\\/g, '/'), `https://knowledge.invalid/${documentRef.split('/').map(encodeURIComponent).join('/')}`)
      const ref = decodeURIComponent(target.pathname.slice(1))
      if (!/\.(md|markdown|txt|pdf|png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(ref)) return false
      window.location.hash = knowledgeHash(id, ref); return true
    } catch { return false }
  }
  const title = file?.text?.match(/^#\s+(.+)$/m)?.[1] || file?.name || 'Sélectionnez un document'
  const crumbs = documentRef?.split('/') || []
  return <section className="knowledge-hub" aria-label="Knowledge Hub">
    <header className="kh-header"><div><h1>Knowledge Hub</h1><span>Denoliane : Solas</span></div>
      <label className="kh-search">Rechercher dans la source<input type="search" maxLength={200} value={query} disabled={!id} placeholder="Titre, chemin ou contenu…" onChange={event => setQuery(event.target.value)} /></label>
      <button onClick={() => setSettings(value => !value)}>Connexion</button>
    </header>
    {settings && <ConnectionPanel key={active?.root || 'new'} source={sources.find(item => item.id === 'solas-docs')} beforeConnect={mayLeave} onClose={() => setSettings(false)} onConnected={value => {
      handleDirty(false); setSources(value); setSettings(false); setFile(null); setRefresh(v => v + 1); window.location.hash = knowledgeHash('solas-docs')
    }} />}
    {!sourcesReady ? <p className="kh-empty" role="status">Chargement des sources…</p> : !active ? <div className="kh-empty"><h2>Aucune source connectée</h2>{treeError && <p role="alert">{treeError}</p>}<p>Connectez le répertoire du projet Unreal et sa documentation pour commencer.</p><button onClick={() => setSettings(true)}>Connecter un répertoire</button></div> : <>
      {query.trim() && <section className="kh-results" aria-label="Résultats de recherche" aria-busy={searchBusy}>
        <div role="status">{searchBusy ? 'Recherche…' : searchError || `${hits.length} résultat(s) — maximum 100`}</div>
        {!searchBusy && !searchError && !hits.length && <p>Aucun résultat trouvé.</p>}
        {hits.map(hit => <a key={`${hit.providerId}:${hit.ref}`} href={knowledgeHash(hit.providerId, hit.ref)}><strong>{hit.title}</strong><small>{hit.ref}</small><p>{hit.excerpt}</p></a>)}
      </section>}
      <div className="kh-body"><aside className="kh-navigation" aria-label="Navigation documentaire">
        <label>Source<select value={id} onChange={event => { window.location.hash = knowledgeHash(event.target.value) }}>{sources.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="kh-actions"><button onClick={() => setRefresh(v => v + 1)}>Actualiser</button><button onClick={() => setCreating(value => !value)}>Nouveau .md</button></div>
        {creating && <form className="kh-create" onSubmit={async event => {
          event.preventDefault(); if (!mayLeave()) return; setCreateBusy(true); setCreateError('')
          try {
            const created = await api<{ ref: string }>('/knowledge/create', { provider: id, folder, name })
            handleDirty(false); setCreating(false); setName(''); setRefresh(v => v + 1); window.location.hash = knowledgeHash(id, created.ref)
          } catch (error) { setCreateError(error instanceof Error ? error.message : String(error)) }
          finally { setCreateBusy(false) }
        }}><label>Dossier<select value={folder} onChange={event => setFolder(event.target.value)}><option value="">Racine</option>{folders(tree).map(ref => <option key={ref} value={ref}>{ref}</option>)}</select></label>
          <label>Nom du document<input required value={name} placeholder="Document.md" onChange={event => setName(event.target.value)} /></label><button disabled={createBusy}>{createBusy ? 'Création…' : 'Créer'}</button>{createError && <p role="alert">{createError}</p>}
        </form>}
        {treeBusy && <p role="status">Chargement de l’arborescence…</p>}
        {treeError && <p role="alert">{treeError}</p>}
        {!treeBusy && !treeError && !tree.length && <p>Cette source est vide.</p>}
        <nav className="kh-tree"><Tree nodes={tree} selected={documentRef} source={id!} /></nav>
      </aside><section className="kh-document" aria-label="Document">
        <header><h2>{title}</h2>{documentRef && <><nav aria-label="Fil d’Ariane">{active.label} / {crumbs.join(' / ')}</nav><small>{documentRef}</small><button onClick={() => setReadVersion(v => v + 1)}>Recharger</button></>}</header>
        {readError && <p className="kh-message" role="alert">{readError}</p>}
        {fileBusy && <p className="kh-empty" role="status">Chargement du document…</p>}
        {!documentRef && <p className="kh-empty">Ouvrez un document dans l’arborescence ou recherchez son contenu.</p>}
        {file && (/\.md$/i.test(file.name) && file.revision ? <MarkdownDocument key={`${id}:${documentRef}:${active.root}`} file={file} source={{ provider: id!, ref: documentRef! }} onDirty={handleDirty} onSaved={value => { setFile(value); setRefresh(v => v + 1) }} onLink={openLink} /> : <>
          <p className="kh-readonly">Lecture seule — {file.name}</p>
          {file.kind === 'text' ? /\.markdown$/i.test(file.name) ? <div className="markdown-reader"><MarkdownView text={file.text || ''} baseUrl={file.url} onLink={openLink} /></div> : <pre className="kh-text">{file.text}</pre> : file.kind === 'image' ? <div className="kh-image"><ZoomImage src={file.url} alt={file.name} /></div> : file.kind === 'document' && file.url ? <iframe className="kh-attachment" src={file.url} title={file.name} sandbox="allow-same-origin allow-downloads" /> : <p className="kh-empty">{file.reason || 'Aperçu indisponible.'}</p>}
        </>)}
      </section></div>
    </>}
  </section>
}
