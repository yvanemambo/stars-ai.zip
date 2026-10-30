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

## Exercices et photos

Le bouton appareil photo (ou coller / glisser une image) envoie jusqu'à 3 photos par message, réduites à 1600 px.
STARS AI répond en « mode prof » : étape par étape, formules lisibles (x², √, ×), résultat en gras, et un exercice similaire pour s'entraîner.

## Mode vocal (appel)

Le bouton micro ouvre un appel : le navigateur écoute (reconnaissance vocale de Chrome / Safari), STARS AI répond
en version courte « pour l'oral » (`voice: true` envoyé à `/api/chat`), la réponse est lue à voix haute phrase par phrase,
puis l'écoute reprend. Toucher le cercle coupe la parole ; « Raccrocher » termine. Les échanges restent dans la discussion.

## Application Android (Play Store)

Le site est installable (PWA) : `public/manifest.webmanifest`, `public/sw.js` (page hors ligne `offline.html`), icônes dans `public/icons/`.
Le paquet Android se génère sur https://www.pwabuilder.com à partir de https://stars-ai.onrender.com.
Une fois l'appli signée, mettre le contenu de `assetlinks.json` dans la variable Render `ASSETLINKS_JSON`
(servi sur `/.well-known/assetlinks.json`) pour enlever la barre d'adresse dans l'appli.

Sans Play Store : la page `/telecharger` propose l'APK signé (`public/downloads/stars-ai.apk`, généré par PWABuilder)
et l'installation en un clic (Chrome) ; le bouton « Installer l'appli » du chat y mène quand Chrome ne propose pas l'installation.

Exigences Google Play déjà en place : bouton « Signaler » sous chaque réponse (`/api/report`, table `stars_reports`),
« Supprimer mon compte » dans le menu (`/api/account/delete`, anonymise la ligne de `stars_members`),
politique de confidentialité sur `/confidentialite`.

## Premium, tableau de bord, offre écoles

- Compte gratuit : `FREE_DAILY_MESSAGES` messages par jour (compteur `stars_usage` dans Supabase) ; Premium illimité.
- `/premium` : paiement mobile money (numéros dans `PAY_WAVE`, `PAY_ORANGE`, `PAY_MTN`, `PAY_MOOV`), puis formulaire « J'ai payé » (`stars_payments`).
- `/admin` (réservé à `ADMIN_EMAILS`) : chiffres du jour, paiements à valider (+30 jours de Premium), Premium offert, signalements, derniers inscrits.
- `/ecoles` : offre pour les écoles, contact WhatsApp (`CONTACT_WHATSAPP`) et e-mail (`CONTACT_EMAIL`).
- Prix : `PREMIUM_PRICE` (FCFA par mois).

### Wave automatique (API Checkout de Wave Business)

Avec `WAVE_API_KEY` (clé créée dans business.wave.com > Développeurs, autorisation « Checkout », sans signature des requêtes), le bouton Wave crée un paiement Wave et le Premium s'active tout seul :

- au retour sur `/premium?wave=ok`, le serveur demande à Wave si la session est payée ;
- en plus, avec `WAVE_WEBHOOK_SECRET`, Wave prévient le serveur sur `https://<site>/api/wave/webhook` (événement `checkout.session.completed`, méthode « Signing secret »), même si la personne ne revient pas sur la page.

Chaque session Wave n'active qu'un mois, une seule fois (`stars_wave_paid` dans Supabase, référence `auto:<session>`). La référence envoyée à Wave est chiffrée : Wave ne voit pas l'e-mail. Si Wave ne répond pas, la page revient au lien marchand `PAY_WAVE_LINK` validé à la main. Sans clé, rien ne change.

## MonScanner en ligne (`/antivirus`)

Vérifie un fichier avec VirusTotal, sans l'envoyer : le navigateur calcule l'empreinte SHA-256 (par morceaux pour les gros fichiers), le serveur demande à VirusTotal ce qu'il sait de cette empreinte.

- `VT_API_KEY` : clé du compte gratuit VirusTotal (profil > API Key). Sans clé, la page donne le lien direct vers le rapport VirusTotal.
- Limites du compte gratuit respectées : `VT_PER_MINUTE` (4) et `VT_PER_DAY` (480) ; résultats gardés 6 h en mémoire ; 40 vérifications / heure / personne.

## Inscription par code Gmail

Les visiteurs donnent leur prénom et leur adresse Gmail, reçoivent un code à 6 chiffres (valable 10 minutes) et restent connectés 30 jours.
Les codes partent du Gmail du propriétaire grâce au script `google-script/Code.gs`, installé dans une Google Sheet qui garde la liste des inscrits.

| Variable | Rôle |
|---|---|
| `MAIL_WEBHOOK_URL` | URL `/exec` du script Google (active l'inscription obligatoire) |
| `MAIL_WEBHOOK_SECRET` | même valeur que `SECRET` dans le script |
| `SESSION_SECRET` | clé qui signe les connexions (ne pas changer, sinon tout le monde est déconnecté) |
| `SUPABASE_URL`, `SUPABASE_KEY` | projet Supabase « stars ai » (clé publishable) qui garde la liste des comptes |
| `MEMBERS_SECRET` | clé vérifiée par les fonctions `stars_member_*` de Supabase (table `stars_members`) |

Avec Supabase branché, « S'inscrire » refuse une adresse déjà inscrite et « Se connecter » refuse une adresse inconnue (la page bascule d'elle-même sur le bon onglet).

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
