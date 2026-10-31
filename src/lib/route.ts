// Hash routing: #/<entityId>/<stepIndex>. Step -1 uses the card's default.
// Plain <a href> hash links do the navigation; App listens to hashchange.

export interface Route {
  id: string | null
  step: number
  module?: 'knowledge'
  source?: string
  ref?: string
}

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw) return { id: null, step: -1 }
  if (raw === 'modules/knowledge' || raw.startsWith('modules/knowledge/')) {
    const [, , source, ref] = raw.split('/')
    try { return { id: null, step: -1, module: 'knowledge', source: source ? decodeURIComponent(source) : undefined, ref: ref ? decodeURIComponent(ref) : undefined } }
    catch { return { id: null, step: -1, module: 'knowledge' } }
  }
  const [id, stepRaw] = raw.split('/')
  const step = Number(stepRaw)
  return {
    id: decodeURIComponent(id),
    step: Number.isInteger(step) && step >= 0 ? step : -1,
  }
}

export function knowledgeHash(source?: string, ref?: string): string {
  return `#/modules/knowledge${source ? `/${encodeURIComponent(source)}${ref ? `/${encodeURIComponent(ref)}` : ''}` : ''}`
}

export function entityHash(id: string, step = -1): string {
  const base = `#/${encodeURIComponent(id)}`
  return step >= 0 ? `${base}/${step}` : base
}

export function resolveStep(count: number, requested: number, preferred?: number): number {
  const valid = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count
  return valid(requested) ? requested : valid(preferred) ? preferred : count - 1
}
