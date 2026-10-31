export interface KnowledgeSource { id: string; label: string; root: string; projectRoot?: string }
export interface DocumentNode { name: string; ref: string; children?: DocumentNode[] }
export interface KnowledgeHit { providerId: string; ref: string; title: string; excerpt: string }
