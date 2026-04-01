# OpenMail demo — état du projet

> **Usage :** coller ce fichier (ou un extrait) au début d’un nouveau chat Cursor pour reprendre le contexte.

---

## Features faites

- **Shell OpenMail** : layout 3 colonnes (sidebar, liste / flow, panneau IA), ruban supérieur avec clusters de bulles Matter.js (`.nav-bubble`), écran de boot.
- **Données mail** : `mails` (source) → `processMails()` → `processedMails` (scores, cluster, intent, `intentConfidence`, `priority` urgent/medium/low).
- **Intent & UI liste** : badges d’intent sur les cartes, tri par `priorityScore`.
- **Flow field** : cartes en `position: absolute` dans `.flow-container` ; positions `%` + `transform: translate(-50%, -50%)` ; init + `applyPriority()` (urgent → centre haut, medium → zone aléatoire, low → défaut aléatoire).
- **Mouvement** : `setInterval` ~2s pour petite dérive `x/y` (bornée), transitions CSS sur `left`/`top`.
- **Survol** : `handleHover` → sélection + attraction `(50%, 40%)` + `preloadMail` (pré-calc actions/suggestions).
- **Panneau IA** : lecture mail, **Suggested Actions** (`getActions`, `primary`, classes `primary` / `predicted`), **AI Replies** (`getSuggestions`), textarea + Send.
- **EFU (Execution Flow)** : clic action ou Send → `processingId`, animation `.processing`, `removeMail` + sélection du voisin, délai ~180ms.
- **Raccourci** : `Enter` exécute `predictedAction` (sauf focus textarea/input/contenteditable).
- **Auto-ready** : `isAutoReady` si `confidence > 0.95` (attention : `confidence` est 0–100 dans les données) → classe `auto-ready` sur le stack actions.
- **Auto-exécution optionnelle** : `AUTO_MODE = false` ; si activé + `confidence > 0.98` + `predictedAction` → `handleAction` après 800ms (seuil à ajuster selon échelle 0–1 vs 0–100).
- **Barre intent** : `intentConfidence` (0–1) + `.confidence-bar` / `.confidence-label`.
- **Filtres** : inbox, smart folders générés, etc.

---

## Architecture actuelle (fichiers clés)

| Zone | Fichier |
|------|---------|
| Page principale (tout le flux ci-dessus) | `app/openmail/page.tsx` |
| Styles globaux / liste / flow / panneau IA | `app/globals.css` |
| Boot | `app/components/BootScreen` (import relatif depuis `page.tsx`) |
| Compose (hors démo flow principale) | `app/openmail/compose/page.tsx`, `ComposeControlPanel.tsx` |

**État React principal** : `mails`, `processedMails`, `selectedMailId`, `replyText`, `processingId`, `predictedAction`, `activeFilter`, `smartFolders`, etc.

**Helpers notables** : `processMails`, `applyPriority`, `getActions`, `getSuggestions`, `preloadMail`, `handleHover`, `removeMail`, `selectNextMail` (alias), `handleAction`, `handleSend`, `handleActionRef` (auto-mode + clavier).

---

## Points d’attention / dette connue

- **Seuils `confidence`** : mélange possible entre échelle 0–100 (données) et comparaisons type `> 0.95` / `> 0.98` — à unifier (ex. normaliser ou comparer à `95` / `98`).
- **`.flow-container`** : fond debug `rgba(255,0,0,0.05)` — retirable quand plus besoin.
- **Matter.js** : `tsc` peut râler sans `@types/matter-js`.
- **StrictMode** : double montage en dev peut réinitialiser positions aléatoires si effets mal gardés.

---

## Prochaines étapes (idées)

- Retirer le fond debug `.flow-container` et peaufiner hauteurs grille / scroll milieu.
- Aligner tous les seuils de confiance (`auto-ready`, `AUTO_MODE`, barres) sur une seule convention (0–1 ou 0–100).
- Éviter que la dérive annule l’« attraction » au survol (geler ou réduire drift sur carte sélectionnée / survolée).
- Persistance réelle (API / localStorage) pour `mails` et positions.
- Tests e2e ou smoke sur sélection + action + Send + Enter.

---

## Dernière mise à jour

- Fichier généré pour handoff chat ; à **mettre à jour manuellement** après grosses évolutions.
