# Signature et publication de IA4-NEURO

La chaîne GitHub refuse désormais de créer une version publique lorsque les certificats de signature sont absents. Les secrets restent exclusivement dans GitHub et ne sont jamais enregistrés dans le dépôt.

## Version familiale Windows non signée

Chaque mise à jour de `main` fabrique automatiquement un installateur Windows familial non signé. Il est disponible dans l'exécution de l'action « Applications macOS et Windows », sous le nom `IA4-NEURO-Windows-famille`, pendant 30 jours.

Cette version n'est pas ajoutée aux publications publiques. Après téléchargement et décompression de l'archive, copier le fichier `-setup.exe` sur une clé USB. Windows SmartScreen peut afficher un avertissement lors de la première installation ; choisir « Informations complémentaires », puis « Exécuter quand même » uniquement si le fichier provient bien de ce dépôt.

Pour le régénérer sans modifier le code, ouvrir l'action « Applications macOS et Windows », choisir « Run workflow », sélectionner le mode `familial`, puis lancer l'action.

## macOS

La diffusion hors de l'App Store nécessite un abonnement Apple Developer actif et un certificat `Developer ID Application`. Le certificat doit être exporté depuis le Trousseau d'accès au format `.p12`, avec un mot de passe.

Créer les secrets GitHub suivants :

- `APPLE_CERTIFICATE` : contenu du `.p12` encodé en Base64 sur une seule ligne ;
- `APPLE_CERTIFICATE_PASSWORD` : mot de passe choisi lors de l'export du `.p12` ;
- `KEYCHAIN_PASSWORD` : mot de passe fort et temporaire utilisé par le trousseau du runner GitHub ;
- `APPLE_ID` : adresse du compte Apple Developer ;
- `APPLE_PASSWORD` : mot de passe spécifique à l'application créé sur le compte Apple ;
- `APPLE_TEAM_ID` : identifiant de l'équipe Apple Developer.

Le processus importe le certificat dans un trousseau temporaire, signe les applications, envoie les paquets à Apple pour notarisation puis crée les fichiers DMG.

## Windows

La diffusion sans alerte SmartScreen nécessite un certificat de signature de code Windows fourni par une autorité de certification. Un certificat SSL ne convient pas. Selon le fournisseur, il peut s'agir d'un certificat OV, EV ou d'un service de signature matériel ou distant.

Pour un certificat exportable au format `.pfx`, créer :

- `WINDOWS_CERTIFICATE` : contenu binaire du `.pfx` encodé en Base64 sur une seule ligne ;
- `WINDOWS_CERTIFICATE_PASSWORD` : mot de passe d'export du `.pfx`.

La variable GitHub facultative `WINDOWS_TIMESTAMP_URL` permet d'utiliser le serveur d'horodatage indiqué par le fournisseur du certificat. À défaut, la chaîne utilise `http://timestamp.digicert.com`.

Le processus importe le certificat dans le magasin temporaire du runner Windows, récupère automatiquement son empreinte et signe l'application ainsi que ses installateurs.

## Déclenchement

Une fois tous les secrets enregistrés, lancer manuellement l'action « Applications macOS et Windows » en mode `signe` ou pousser un tag correspondant à la version, par exemple `v1.0.0`. La version GitHub est créée en brouillon afin de permettre un dernier contrôle avant publication.

Les certificats, mots de passe et clés privées ne doivent jamais être ajoutés aux fichiers du projet, aux issues ou aux journaux GitHub.
