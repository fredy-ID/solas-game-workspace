# Points d’extension — Denoliane : Solas

## Périmètre

P0 adapte les instructions ; P1 ajoute le Knowledge Hub. P2 (Project Manager)
et P3 (UI Studio) restent hors implémentation. Le socle Mr. Mak est conservé.
Solas possède un `.uproject` et une documentation structurée : conserver les
dossiers et références relatives, sans import ni connexion implicite.

## Navigation et interface

| Point | Responsabilité / réutilisation |
| --- | --- |
| `src/lib/route.ts` | Hash des cartes inchangé ; espace réservé `#/modules/knowledge[/source/ref]`. Source et ref encodés séparément. |
| `src/App.tsx` | Route du module, chargement différé, protection des brouillons avant navigation et historique navigateur. |
| `src/components/Sidebar.tsx` | Entrée Knowledge Hub indépendante de la liste et de l’archivage des cartes. |
| `src/modules/knowledge/KnowledgeHub.tsx` | Recherche, arbre disque, document ; états chargement, vide, erreur et lecture seule. |
| `src/modules/knowledge/ConnectionPanel.tsx` | Association explicite projet/documentation ; création du dossier sur demande seulement. |
| `src/components/MarkdownDocument.tsx` | Éditeur existant, aperçu GFM, Ctrl+S, brouillons de session, révision, annulation et conflit ; paramètres Hub optionnels. |
| `MarkdownView` dans le même fichier | Rendu existant, images via aperçu et interception des liens documentaires relatifs. |
| `src/components/ReportViewer.tsx` | Lecteur hérité des rapports/cartes, inchangé. Ne pas détourner les cartes pour héberger le Hub. |
| `src/desktop/client.ts` | Tous les appels passent par `api`, avec le bearer local existant. |
| `src/modules/knowledge/knowledge.css` | Styles limités au module et variables du thème existant, sans bibliothèque UI ajoutée. |

## Service local

| Point | Responsabilité / réutilisation |
| --- | --- |
| `desktop/service/server.mjs` | Authentification/validation HTTP existantes, branchements minimaux vers le module. |
| `desktop/service/knowledge/providers.mjs` | `KnowledgeManager` et `MarkdownKnowledgeProvider` existants : recherche titre/chemin/contenu, lecture paginée, sources héritées. |
| `desktop/service/modules/knowledge/hub.mjs` | Connexion, configuration, arbre, résolution canonique, création exclusive et adaptation des lectures/sauvegardes. |
| `desktop/service/files.mjs` | Aperçu et `saveMarkdown` : SHA-256, concurrence, copie de sécurité, remplacement par fichier temporaire. Grants documentaires limités aux formats et chemins autorisés. |
| `desktop/service/util.mjs` | Réutilisation de `realFile`, `within`, `expandHome`, `saveJson`, sans affaiblir les contrôles. |

## Contrats HTTP

Toutes ces routes `/api/` gardent l’authentification locale du serveur.

| Route | Usage |
| --- | --- |
| `GET /api/knowledge/providers` | Fournisseurs hérités et sources Markdown ; contrat conservé. |
| `GET /api/knowledge/search?q=&provider=` | Recherche dans la source choisie, maximum 100 résultats, debounce UI de 250 ms. |
| `GET /api/knowledge/document?provider=&ref=&offset=` | Lecture paginée héritée, contrat conservé. |
| `GET /api/knowledge/sources` | Configuration documentaire locale, hors fournisseur de contexte du dépôt. |
| `POST /api/knowledge/sources` | `{ projectRoot, docsRoot, createDirectory? }` ; source stable `solas-docs`, autres sources conservées. |
| `GET /api/knowledge/tree?provider=` | Arbre frais, refs relatives, dossiers techniques/cachés et liens symboliques exclus. |
| `POST /api/knowledge/create` | `{ provider, folder, name }` ; nouveau `.md`, création `wx`, aucun écrasement. |
| `GET /api/preview?provider=&ref=` | Variante documentaire : validation dans la source puis aperçu existant ; paramètre hérité `path` conservé. |
| `POST /api/files/markdown` | Variante `{ provider, ref, text, revision }` ; même sauvegarde et copies de sécurité que le contrat hérité `{ path, text, revision }`. |
| `GET /api/files` | Explorateur hérité inchangé, distinct de l’arborescence métier filtrée. |

## Persistance et sécurité

- Registre unique : `stateDir/knowledge-sources.json`, état local non public.
  Entrée : `{ id, label, root, projectRoot }`. Aucun chemin machine dans le dépôt.
- Documents sur disque, sans base de données ni index concurrent. `.md` éditable ;
  `.markdown`, `.txt`, PDF et images lisibles selon l’aperçu existant.
- Référence future : `(source, ref)` ; un nom affiché n’est jamais une clé.
- Unreal : vérification non récursive du `.uproject` à la racine uniquement ;
  aucune écriture dans ses assets, sources ou paramètres.
- Arbre et recherche : dossiers cachés/techniques exclus, maximum 20 000 entrées,
  profondeur 32 ; textes limités à 2 Mo, pièces jointes à 50 Mo dans le Hub.
- Résolution canonique sous la source, contrôle des extensions, refus des liens
  sortants ; Markdown sans HTML exécutable ni accès privilégié aux API.
- Actualiser, Recharger et recherche récupèrent les changements disque. Le brouillon
  conserve sa révision initiale ; conflit HTTP 409 sans écrasement.
- Copies héritées : `.mrmak/markdown-backups`, état privé du dépôt.

## Extensions futures et maintenance du fork

- P2 pourra consommer `(source, ref)` et la navigation réservée aux modules ; il
  portera tâches/roadmap, sans dupliquer les documents ou leur éditeur.
- P3 portera les simulations UI et réutilisera l’isolation des aperçus HTML ;
  aucune route ni aucun écran P2/P3 créé ici.
- Garder le métier dans les modules, les contrats hérités compatibles et les
  branchements du socle courts pour faciliter les mises à jour amont.
- Aucun nouveau routeur, moteur de plugins, cloud, embeddings, surveillance
  permanente ou dépendance. Aucun test/fixture ajouté ou exécuté.

## Vérification et limites

Compilation frontend et syntaxe serveur avec les outils installés. Ne jamais
utiliser un document utilisateur comme support d’essai d’écriture : la validation
manuelle d’une sauvegarde nécessite un document explicitement réservé.
Sans métadonnées `.git` dans cette copie, aucun statut/diff Git fiable disponible.
