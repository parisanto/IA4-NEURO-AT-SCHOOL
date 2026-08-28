# IA4-NEURO — architecture Web et bureau

## Source officielle

`Site-local/` est désormais la source commune de l'interface et des contenus. Il ne faut plus maintenir une seconde copie manuelle à la racine du dépôt.

La commande `npm run build:web` produit `dist/web/`, qui est la seule version envoyée à GitHub Pages. La commande `npm run build:desktop` produit la même interface pour Tauri.

## Applications de bureau

Le dossier `src-tauri/` contient l'enveloppe native. Elle fournit :

- une fenêtre stable, indépendante du navigateur et d'un port local ;
- un installateur Windows incluant WebView2 pour une installation sans Internet ;
- des applications macOS Apple Silicon et Intel ;
- des dialogues natifs pour sauvegarder et restaurer les données.

L'interface historique utilise encore des gestionnaires `onclick` intégrés au HTML. La configuration native conserve une CSP locale restrictive, mais empêche Tauri d'ajouter des empreintes à `script-src`, car ces empreintes désactivent les gestionnaires intégrés dans les WebView macOS et Windows.

## Données

La sauvegarde globale contient toutes les clés IA4-NEURO et Formation du stockage local, ainsi que les documents et vignettes du Classeur. Elle est compatible entre le Web, macOS et Windows.

Dans l'application de bureau, les préférences et progressions sont répliquées dans `ia4-neuro.sqlite3`. Les métadonnées du Classeur sont stockées dans cette même base SQLite et ses fichiers dans le sous-dossier `documents/` du répertoire applicatif. La version Web continue d'utiliser IndexedDB.

Le format actuel est `ia4-neuro-backup`, version 1. Une restauration remplace les données IA4-NEURO présentes après confirmation de l'utilisateur.

## Commandes de développement

```text
pnpm install
pnpm run build:web
pnpm run serve
pnpm run check
pnpm run desktop:dev
pnpm run desktop:build
```

Node.js est nécessaire pour le développement. Rust est nécessaire uniquement pour compiler localement l'application Tauri. GitHub Actions peut produire les installateurs sans installer Rust sur le poste de conception.

## Publication

- Chaque envoi sur `main` reconstruit et publie GitHub Pages.
- Un tag `v1.0.0`, par exemple, construit un brouillon de version avec les installateurs macOS et Windows.
- La chaîne de publication exige les certificats Apple et Windows, signe les trois applications et notarise les versions macOS.
- Les secrets nécessaires et la procédure sont détaillés dans `SIGNATURE-PUBLICATION.md`.

## Limite volontaire de cette étape

L'application est autonome pour les contenus, le Carnet, le Classeur, la formation et les exports. Elle ne contient pas encore de modèle d'IA local. Ce moteur restera un module optionnel afin de ne pas imposer plusieurs gigaoctets et des prérequis matériels à tous les utilisateurs.
