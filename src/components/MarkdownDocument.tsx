import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../desktop/client'
import type { Preview } from '../desktop/types'
import './documents.css'
import { ZoomImage } from './ImagePreview'

const drafts = new Map<string, { text: string; revision?: string }>()
function restoreDraft(key: string, fallback: string) {
  if (drafts.has(key)) return drafts.get(key)!.text
  try { return sessionStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function MarkdownView({ text, baseUrl, onLink }: { text: string; baseUrl?: string; onLink?: (href: string) => boolean }) {
  // Browser preview supplies /workspace/...; URL's base must be absolute.
  const base = baseUrl ? new URL(baseUrl, window.location.href).href : undefined
  return <article className="mak-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href?.startsWith('#') ? href : href && base ? new URL(href, base).href : href} onClick={event => { if (href && onLink?.(href)) event.preventDefault() }} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{children}</a>,
    img: ({ src, alt }) => <ZoomImage src={typeof src === 'string' ? base ? new URL(src, base).href : src : undefined} alt={alt} />,
  }}>{text}</Markdown></article>
}

interface Props {
  file: Preview
  source?: { provider: string; ref: string }
  onDirty?: (dirty: boolean) => void
  onSaved?: (file: Preview) => void
  onLink?: (href: string) => boolean
}

export default function MarkdownDocument({ file, source, onDirty, onSaved, onLink }: Props) {
  const draftKey = `mrmak.md-draft.${file.path}`
  const [saved, setSaved] = useState(file.text || '')
  const [draft, setDraft] = useState(() => restoreDraft(draftKey, file.text || ''))
  const [revision, setRevision] = useState(() => {
    if (drafts.has(draftKey)) return drafts.get(draftKey)!.revision
    try {
      return sessionStorage.getItem(draftKey) !== null ? sessionStorage.getItem(`${draftKey}.revision`) || undefined : file.revision
    } catch { return file.revision }
  })
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(revision !== file.revision ? 'Brouillon restauré avec une révision différente ou inconnue. Vérifiez la version sur disque avant de sauvegarder.' : '')
  const incoming = useRef(file)
  const latest = useRef(file)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const dirty = draft !== saved
  useEffect(() => { onDirty?.(dirty) }, [dirty, onDirty])
  useEffect(() => {
    if (incoming.current === file) return
    incoming.current = file; latest.current = file
    if (file.revision === revision) return
    if (dirty) setStatus('Document modifié sur disque. Brouillon conservé ; annulez les modifications pour recharger la version externe.')
    else { setSaved(file.text || ''); setDraft(file.text || ''); setRevision(file.revision); setStatus('') }
  }, [file, revision, dirty])
  useEffect(() => {
    if (dirty) drafts.set(draftKey, { text: draft, revision }); else drafts.delete(draftKey)
    try {
      if (dirty) { sessionStorage.setItem(draftKey, draft); if (revision) sessionStorage.setItem(`${draftKey}.revision`, revision) }
      else { sessionStorage.removeItem(draftKey); sessionStorage.removeItem(`${draftKey}.revision`) }
    } catch { /* In-memory drafts still survive file switching when browser storage is full. */ }
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, draft, draftKey, revision])
  const save = async () => {
    if (busy || !dirty) return
    setBusy(true); setStatus(source ? 'Enregistrement…' : 'Saving…')
    try {
      const result = await api<Preview>('/files/markdown', { path: file.path, text: draft, revision, ...source })
      latest.current = result
      setSaved(result.text || ''); setDraft(result.text || ''); setRevision(result.revision); setStatus(source ? 'Enregistré' : 'Saved')
      if (mounted.current) onSaved?.(result)
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!source) return
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })
  return <section className="markdown-document" aria-label={file.name}>
    <div className="document-toolbar"><div className="document-modes" aria-label="Markdown mode"><button aria-pressed={!editing} onClick={() => setEditing(false)}>{source ? 'Aperçu' : 'Preview'}</button><button aria-pressed={editing} onClick={() => setEditing(true)}>{source ? 'Modifier' : 'Edit'}</button></div>
      <span className="document-status" role="status">{status || (dirty ? source ? 'Modifications non enregistrées' : 'Unsaved draft' : 'Markdown')}</span>
      {dirty && <button disabled={busy} onClick={() => { setSaved(latest.current.text || ''); setDraft(latest.current.text || ''); setRevision(latest.current.revision); setStatus(source ? 'Modifications annulées' : 'Draft discarded') }}>{source ? 'Annuler les modifications' : 'Discard'}</button>}
      <button className="document-save" disabled={!dirty || busy} onClick={() => void save()}>{source ? 'Enregistrer' : 'Save'}</button>
    </div>
    {editing ? <textarea className="markdown-editor" aria-label={`Edit ${file.name}`} spellCheck={false} value={draft} onChange={event => { setDraft(event.target.value); setStatus('') }} onKeyDown={event => { if (!source && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() } }} /> : <div className="markdown-reader"><MarkdownView text={draft} baseUrl={file.url} onLink={onLink} /></div>}
  </section>
}
