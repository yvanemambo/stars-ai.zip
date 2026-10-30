# Guide des langages informatiques — rôle, fonctions et domaines d'usage
(Web, mobile, IA, systèmes, jeux, électronique, blockchain, cybersécurité)

On recense plus de 8 000 langages de programmation depuis les années 1950. La plupart sont expérimentaux, abandonnés ou utilisés par une poignée de personnes. Ce guide présente les langages qui comptent réellement, ceux qui ont marqué l'histoire et quelques curiosités, classés par domaine. Format : Langage (année de la première version publique ou de l'annonce) : rôle. Usages typiques. Un même langage peut apparaître dans plusieurs domaines.

## Notions essentielles
- Compilé : le code est traduit en langage machine avant l'exécution (C, C++, Rust, Go). Rapide.
- Interprété : le code est lu et exécuté ligne par ligne (Python, Ruby, JavaScript, PHP). Souple, plus lent.
- Machine virtuelle : le code est compilé en un format intermédiaire exécuté par une machine virtuelle (Java, Kotlin, C#, Scala).
- Typage statique / dynamique : statique = types vérifiés avant l'exécution (Java, Rust, TypeScript) ; dynamique = vérifiés pendant (Python, JavaScript).
- Paradigmes : impératif (instructions), objet (classes), fonctionnel (fonctions pures), logique (règles), déclaratif (on décrit le résultat).
- Haut / bas niveau : bas niveau = proche du matériel (assembleur, C) ; haut niveau = plus abstrait et lisible (Python, JavaScript).

## 1. Web : ce qu'on voit (front-end) — la partie d'un site que l'utilisateur voit et touche dans son navigateur
- HTML (1993) : langage de balisage, décrit la structure d'une page (titres, paragraphes, images, liens, formulaires). Base de tout site web. Ce n'est pas un langage de programmation : ni calcul ni logique.
- CSS (1996) : langage de style (couleurs, polices, tailles, positions, animations, adaptation mobile/responsive). Se combine à HTML. Évolutions : Flexbox, Grid, variables CSS. Préprocesseurs : Sass, Less.
- JavaScript (1995) : langage de programmation du navigateur, rend les pages interactives (menus, formulaires, jeux, mises à jour sans rechargement). Aussi côté serveur avec Node.js. Frameworks : React, Vue, Angular, Svelte. Le langage le plus répandu du Web.
- TypeScript (2012) : sur-ensemble de JavaScript avec typage statique, détecte les erreurs avant l'exécution. Projets web de grande taille. Se compile en JavaScript. Créé par Microsoft.
- WebAssembly / Wasm (2017) : format binaire exécuté dans le navigateur à vitesse quasi native. On y compile du C, C++, Rust, Go. Calcul lourd, jeux, logiciels en ligne.

## 2. Web : ce qui tourne sur le serveur (back-end) — logique, comptes utilisateurs, bases de données, sécurité
- PHP (1995) : langage de script serveur pour générer des pages web dynamiques. Fait tourner une grande partie du Web : WordPress, Laravel, Symfony. Facile à héberger.
- Python (1991) : généraliste lisible, très utilisé côté serveur. Frameworks Django, Flask, FastAPI. Idéal pour les API et l'IA.
- Ruby (1995) : orienté objet, très expressif, centré sur le confort du développeur. Framework Ruby on Rails, qui a popularisé le développement web rapide.
- Java (1995) : compilé, robuste, portable (machine virtuelle JVM). Grandes entreprises, banques. Framework Spring.
- C# (2000) : langage de Microsoft pour la plateforme .NET. Sites et API avec ASP.NET, logiciels Windows, jeux Unity.
- Go / Golang (2009) : compilé, simple et rapide, conçu par Google pour les serveurs concurrents. Services cloud, microservices ; Docker et Kubernetes sont écrits en Go.
- Elixir (2012) : fonctionnel, sur la machine virtuelle d'Erlang, très tolérant aux pannes. Applications temps réel à très forte charge (messagerie, chat). Framework Phoenix.
- Perl (1987) : script réputé pour le traitement de texte. Ancien Web (scripts CGI), administration système, bio-informatique.
- Node.js (2009) : environnement qui exécute JavaScript hors du navigateur (ce n'est pas un langage). API, serveurs temps réel, outils de développement. Concurrents : Deno, Bun.

## 3. Langages généralistes (applications et logiciels) — logiciels de bureau, outils, automatisation, services
- Python (1991) : syntaxe claire, énorme bibliothèque standard, interprété. Scripts, automatisation, IA, science des données, éducation. Excellent premier langage.
- Java (1995) : « écrire une fois, exécuter partout » grâce à la JVM ; fortement typé, orienté objet. Applications d'entreprise, Android (historique), systèmes bancaires.
- C# (2000) : moderne, orienté objet, très complet. Logiciels Windows, jeux avec Unity, applications web et mobiles.
- Kotlin (2011) : concis et sûr, 100 % compatible avec Java. Langage officiel recommandé pour Android ; aussi serveurs et multiplateforme.
- Scala (2004) : mélange programmation objet et fonctionnelle sur la JVM. Traitement de gros volumes de données (Apache Spark).
- Groovy (2003) : dynamique pour la JVM, proche de Java mais plus souple. Scripts de build (Gradle), pipelines Jenkins.
- Lua (1993) : script léger, facile à intégrer dans d'autres programmes. Jeux (Roblox, mods), logiciels embarqués, Neovim.
- Dart (2011) : langage de Google optimisé pour les interfaces. Applications mobiles et web avec Flutter.
- Swift (2014) : langage moderne d'Apple, rapide et sûr. Applications iPhone, iPad, Mac, Apple Watch.
- Objective-C (1984) : ancien langage d'Apple (C avec des objets). Vieilles applications iOS et macOS, remplacé peu à peu par Swift.
- Haxe (2005) : se compile vers de nombreuses plateformes. Jeux et applications multiplateformes.
- Crystal (2014) : syntaxe proche de Ruby avec la vitesse d'un langage compilé. Outils en ligne de commande, serveurs web.

## 4. Langages système et haute performance — proches du matériel (mémoire, processeur, périphériques) ; rapides mais exigeants
- C (1972) : bas niveau et portable, contrôle direct de la mémoire. Systèmes d'exploitation (noyau Linux), pilotes, microcontrôleurs ; base de nombreux autres langages.
- C++ (1985) : C avec programmation orientée objet et abstractions puissantes. Jeux vidéo, moteurs graphiques, navigateurs, logiciels de bourse, simulation.
- Rust (2010) : performance du C++ avec sécurité mémoire garantie à la compilation. Systèmes, outils, serveurs, WebAssembly ; utilisé dans le noyau Linux.
- Zig (2016) : alternative moderne à C, simple et explicite. Programmation système, outils de compilation.
- D (2001) : compilé, vise à améliorer C++. Logiciels performants, outils.
- Nim (2008) : syntaxe lisible, compilé vers C, très rapide. Outils système, jeux, scripts rapides.
- Ada (1983) : conçu pour la fiabilité et la sécurité. Aéronautique, ferroviaire, défense, systèmes critiques.
- Assembleur (années 1950) : instructions du processeur écrites sous forme lisible (une famille par architecture : x86, ARM, RISC-V). Démarrage de systèmes, optimisation extrême, analyse de logiciels, rétro-ingénierie.
- Fortran (1957) : premier langage scientifique de haut niveau, calcul numérique. Météo, physique, simulation, supercalculateurs.
- COBOL (1959) : gestion et traitements de masse. Banques, assurances, administrations : encore des milliards de lignes en service.

## 5. Développement mobile — applications pour téléphones et tablettes
- Kotlin (2011) : recommandé pour Android. Applications Android natives.
- Java (1995) : langage historique d'Android. Anciennes applications Android.
- Swift (2014) : langage natif d'Apple. iOS, iPadOS, macOS, watchOS.
- Dart + Flutter (2011 / 2017) : un seul code pour Android, iOS, web et bureau. Applications multiplateformes avec interface soignée.
- JavaScript / TypeScript + React Native (2015) : applications mobiles à partir de compétences web. Équipes qui partagent le code web et mobile.
- C# + .NET MAUI / Xamarin (2002 / 2022) : applications mobiles en C#. Environnements Microsoft.

## 6. Données, science et intelligence artificielle — analyse de données, statistiques, calcul scientifique, apprentissage automatique
- Python (1991) : langage numéro un de l'IA (bibliothèques NumPy, Pandas, scikit-learn, TensorFlow, PyTorch). Apprentissage automatique, vision, traitement du langage, analyse de données.
- R (1993) : dédié aux statistiques et à la visualisation. Recherche, biostatistique, sondages ; graphiques avec ggplot2.
- Julia (2012) : calcul scientifique rapide avec une syntaxe simple. Simulation, mathématiques appliquées, finance.
- MATLAB (1984) : environnement de calcul matriciel et de simulation. Ingénierie, traitement du signal, automatique.
- SAS (1976) : logiciel et langage d'analyse statistique. Santé, banque, assurance.
- Mojo (2023) : pour l'IA, syntaxe proche de Python avec vitesse accrue. Calcul IA haute performance (récent, en évolution).
- CUDA (2007) : extension de C/C++ pour programmer les cartes graphiques NVIDIA. Entraînement de modèles d'IA, calcul parallèle.
- OpenCL (2009) : standard ouvert de calcul sur GPU et autres processeurs. Calcul parallèle multiplateforme.
- Wolfram Language (1988) : calcul symbolique et mathématique. Mathématiques, recherche, enseignement (Mathematica).

## 7. Bases de données et langages de requête — stocker, trouver et modifier des informations
- SQL (1974) : langage standard des bases relationnelles (SELECT, INSERT, UPDATE, DELETE, JOIN). MySQL, PostgreSQL, SQLite, SQL Server, Oracle. Indispensable pour tout développeur.
- PL/SQL (1992) : extension procédurale de SQL pour Oracle. Procédures stockées, logique dans la base.
- T-SQL (1989) : extension de SQL pour Microsoft SQL Server. Procédures, déclencheurs, rapports.
- GraphQL (2015) : langage de requête d'API, le client demande exactement les champs voulus. Alternative aux API REST.
- Cypher (2011) : requêtes sur bases de données graphes. Neo4j : réseaux sociaux, recommandations, détection de fraude.
- SPARQL (2008) : requêtes sur des données liées (web sémantique). Wikidata, données ouvertes.
- XPath / XQuery (1999 / 2007) : navigation et requêtes dans des documents XML. Extraction de données, tests web.

## 8. Scripts et administration système — automatiser les tâches répétitives, gérer serveurs et ordinateurs
- Bash / Shell (1989) : interpréteur de commandes Linux/macOS (enchaîner des commandes, boucles, conditions). Automatisation, déploiement, maintenance de serveurs.
- Zsh / Fish (1990 / 2005) : shells modernes avec meilleure ergonomie. Terminal quotidien des développeurs.
- PowerShell (2006) : shell et langage de script de Microsoft, basé sur des objets. Administration Windows, Azure, Active Directory.
- Batch .bat (1981) : scripts de l'ancien invite de commandes Windows. Petites automatisations Windows.
- AWK (1977) : traitement de fichiers texte en colonnes. Analyse de journaux (logs), extraction de champs.
- sed (1974) : éditeur de flux pour transformer du texte. Remplacements en masse dans des fichiers.
- Tcl (1988) : langage de script simple. Tests, outils EDA, interface Tk.
- AppleScript (1993) : automatisation des applications macOS. Contrôler Finder, Mail, Notes.
- VBA (1993) : macros de Microsoft Office. Automatiser Excel, Word, Access.

## 9. Programmation fonctionnelle et logique — on compose des fonctions pures ou on exprime des règles, au lieu de modifier des données pas à pas
- Haskell (1990) : fonctionnel pur, typage très puissant. Recherche, finance, compilateurs ; excellent pour apprendre la théorie.
- Lisp (1958) : un des plus anciens langages, le code est de la donnée. Intelligence artificielle historique, Emacs. Influence énorme.
- Scheme / Racket (1975 / 1995) : dialectes minimalistes de Lisp. Enseignement, recherche en langages.
- Clojure (2007) : Lisp moderne sur la JVM. Applications concurrentes et traitement de données.
- Erlang (1986) : fonctionnel, conçu par Ericsson pour les télécoms. Systèmes qui ne s'arrêtent jamais (WhatsApp l'a utilisé).
- F# (2005) : langage fonctionnel de .NET. Finance, analyse de données.
- OCaml (1996) : fonctionnel typé, performant. Compilateurs, outils, trading.
- Elm (2012) : fonctionnel pour interfaces web, sans erreur d'exécution courante. Front-end fiable.
- Prolog (1972) : langage logique, on décrit des faits et des règles, le système déduit. IA symbolique, systèmes experts, traitement du langage.

## 10. Jeux vidéo et graphismes
- C++ (1985) : cœur des moteurs de jeu et des logiciels graphiques. Unreal Engine, moteurs maison, jeux AAA.
- C# (2000) : langage de script de Unity. Jeux mobiles, indépendants, réalité virtuelle.
- GDScript (2014) : langage de Godot, proche de Python. Jeux 2D et 3D indépendants.
- Lua (1993) : script léger intégré aux jeux. Roblox, World of Warcraft (extensions), mods.
- GLSL / HLSL (2004 / 2002) : langages de shaders, programmes exécutés sur la carte graphique. Effets visuels, lumière, ombres, post-traitement.
- Blueprint (2014) : programmation visuelle par blocs d'Unreal Engine. Concevoir la logique sans écrire de code.

## 11. Électronique, objets connectés et matériel
- C / C++ (Arduino) (2005) : programmer des microcontrôleurs (lire des capteurs, commander des moteurs et des LED). Prototypage, domotique, robots.
- MicroPython / CircuitPython (2014) : Python allégé pour microcontrôleurs. ESP32, Raspberry Pi Pico, projets éducatifs.
- Verilog (1984) : langage de description de matériel (HDL). Conception de puces et de FPGA.
- VHDL (1983) : autre langage HDL, plus strict. Aéronautique, défense, circuits numériques.
- Ladder Logic (années 1960) : programmation graphique en schémas à relais. Automates industriels (PLC).
- LabVIEW / langage G (1986) : programmation graphique par blocs reliés. Mesures, instrumentation, bancs de test.

## 12. Blockchain et contrats intelligents
- Solidity (2014) : langage des contrats intelligents sur Ethereum. Finance décentralisée (DeFi), jetons, NFT.
- Vyper (2018) : alternative plus simple et plus sûre à Solidity. Contrats Ethereum.
- Move (2019) : axé sur la sécurité des actifs numériques. Blockchains Aptos et Sui.
- Rust (2010) : utilisé pour les programmes de plusieurs blockchains. Solana, Polkadot, NEAR.

## 13. Balisage, données et configuration — décrivent des documents ou des paramètres plutôt que des calculs ; pas des langages de programmation au sens strict
- XML (1998) : format de balisage extensible et strict. Échange de données, flux RSS, Office, configurations.
- JSON (2001) : format léger de données (clé : valeur). Standard des API web et des fichiers de configuration.
- YAML (2001) : format lisible par l'humain, basé sur l'indentation. Docker Compose, Kubernetes, GitHub Actions.
- TOML (2013) : format de configuration simple. Fichiers Rust (Cargo) et Python (pyproject).
- Markdown (2004) : mise en forme de texte avec des symboles simples. Documentation, README, notes, blogs.
- LaTeX (1984) : composition de documents scientifiques. Thèses, articles, formules mathématiques.
- SVG (2001) : graphismes vectoriels décrits en XML. Icônes et illustrations web.

## 14. DevOps, cloud et infrastructure — déployer, configurer et surveiller automatiquement serveurs et applications
- HCL / Terraform (2014) : décrit l'infrastructure sous forme de code. Créer serveurs, réseaux, bases sur AWS, Azure, Google Cloud.
- Dockerfile (2013) : recette pour construire une image de conteneur. Empaqueter une application avec tout ce qu'il lui faut.
- Ansible / YAML (2012) : automatisation de configuration de serveurs. Installer et configurer des dizaines de machines.
- Makefile (1976) : règles de compilation et de tâches. Construire des projets, enchaîner des commandes.
- Nix (2003) : langage fonctionnel pour des systèmes reproductibles. Gestion de paquets et configurations exactes.
- Python / Go / Bash : langages d'outillage les plus courants en DevOps. Scripts de déploiement, outils maison.

## 15. Cybersécurité (usage défensif et professionnel) — les professionnels utilisent surtout des langages généralistes et système pour protéger, auditer et analyser des systèmes dans un cadre légal
- Python (1991) : automatiser des audits, analyser des journaux, écrire des outils de détection. Le langage le plus utilisé en sécurité.
- Bash / PowerShell (1989 / 2006) : automatiser tâches et vérifications sur Linux et Windows. Administration sécurisée, analyse d'incidents.
- C / C++ (1972 / 1985) : comprendre les failles mémoire des logiciels. Développement sécurisé, audit de code.
- Assembleur (années 1950) : lire le code machine. Analyse de logiciels malveillants, rétro-ingénierie.
- SQL (1974) : comprendre les risques d'injection. Sécuriser les requêtes (requêtes préparées).
- JavaScript (1995) : comprendre les failles web côté navigateur. Prévention XSS, sécurité des applications web.
- Go / Rust (2009 / 2010) : outils de sécurité modernes et sûrs. Scanners, outils réseau, logiciels résistants.

## 16. Langages pour apprendre — conçus pour comprendre la logique de programmation
- Scratch (2007) : programmation visuelle par blocs à assembler. Enfants et débutants, créations animées.
- Logo (1967) : la célèbre tortue qui dessine à l'écran. Pédagogie, géométrie.
- BASIC (1964) : langage simple pour débutants. A formé des générations avant l'ère moderne.
- Pascal (1970) : langage structuré pour enseigner la programmation. Enseignement, Delphi.
- Python (1991) : syntaxe très lisible. Choix principal des écoles et universités.
- Blockly / MakeCode (2012 / 2016) : blocs visuels pour micro:bit et jeux. Initiation scolaire.

## 17. Langages historiques et marquants
- ALGOL (1958) : premier langage à structure de blocs. A inspiré C, Pascal, Java et presque tous les autres.
- Simula (1967) : premier langage orienté objet. Origine des classes et objets.
- Smalltalk (1972) : langage purement orienté objet. A inspiré Ruby, Objective-C et les interfaces graphiques.
- APL (1962) : notation mathématique par symboles. Calcul matriciel, finance.
- PL/I (1964) : langage d'IBM combinant science et gestion. Grands systèmes IBM.
- Visual Basic (1991) : applications Windows par glisser-déposer. Outils internes, migration vers .NET.
- Delphi / Object Pascal (1995) : développement rapide d'applications Windows. Logiciels de gestion, encore utilisé.
- Modula-2 / Oberon (1978 / 1987) : descendants de Pascal. Enseignement, recherche en systèmes.

## 18. Langages ésotériques (curiosités) — créés pour l'humour, le défi ou l'expérimentation, pas pour la production
- Brainfuck (1993) : seulement 8 instructions, très difficile à lire. Défis, démonstration de la notion d'ordinateur minimal.
- Malbolge (1998) : conçu pour être presque impossible à programmer. Curiosité.
- LOLCODE (2007) : syntaxe basée sur l'humour d'Internet. Amusement.
- Piet (2001) : programmes sous forme de tableaux colorés. Art et programmation.
- Whitespace (2003) : seuls espaces, tabulations et sauts de ligne comptent. Curiosité.

## 19. Les fonctions de base communes à tous les langages — apprendre un langage, c'est surtout apprendre à manier ces briques
- Variable : une boîte nommée qui contient une valeur (nombre, texte…).
- Type de donnée : nature d'une valeur : entier, décimal, texte, booléen (vrai/faux), liste, dictionnaire.
- Opérateur : symboles de calcul ou de comparaison : + - * / == != < > et ou non.
- Condition (if / else) : faire une chose ou une autre selon une situation.
- Boucle (for / while) : répéter des instructions plusieurs fois.
- Fonction : bloc de code réutilisable, avec des paramètres en entrée et un résultat en sortie.
- Structure de données : organiser plusieurs valeurs : tableau, liste, pile, file, dictionnaire, ensemble, arbre.
- Classe et objet : modèle (classe) qui regroupe des données et des actions, et ses exemplaires (objets).
- Entrées / sorties : lire le clavier, un fichier, le réseau ; afficher du texte ou écrire dans un fichier.
- Gestion d'erreurs : prévoir les problèmes (fichier absent, réseau coupé) avec try / catch ou équivalent.
- Module / bibliothèque : code écrit par d'autres qu'on réutilise (import, require, include).
- Commentaire : notes pour les humains, ignorées par l'ordinateur.

Exemple — même programme (dire si un nombre est pair, puis afficher les nombres de 1 à 5) dans trois langages :

Python :
```python
def est_pair(n):
    return n % 2 == 0

for i in range(1, 6):
    if est_pair(i):
        print(i, "est pair")
    else:
        print(i, "est impair")
```

JavaScript :
```javascript
function estPair(n) {
  return n % 2 === 0;
}

for (let i = 1; i <= 5; i++) {
  console.log(i, estPair(i) ? "est pair" : "est impair");
}
```

C :
```c
#include <stdio.h>

int est_pair(int n) {
    return n % 2 == 0;
}

int main(void) {
    for (int i = 1; i <= 5; i++) {
        printf("%d %s\n", i, est_pair(i) ? "est pair" : "est impair");
    }
    return 0;
}
```
La logique est identique, seule la syntaxe change. C'est pourquoi, une fois un premier langage maîtrisé, le deuxième s'apprend beaucoup plus vite.

## 20. Quel langage choisir selon ton objectif
- Débuter en programmation : Python (ou JavaScript). Syntaxe simple, énormément de ressources gratuites.
- Créer un site web : HTML + CSS + JavaScript. Le trio de base, puis PHP, Node.js ou Python pour le serveur.
- Application Android : Kotlin (ou Flutter/Dart). Outils officiels de Google.
- Application iPhone : Swift. Langage natif d'Apple.
- Application mobile pour les deux : Flutter (Dart) ou React Native. Un code unique pour Android et iOS.
- Intelligence artificielle, données : Python (puis SQL, R). Toutes les bibliothèques d'IA y sont.
- Jeux vidéo : C# (Unity), GDScript (Godot), C++ (Unreal). Selon le moteur de jeu choisi.
- Électronique, objets connectés : C++ Arduino, MicroPython. Contrôle de capteurs et de moteurs.
- Systèmes d'exploitation, performance : C, C++, Rust. Contrôle précis de la machine.
- Administration Linux / serveurs : Bash, Python. Automatiser la maintenance.
- Administration Windows : PowerShell. Outil natif et puissant.
- Cybersécurité : Python, Bash, C, SQL, puis Assembleur. Comprendre les systèmes pour mieux les protéger.
- Blockchain : Solidity, Rust. Contrats intelligents et protocoles.
- Bases de données : SQL. Indispensable, quel que soit le métier.
- Entreprise, banque : Java, C#. Écosystèmes stables et très demandés.
- Automatiser du travail de bureau : Python, VBA. Excel, fichiers, rapports automatiques.

## 21. Conseils pour bien apprendre
- Choisis un seul langage et un objectif concret (un petit site, un jeu, un robot) avant de te disperser.
- Pratique chaque jour, même 30 minutes : écrire du code compte plus que lire de la théorie.
- Lis les messages d'erreur : ils indiquent presque toujours la ligne et la cause du problème.
- Apprends en parallèle Git (suivi de version) et les bases de SQL : ils servent partout.
- Construis des petits projets complets, puis améliore-les.
- Apprends les concepts (variables, boucles, fonctions, structures de données), pas seulement la syntaxe : ils se transfèrent d'un langage à l'autre.
- Utilise la documentation officielle (MDN pour le web, docs.python.org pour Python) et des communautés d'entraide.
- Ne cherche pas le langage parfait : le meilleur langage est celui qui te permet de réaliser ton projet.

Les dates et classements évoluent : les langages populaires changent avec les modes technologiques. Pour suivre les tendances : enquêtes de développeurs (Stack Overflow, GitHub Octoverse) et indice TIOBE.
