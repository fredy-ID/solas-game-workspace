import { useState } from 'react'
import { api } from '../../desktop/client'
import type { KnowledgeSource } from './types'

export default function ConnectionPanel({ source, onConnected, onClose, beforeConnect }: {
  source?: KnowledgeSource; onConnected: (sources: KnowledgeSource[]) => void; onClose: () => void; beforeConnect: () => boolean
}) {
  const [projectRoot, setProjectRoot] = useState(source?.projectRoot || '')
  const [docsRoot, setDocsRoot] = useState(source?.root || '')
  const [createDirectory, setCreateDirectory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="kh-connection" onSubmit={async event => {
    event.preventDefault(); if (!beforeConnect()) return; setBusy(true); setError('')
    try { onConnected(await api<KnowledgeSource[]>('/knowledge/sources', { projectRoot, docsRoot, createDirectory })) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }}>
    <h2>Connexion à Denoliane : Solas</h2>
    <p>Associez un projet Unreal à sa documentation locale. Seul le dossier documentaire sera parcouru.</p>
    <label>Racine du projet Unreal (.uproject)<input required value={projectRoot} onChange={event => setProjectRoot(event.target.value)} spellCheck={false} /></label>
    <label>Racine documentaire<input required value={docsRoot} onChange={event => setDocsRoot(event.target.value)} spellCheck={false} /></label>
    <label className="kh-check"><input type="checkbox" checked={createDirectory} onChange={event => setCreateDirectory(event.target.checked)} />Créer le dossier documentaire s’il n’existe pas (son parent doit exister).</label>
    <p>Les deux dossiers peuvent se trouver sur des disques différents. Les chemins restent dans l’état local de l’application.</p>
    {error && <p role="alert">{error}</p>}
    <div className="kh-actions"><button type="submit" disabled={busy}>{busy ? 'Vérification…' : 'Connecter'}</button><button type="button" disabled={busy} onClick={onClose}>Fermer</button></div>
  </form>
}
