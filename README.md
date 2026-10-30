# STARS AI

Assistant d'intelligence artificielle en français, hébergé sur Render.

- `public/index.html` : la page de discussion (le ciel étoilé, les messages).
- `server.js` : un petit serveur Node (sans dépendances) qui sert la page et envoie les messages à l'IA.

## Brancher l'IA

Dans Render › ton service `stars-ai` › **Environment**, ajoute **une** de ces deux clés :

| Variable | Où l'obtenir | Prix |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | offre gratuite (avec limites), sans carte |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com (Claude) | payant, à l'usage |

Si les deux sont présentes, Claude est utilisé.

## Inscription par code Gmail

Les visiteurs donnent leur prénom et leur adresse Gmail, reçoivent un code à 6 chiffres (valable 10 minutes) et restent connectés 30 jours.
Les codes partent du Gmail du propriétaire grâce au script `google-script/Code.gs`, installé dans une Google Sheet qui garde la liste des inscrits.

| Variable | Rôle |
|---|---|
| `MAIL_WEBHOOK_URL` | URL `/exec` du script Google (active l'inscription obligatoire) |
| `MAIL_WEBHOOK_SECRET` | même valeur que `SECRET` dans le script |
| `SESSION_SECRET` | clé qui signe les connexions (ne pas changer, sinon tout le monde est déconnecté) |

Sans `MAIL_WEBHOOK_URL`, le chat reste ouvert à tous.

## Réglages optionnels

| Variable | Par défaut | Rôle |
|---|---|---|
| `CLAUDE_MODEL` | `claude-haiku-5-5` | modèle Claude (ex. `claude-sonnet-5-5` pour plus de qualité) |
| `GEMINI_MODEL` | `gemini-flash-latest` | modèle Gemini |
| `MAX_TOKENS` | `2048` | longueur max d'une réponse |
| `PER_IP_PER_MINUTE` | `15` | messages max par minute et par visiteur |
| `DAILY_LIMIT` | `500` | messages max par jour pour tout le site (protège ta clé) |

## Lancer en local

```bash
GEMINI_API_KEY=ta_cle node server.js
# puis ouvre http://localhost:3000
```
