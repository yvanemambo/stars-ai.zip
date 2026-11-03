# STARS AI — Mémoire intelligente : installation

## Ce qui est déjà fait
- **Base de données (Supabase)** : tables `stars_memories` et `stars_memory_settings` + 7 fonctions `stars_memory_*`. **Déjà appliqué** sur ton projet « stars ai ». Rien d'existant n'a été modifié (ni comptes, ni Premium, ni paiements, ni admin, ni les tables `conversations` / `messages`).
- 25 vérifications SQL réussies (isolation entre utilisateurs, limite de 100, doublons, désactivation, purge) et droits contrôlés : `anon` et `authenticated` n'ont aucun accès direct aux tables.

## Fichiers à mettre sur GitHub
| Fichier | Où | Action |
|---|---|---|
| `server.js` | racine du dépôt | **remplace** l'ancien (il contient aussi le secours Gemini et répare le fichier cassé) |
| `memory.js` | racine du dépôt | nouveau |
| `public/memoire.html` | dossier `public` | nouveau (page « Mes souvenirs », adresse : `/memoire`) |
| `tests/` | dossier `tests` | facultatif (tests automatiques) |
| `migration_memoire.sql` | — | **inutile** : déjà appliqué (conservé pour mémoire) |

Depuis un ordinateur : dézippe `stars-memoire.zip`, ouvre `https://github.com/yvanemambo/stars-ai.zip/upload/main`, glisse `server.js`, `memory.js` et le dossier `public`, puis « Valider les modifications ».

**Vérifier que rien d'autre n'a changé** : une fois déposé, ouvre
`https://github.com/yvanemambo/stars-ai.zip/compare/173f312...main`
Cette page montre toutes les différences avec la version qui marchait le 30 octobre : tu ne dois voir que le secours Gemini et la mémoire.

## Après le déploiement
Dans les journaux de Render, cherche : `[vérif] Mémoire (Supabase) OK.`
Si tu vois « Mémoire indisponible », la migration SQL n'est pas appliquée sur la bonne base.

## Réglages (aucun obligatoire)
- `MEMORY_ENABLED=0` : coupe toute la mémoire du site (retour au comportement d'avant).
- La mémoire est activée par défaut pour chaque personne ; chacune peut la désactiver sur `/memoire`.

## Fonctionnement
- **Isolation** : le serveur utilise toujours l'e-mail de la session, jamais un e-mail envoyé par le navigateur. Les fonctions SQL exigent en plus le secret de la base (`MEMBERS_SECRET`).
- **« Retiens que… » / « Oublie que… »** dans le chat. « Oublie tout » ne supprime rien : il renvoie vers `/memoire`.
- **Mémorisation automatique** : une requête supplémentaire à l'IA, seulement quand le message parle de l'utilisateur (« je prépare… », « mon projet… »). Maximum 3 par minute et 20 par heure et par personne.
- **Jamais enregistrés** (même sur demande) : mots de passe, clés API, cartes bancaires, IBAN, numéros de sécurité sociale ou de pièces d'identité. Santé, religion, politique, vie intime : jamais **automatiquement**.
- Les contenus des souvenirs **ne sont jamais écrits dans les journaux**.
- **Suppression du compte** : efface aussi les souvenirs et le réglage.

## Tests
```
node --test tests/*.test.js
```
38 tests : filtre de sécurité, commandes retiens / oublie, isolation entre deux utilisateurs, cookie falsifié, désactivation, suppression de compte, journaux. Aucun réseau, aucune vraie clé.

## Limites connues
- La compréhension des **anciennes conversations** passe par les souvenirs retenus, pas par le texte complet des conversations (qui n'est pas stocké sur le serveur).
- Le filtre est volontairement prudent : une phrase qui contient « mot de passe » n'est jamais retenue, même si elle parle de sécurité en général.
- Pas de lien vers `/memoire` dans le chat : `public/index.html` n'a pas été modifié (je ne l'ai pas vu). Envoie-le pour ajouter un bouton « Mes souvenirs ».
- Penser à ajouter une phrase dans la page `/confidentialite` : « STARS AI peut mémoriser des informations que tu partages pour mieux te répondre. Tu peux les consulter, les modifier ou les supprimer sur /memoire, et les désactiver à tout moment. »

## Retour en arrière
1. Immédiat : `MEMORY_ENABLED=0` dans Render > Environment.
2. Complet (supprime aussi les souvenirs) :
```sql
drop function if exists public.stars_memory_get(text,text), public.stars_memory_add(text,text,text,text,text),
  public.stars_memory_update(text,text,bigint,text,text), public.stars_memory_delete(text,text,bigint),
  public.stars_memory_clear(text,text), public.stars_memory_set_enabled(text,text,boolean), public.stars_memory_purge(text,text);
drop schema if exists stars_private cascade;
drop table if exists public.stars_memories, public.stars_memory_settings;
```
