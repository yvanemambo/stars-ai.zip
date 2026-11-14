# Agent Windows YvanAI — version 0.1

Cette première brique permet à YvanAI de commencer par une tâche concrète et prudente :
**retrouver un fichier par son nom sur le PC Windows 11**.

## Installation

1. Installe Python 3 depuis https://www.python.org/downloads/windows/ (coche « Add Python to PATH » pendant l'installation).
2. Télécharge le fichier `yvanai_agent.py` sur ton PC.
3. Ouvre le terminal dans le dossier où se trouve le fichier.
4. Vérifie l'installation avec :

   ```powershell
   py --version
   ```

## Utilisation

Afficher les dossiers autorisés :

```powershell
py yvanai_agent.py --roots
```

Chercher un fichier par une partie de son nom :

```powershell
py yvanai_agent.py BTS
```

Obtenir un résultat exploitable par un futur connecteur :

```powershell
py yvanai_agent.py BTS --json
```

## Limites de sécurité de cette version

- Recherche uniquement dans Bureau, Documents, Téléchargements et certains dossiers OneDrive.
- Recherche sur le nom du fichier, pas encore dans son contenu.
- Lecture seule : aucun déplacement, renommage, suppression ou ouverture automatique.
- Aucun accès à distance et aucune connexion réseau.
- Les dossiers système, cachés et les liens symboliques sont ignorés.
- Limite de 100 000 fichiers examinés, 100 résultats et 12 niveaux de profondeur.

## Prochaine étape

Ajouter un appairage sécurisé entre le compte YvanAI, cet agent Windows et l'application Android.
Le PC ne devra jamais accepter une commande arbitraire : chaque capacité sera explicitement autorisée,
et les actions sensibles demanderont une confirmation sur le téléphone.
