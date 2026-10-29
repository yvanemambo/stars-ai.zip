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
