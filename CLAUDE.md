# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

This one follows **Samsung printers through their SyncThru web service**
(read only): state, toners, drums, trays, page counters. See « Intégration
SyncThru » at the end for the protocol and the pitfalls.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "jam"     # tests whose name matches
node scripts/probe.mjs <address> [--raw]  # read-only probe of a real printer
node scripts/probe.mjs --ssdp             # who answers the printer M-SEARCH
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: registerIntegration() then connect()
src/app.js                        every handler: discovery, polling, states, triggers, widget, action
src/poller.js                     the container's own polling timer (Gladys#3198), onPoll as fallback
src/syncthru/parse.js             reader of the SyncThru JS-object-literal "JSON"
src/syncthru/client.js            read-only HTTP client (home.json, counters.json), address rules
src/printer.js                    a document in plain terms: supplies, trays, counters, state
src/devices.js                    one Gladys device per printer: features, states
src/triggers.js                   scene events on transitions (supply_low, paper_problem)
src/widgets.js                    the `printer` widget content (pure builder)
src/discovery.js                  SSDP answers -> candidate addresses
src/i18n.js                       every text in en/fr/de/es, feature names, messages
src/issues.js                     repeated failures logged once
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
scripts/probe.mjs                 read-only probe for a real printer, identity masked
gladys-assistant-integration.json manifest: name, config_schema, actions, image...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (same sections)
test/                             node --test, against the SDK's fake Gladys + a fake SyncThru server
test/fixtures/syncthru/           real printer answers (pysyncthru, Home Assistant), anonymized
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text** exists in four languages (English, French, German,
  Spanish): action messages, manifest texts, feature names, widget texts, and
  `docs/en.md` / `fr.md` / `de.md` / `es.md`, kept in sync with the same
  sections. `test/i18n.test.js` checks it.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

---

# Notes du mainteneur (guim31)

Ce qui suit complète les règles du template ci-dessus. Ce sont des faits vérifiés dans le code du
cœur Gladys ou payés sur les intégrations déjà publiées par guim31. Ils ne se lisent pas dans le
code de ce dépôt. Compléter ce fichier quand un nouveau piège est découvert.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test`. Prettier contrôle **aussi le Markdown** : lancer `npm run format` après avoir
  modifié ce fichier, le README ou la documentation, sinon la CI tombe.
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel se fait ailleurs.
  Le dire, plutôt que de conclure que « ça marche ».
- **Tout le code de démonstration du template disparaît** : station météo, prise, lampe, caméra,
  capteur de mouvement, `src/weather.js`, leurs tests, leurs entrées du manifeste et de la
  documentation. Il ne reste que ce que l'intégration fait vraiment.
- **Publier n'est jamais le travail d'une session de code** : ni Release, ni tag, ni topic, ni
  version modifiée à la main. L'orchestrateur s'en charge une fois la PR fusionnée. Les workflows
  sont ceux du template : ne pas les modifier.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe, **en millisecondes** (1000, 2000, 10000,
  15000, 30000, 60000). Le template publie `poll_frequency: 300` sans `should_poll` : c'est faux,
  le cœur répond 400 à la découverte. Pour une cadence hors liste, publier `should_poll: false` et
  pousser les états depuis le conteneur, en gardant un `onPoll` de repli.
  **Piège du 5.2.0** (GladysAssistant/Gladys#3198, correctif #3199, relevé sur gladys-ping-wol) :
  un appareil **créé sans `should_poll`** n'est jamais sondé, même après correction du cœur (valeur
  stockée à la création), et la 5.2.1 du 13/10/2026 ne le corrige pas. **Le conteneur sonde donc
  lui-même** par un minuteur, qui saute un appareil sondé il y a moins d'une demi-période, en gardant
  `onPoll` comme repli ; seuls les appareils ajoutés (`gladys.devices`) sont lus. Un test le prouve
  sans appeler `onPoll`.
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- Un état publié sur une fonctionnalité **pas encore ajoutée** dans Gladys reçoit un 200 puis est
  jeté (simple ligne de log) : republier les états dans `onDeviceCreated`.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- **Détecteur d'ouverture (`opening-sensor`) : 0 = ouvert, 1 = fermé** (`OPENING_SENSOR_STATE`), à
  l'inverse de l'intuition et des autres détecteurs (mouvement, fuite, fumée : 1 = détecté). Une
  porte ouverte publiée à 1 s'affiche « Fermé » et fausse scènes et historique. Le figer par un test.
- **Un `external_id` de fonctionnalité ne change jamais d'appareil** d'une version à l'autre. UniFi
  1.5.2 avait sorti les ports PoE dans un appareil dédié, la 1.6.0 les a remis dans la passerelle avec
  les mêmes identifiants : ceux qui avaient ajouté l'appareil dédié ne peuvent plus « Mettre à jour » la
  passerelle (409 `external_id must be unique`). Pour regrouper, garder l'appareil existant
  (`gladys.getDevices()`) ou changer d'identifiant.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié.
- **Aucune commande d'appareil ne permet un choix multiple** : un `text/select` n'a qu'un choix
  actif.
- Un changement de structure fait proposer « Mettre à jour » dans l'onglet Découverte
  (`structure_changed`). Un changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language` si des textes partent du
  conteneur. Le superviseur injecte `TZ`, le fuseau de Gladys. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus **sans `step`** : le navigateur n'accepte alors que `min + k`.
  Min et défaut **entiers** seulement ; une valeur décimale passe par un `select` ou par un
  `string` parsé (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir, et une action
  n'applique **aucun `default`** tout en exigeant les champs `required` (422). Issues
  GladysAssistant/Gladys#3154 et #3155.

**SDK 0.15 et journaux**

- SDK `@gladysassistant/integration-sdk` **^0.15.0** (12/10/2026) : `DEVICE_POLL_FREQUENCIES`, faux
  Gladys de test (`@gladysassistant/integration-sdk/testing`, à préférer à un faux maison),
  déduplication des états, `parseMdnsTxt`. Lire son README et son CHANGELOG.
- **Journaux calmes** (demande de Guilhem, 13/10/2026) : rien au niveau info pour un cycle normal de
  lecture, un état publié ou un message reçu. L'info ne garde que le cycle de vie : démarrage,
  connexion, perte et retour d'un appareil ou d'un service, erreurs utiles, une ligne par action de
  l'utilisateur. Le reste passe en debug (`LOG_LEVEL=debug`). Une erreur qui se répète écrit une ligne
  au premier échec et une au rétablissement, pas une par tentative. Jamais de secret ni d'adresse
  avec identifiants. Un test vérifie qu'un cycle normal n'écrit rien en info.
- **Heartbeat** : republier au moins toutes les 12 h une valeur qui ne change pas, sinon le front
  affiche « Pas de valeur récente » au-delà de 48 h.

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- **Cibler la dernière version publiée du cœur, pas `master`** : la spec de `master` décrit des
  fonctions non publiées. Les boutons de widget qui ouvrent un formulaire (#3168, commit 3feb2cf8)
  sont absents de la 5.1.4 mais **livrés dans la 5.2.0** (sortie le 12/10/2026) : `gladys_version`
  `>=5.2.0` si on s'en sert, ou un bouton direct en repli. Vérifier par `git tag --contains`.

- Un réglage de widget ne propose en liste que les **appareils** de l'intégration
  (`source: "devices"`, seule source dynamique).
- Budget du cœur : **8 composants par widget, dont 2 textes au plus**, appliqué **avant** la
  résolution des références ; un contenu amputé reste en cache jusqu'au TTL. Appeler
  `requestWidgetRefresh` à la création d'un appareil. `validateWidgetContent` est exporté pour les
  tests, mais ne vérifie pas que les `external_id` liés existent : les croiser avec `buildDevice`.
- Une ligne de `status` exige un `value` (nombre ou texte ≤ 40).
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées.
- Le vocabulaire des widgets n'a ni liste ni curseur, **par choix** du cœur. Seul un bouton
  `device_feature` numérique a un état actif natif.
- **En mode sombre, le style `primary` d'un bouton de widget ne se voit pas** (#3153) : signaler
  un choix courant par l'icône (`check-circle`), jamais par le style.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s. Un toast d'action est tronqué à 200 caractères.
- Le cœur met le contenu d'un widget en cache par (réglages, langue, unités) : pré-localiser
  d'après `language` est correct.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil reste le travail d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- `gladys_version` `>=5.1.0` dès qu'il y a widgets, déclencheurs ou actions de scène.

## Store

- Validateur officiel, depuis la racine : `npx -y github:GladysAssistant/integration-store .`
  (schéma, `description` **100 caractères au plus par langue**, documentation de 300 caractères
  au moins, image Docker, cover de **150 Ko au plus**). Il demande Node ≥ 24 mais tourne sous
  Node 22 avec un avertissement.
- L'indexeur lit le manifeste de la **dernière release**, pas celui de `main` : une correction du
  manifeste (catégorie, description…) n'atteint le store qu'avec une release.
- L'indexeur rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  `https://integration-store-storage.gladysassistant.com/index.json`.
- **Image de base** : `FROM public.ecr.aws/docker/library/node:…` (miroir officiel ECR Public, même
  empreinte) et non `node:…` de Docker Hub, qui refuse en 429 les pulls anonymes des runners GitHub
  dès qu'il y a plusieurs builds à la fois. Un échec 429 dans le job « Docker build » n'est pas un bug
  du code. Même parade dans `.github/workflows/build.yml` (posée par l'orchestrateur, ne pas la
  retirer) : QEMU et BuildKit tirés de `mirror.gcr.io`.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi.

### Langues (depuis le 11/10/2026)

Tout texte montré à l'utilisateur existe en **`en`, `fr`, `de` et `es`** : manifeste, contenu des widgets, messages,
noms de fonctionnalités. L'allemand **tutoie** (« du »), l'espagnol **vouvoie** (« usted ») : décision de Guilhem,
appliquée à ses 21 intégrations. `test/i18n.test.js` doit échouer sur une langue manquante, un texte vide ou trop
long, et sur un « Sie »/« Ihr… » de politesse en allemand. Le store exige `docs/en.md` et `docs/fr.md`
(`DOCS_LANGUAGES`) et publie aussi `docs/de.md` et `docs/es.md` quand ils existent
(`DOCS_OPTIONAL_LANGUAGES` d'integration-store) : écrire les quatre, avec les mêmes sections.

## Choix par défaut de Guilhem (12/10/2026)

- Langue par défaut des noms de fonctionnalités et des textes produits par le conteneur : **`fr`**.
- Fichier `LICENSE` Apache-2.0 (texte complet) à la racine.
- `transports` : `local` seul quand le cloud n'est qu'une option annexe.
- Docs `en`, `fr`, `de`, `es` avec les mêmes sections.
- Chauffe, ouverture, sécurité : ne rien rendre pilotable « comme un thermostat » ou par un assistant
  vocal quand une erreur serait dangereuse (leçon d'OctoPrint).

---

# Intégration SyncThru

État au 16/10/2026 : première version (`feat/initial`), **développée sans imprimante**. Vérifiée
seulement par les tests, le lint et le validateur du store, sur les réponses réelles publiées par
pysyncthru (M2070, C480FW) et Home Assistant (C430W).

## Protocole

- Deux GET sans authentification, ceux du mode API de pysyncthru (et donc de Home Assistant) :
  `/sws/app/information/home/home.json` (état, identité, consommables, bacs) et
  `/sws/app/information/counters/counters.json` (compteurs, absent sur beaucoup de modèles : `null`,
  jamais une erreur). Les anciens modèles sans `home.json` (pages HTML seules, que pysyncthru gratte
  en mode AUTO) ne sont **pas** pris en charge, comme dans Home Assistant (`ConnectionMode.API`).
- **Ce « JSON » n'est pas du JSON** : un littéral d'objet JavaScript, clés sans guillemets, fins de
  ligne CRLF, **sauts de ligne bruts dans les chaînes** (C480FW : `status1: "   Warming Up\n
Please Wait..."`), virgules finales, espaces avant `:`. `JSON.parse` refuse tout ;
  `src/syncthru/parse.js` lit ce dialecte (sans rien évaluer, sans prototype). Les fixtures gardent
  les octets d'origine : `test/fixtures/syncthru/` est dans `.prettierignore`.
- Champs (pysyncthru) : `status.hrDeviceStatus` (HOST-RESOURCES-MIB : 1 inconnu, 2 en marche,
  3 avertissement, 4 test, 5 en panne), `status.status1..4` = lignes de l'afficheur ;
  `toner_<couleur>`, `drum_<couleur>` et **`drum_color`** (unité d'imagerie couleur, ignorée par
  pysyncthru, présente sur C430W et C480FW) : `opt` 0 = absent, `remaining` en %, `newError` = code
  Samsung ; `tray1..5`, `mp`, `manual` : **seul `opt` 1 est un bac installé** (`opt` 2 apparaît sur
  un bac absent), `capa` en feuilles, `paper_level` seulement si `GXI_SUPPORT_PAPER_LEVEL` vaut 1
  (supposé en %, jamais vu à 1) ; `newError` `"0"` = pas d'erreur.
- **Format du papier** : `paper_size1` est un code numérique non documenté (4 sur M2070 et C430W,
  1 sur C480FW). Non affiché : un mauvais libellé serait pire. `scripts/probe.mjs` imprime le code
  pour qu'un testeur le compare à son panneau.
- **Identité** (`platformIdOf`, figé pour toujours) : numéro de série en minuscules alphanumériques,
  sinon `mac-<12 hex>`, sinon `host-<adresse>`. Certains firmwares **masquent** série et MAC
  (`xxxxxxxx`, C480FW) : l'appareil est alors lié à son adresse.

## Choix de conception

- **État** (`classifyState`) : bourrage > plus de papier > erreur (hr 5) > impression >
  préchauffage > veille > (hr 3 : toner bas si un consommable est sous le seuil ou si tous les codes
  sont `C…`, sinon avertissement) > occupée (hr 4) > prête (hr 2) > inconnu. Bourrage et papier
  viennent du texte de l'afficheur (mots en/fr/de/es) **ou** des codes Samsung `M<n>-5…` (vide,
  « M1-5112 Tray 1 paper empty ») et `M<n>-<autre>` (bourrage, « M1-1110 »), codes lus seulement
  quand hr vaut 3 ou 5. Heuristique tirée de manuels de service, à confirmer sur matériel.
  `printing` ne doit pas attraper « Printer » ni « Drucker » (`\bdruckt\b`).
- **Fonctionnalités** : `state` text/text (libellé localisé), `online` presence-sensor/binary
  (comme gladys-ping-wol : pastille verte/rouge, condition oui/non), toners et tambours
  `level-sensor/liquid-level-percent` 0-100 (comme gladys-ipp), bacs text/text (« Prêt », « Vide »,
  « Alerte <code> »), `tray_<n>_level`, compteurs `counter-sensor/integer` 0-1e9. Seul ce que
  l'imprimante annonce à la découverte devient fonctionnalité. Tout est `read_only`.
- **États publiés** : seulement ceux des fonctionnalités que l'appareil créé possède (le cœur jette
  les autres) ; `publishChangedStates` avec un battement de 6 h. Imprimante muette : `state`
  « Injoignable » et `online` 0, les niveaux gardent leur dernier relevé.
- **Sondage** : minuteur du conteneur (`src/poller.js`, 60 s par défaut, réglable 30-3600 s,
  réarmé en fin de cycle), `onPoll` en repli ignoré si l'imprimante a été lue il y a moins d'une
  période. Compteurs toutes les 15 min (`COUNTERS_EVERY_MS`). Après 3 échecs, une redécouverte
  (SSDP + liste + adresses connues) au plus toutes les 30 min retrouve une imprimante qui a changé
  d'adresse DHCP ; republier met à jour les `params` (`SYNCTHRU_URL`) des appareils créés.
- **Découverte** : `network_discovery` SSDP sur `urn:schemas-upnp-org:device:Printer:1` (le
  `deviceType` que Home Assistant attend). Toute réponse est sondée en unicast sur `home.json` :
  seules les vraies SyncThru deviennent des appareils (une HP ou une Brother qui répond au même
  M-SEARCH est ignorée). Un scan refusé (cœur ancien, 403) écrit un avertissement, puis la liste
  manuelle suffit.
- **Déclencheurs** : `supply_low` (un toner ou un tambour atteint `low_threshold`, filtres
  imprimante + type, variables nom, consommable, niveau) et `paper_problem` (filtres imprimante +
  problème `jam`/`out_of_paper`, variables nom, problème en clair, texte de l'afficheur). Valeur
  ajoutée sur l'état : un texte localisé ne se filtre pas proprement, et une seule carte couvre
  toutes les cartouches. **Jamais à la première lecture** après un démarrage ; une imprimante
  injoignable garde la mémoire des consommables bas (pas de faux franchissement à son retour) ;
  injoignable dès le démarrage → mémoire inconnue, rien au retour.
- **Widget `printer`** : titre + 5 jauges (toners d'abord, puis tambours) + liste `status` + bouton
  `refresh` = 8 composants. Jauge liée à la fonctionnalité si l'appareil créé l'a, en ligne sinon.
  Les consommables en trop deviennent des lignes ; la liste est coupée à 10 en gardant « Dernier
  relevé ». Rendu sans requête (dernier relevé en mémoire). Couleurs : jamais `primary`.
- **Adresses** : IP, nom d'hôte, URL http(s) avec port ; seule l'origine est gardée. **Une adresse
  avec identifiants est refusée** et masquée (`//***@`) dans le journal : les pages lues n'en
  demandent pas, et une telle adresse finirait dans les `params` de l'appareil. HTTPS accepté sans
  vérifier le certificat auto-signé de l'imprimante (rien de secret n'est envoyé) ; deux
  redirections au plus, même hôte seulement ; réponse plafonnée à 512 Ko et 10 s.
- **Journaux** : info = démarrage, « Ready », découverte demandée, ajout d'un appareil, test,
  configuration, bouton du widget ; une imprimante perdue = un `warn`, son retour = un `info`.
  `test/app.test.js` vérifie qu'un cycle normal n'écrit rien en info et qu'un mot de passe tapé
  dans une adresse n'apparaît nulle part.

## Pièges rencontrés

- `DEVICE_FEATURE_TYPES` du SDK n'a pas de groupe par capteur pour `presence-sensor` ni
  `counter-sensor` : leurs types sont dans le groupe générique `SENSOR` (`TYPES.SENSOR.BINARY`,
  `TYPES.SENSOR.INTEGER`). `TYPES.PRESENCE_SENSOR` vaut `undefined` et plante au démarrage.
- L'ack d'une action ou d'un bouton de widget du faux Gladys renvoie le message sous
  `data.message`, pas directement dans `data`.
- `execFileSync` sur `scripts/probe.mjs` contre un faux serveur du même processus bloque la boucle
  d'événements : le serveur ne répond jamais (utiliser `execFile` asynchrone).
- Le libellé « Sie druckt nichts » (sujet = l'intégration) est refusé par le test de politesse
  allemande : reformuler sans « Sie » en tête de phrase.
- Onglets du cœur : « Discover » / « Découverte » / « Entdecken » / « Descubrir » ; déclencheur
  natif « Device state change » / « Changement d'état de l'appareil » / « Änderung von
  Gerätestatus » / « Cambio de estado del dispositivo » (`front/src/config/i18n`).

## Questions ouvertes

- Sens de `paper_size1` (format des bacs) et de `paper_level` : à relever sur une vraie imprimante
  avec `scripts/probe.mjs <ip> --raw`.
- Les modèles HP de l'ancienne gamme Samsung servent-ils encore `home.json` ?
- Les codes `M<n>-5…` / `M<n>-…` correspondent-ils bien à « vide » / « bourrage » sur la gamme ?
