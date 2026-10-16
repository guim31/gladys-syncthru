// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks it).
// The words follow the Gladys interface (front/src/config/i18n): "Toner",
// "Tambour", "Bac"; brands are never translated.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const DEFAULT_LANGUAGE = 'fr';

/** One of LANGUAGES, from a config value or a widget request ("fr-FR"). */
export function localeOf(value, fallback = DEFAULT_LANGUAGE) {
  const lang = String(value ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(lang) ? lang : fallback;
}

/** Pick one language out of a multi-language object. */
export function pick(texts, lang) {
  return texts[localeOf(lang)] ?? texts.en;
}

const COLOR_WORDS = {
  en: { black: 'Black', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Yellow', color: 'Color' },
  fr: { black: 'Noir', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Jaune', color: 'Couleur' },
  de: { black: 'Schwarz', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Gelb', color: 'Farbe' },
  es: { black: 'Negro', cyan: 'Cian', magenta: 'Magenta', yellow: 'Amarillo', color: 'Color' },
};

const SLOT_WORDS = {
  en: { tray: (n) => `Tray ${n}`, mp: 'Multi-purpose tray', manual: 'Manual feeder' },
  fr: { tray: (n) => `Bac ${n}`, mp: 'Bac multifonction', manual: 'Alimentation manuelle' },
  de: { tray: (n) => `Fach ${n}`, mp: 'Mehrzweckzufuhr', manual: 'Manuelle Zufuhr' },
  es: { tray: (n) => `Bandeja ${n}`, mp: 'Bandeja multiuso', manual: 'Alimentación manual' },
};

function slotName(lang, slot) {
  const words = SLOT_WORDS[lang];
  return /^\d$/.test(slot) ? words.tray(slot) : words[slot];
}

/** "Toner noir", "Black toner", "Toner Schwarz", "Tóner negro". */
function supplyName(lang, kind, color) {
  const word = COLOR_WORDS[lang][color];
  switch (lang) {
    case 'fr':
      return `${kind === 'toner' ? 'Toner' : 'Tambour'} ${word.toLowerCase()}`;
    case 'de':
      return `${kind === 'toner' ? 'Toner' : 'Trommel'} ${word}`;
    case 'es':
      return `${kind === 'toner' ? 'Tóner' : 'Tambor'} ${color === 'color' ? 'de color' : word.toLowerCase()}`;
    default:
      return `${word} ${kind === 'toner' ? 'toner' : 'drum'}`;
  }
}

/** "Papier bac 1", "Tray 1 paper". */
function paperName(lang, slot) {
  const where = slotName(lang, slot);
  switch (lang) {
    case 'fr':
      return `Papier ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
    case 'de':
      return `Papier ${where}`;
    case 'es':
      return `Papel ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
    default:
      return `${where} paper`;
  }
}

const SLOTS = ['1', '2', '3', '4', '5', 'mp', 'manual'];
const SUPPLIES = [
  ...['black', 'cyan', 'magenta', 'yellow'].map((color) => ['toner', color]),
  ...['black', 'cyan', 'magenta', 'yellow', 'color'].map((color) => ['drum', color]),
];

const BASE_NAMES = {
  en: {
    state: 'State',
    online: 'Online',
    pages_printed: 'Pages printed',
    pages_copied: 'Pages copied',
  },
  fr: {
    state: 'État',
    online: 'En ligne',
    pages_printed: 'Pages imprimées',
    pages_copied: 'Pages copiées',
  },
  de: {
    state: 'Status',
    online: 'Online',
    pages_printed: 'Gedruckte Seiten',
    pages_copied: 'Kopierte Seiten',
  },
  es: {
    state: 'Estado',
    online: 'En línea',
    pages_printed: 'Páginas impresas',
    pages_copied: 'Páginas copiadas',
  },
};

/** Feature names by language and feature key (frozen at creation by Gladys). */
export const FEATURE_NAMES = Object.fromEntries(
  LANGUAGES.map((lang) => {
    const names = { ...BASE_NAMES[lang] };
    for (const [kind, color] of SUPPLIES) {
      names[`${kind}_${color}`] = supplyName(lang, kind, color);
    }
    for (const slot of SLOTS) {
      names[`tray_${slot}`] = slotName(lang, slot);
      names[`tray_${slot}_level`] = paperName(lang, slot);
    }
    return [lang, names];
  }),
);

/** Short gauge labels (≤ 24): the color for a toner, "Tambour" for a drum. */
export const GAUGE_LABELS = Object.fromEntries(
  LANGUAGES.map((lang) => {
    const labels = {};
    for (const [kind, color] of SUPPLIES) {
      labels[`${kind}_${color}`] =
        kind === 'toner' ? COLOR_WORDS[lang][color] : supplyName(lang, kind, color);
    }
    return [lang, labels];
  }),
);

/** The value of the `state` text feature. */
export const STATE_LABELS = {
  en: {
    ready: 'Ready',
    printing: 'Printing',
    sleeping: 'Sleeping',
    warming_up: 'Warming up',
    busy: 'Busy',
    toner_low: 'Toner low',
    warning: 'Warning',
    jam: 'Paper jam',
    out_of_paper: 'Out of paper',
    error: 'Error',
    offline: 'Unreachable',
    unknown: 'Unknown',
  },
  fr: {
    ready: 'Prête',
    printing: 'Impression en cours',
    sleeping: 'En veille',
    warming_up: 'Préchauffage',
    busy: 'Occupée',
    toner_low: 'Toner bas',
    warning: 'Avertissement',
    jam: 'Bourrage papier',
    out_of_paper: 'Plus de papier',
    error: 'Erreur',
    offline: 'Injoignable',
    unknown: 'Inconnu',
  },
  de: {
    ready: 'Bereit',
    printing: 'Druckt',
    sleeping: 'Energiesparmodus',
    warming_up: 'Aufwärmen',
    busy: 'Beschäftigt',
    toner_low: 'Toner niedrig',
    warning: 'Warnung',
    jam: 'Papierstau',
    out_of_paper: 'Kein Papier',
    error: 'Fehler',
    offline: 'Nicht erreichbar',
    unknown: 'Unbekannt',
  },
  es: {
    ready: 'Lista',
    printing: 'Imprimiendo',
    sleeping: 'En reposo',
    warming_up: 'Calentando',
    busy: 'Ocupada',
    toner_low: 'Tóner bajo',
    warning: 'Advertencia',
    jam: 'Atasco de papel',
    out_of_paper: 'Sin papel',
    error: 'Error',
    offline: 'Inaccesible',
    unknown: 'Desconocido',
  },
};

/** The value of a tray text feature. */
export const TRAY_LABELS = {
  en: { ready: 'Ready', empty: 'Empty', alert: 'Alert' },
  fr: { ready: 'Prêt', empty: 'Vide', alert: 'Alerte' },
  de: { ready: 'Bereit', empty: 'Leer', alert: 'Warnung' },
  es: { ready: 'Lista', empty: 'Vacía', alert: 'Alerta' },
};

/** Labels of the widget (short: ≤ 24, except the sentences). */
export const WIDGET_TEXT = {
  state: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  display: { en: 'Display', fr: 'Afficheur', de: 'Anzeige', es: 'Pantalla' },
  pages: {
    en: 'Pages printed',
    fr: 'Pages imprimées',
    de: 'Gedruckte Seiten',
    es: 'Páginas impresas',
  },
  lastReading: {
    en: 'Last reading',
    fr: 'Dernier relevé',
    de: 'Letzte Messung',
    es: 'Última lectura',
  },
  never: { en: 'Not read yet', fr: 'Pas encore lu', de: 'Noch nicht gelesen', es: 'Aún no leída' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noPrinter: {
    en: 'No printer added yet: add one from the Discover tab of the integration.',
    fr: "Aucune imprimante ajoutée : ajoutez-en une depuis l'onglet Découverte de l'intégration.",
    de: 'Noch kein Drucker hinzugefügt: Füge einen im Tab „Entdecken“ der Integration hinzu.',
    es: 'Aún no hay ninguna impresora: añada una desde la pestaña Descubrir de la integración.',
  },
  refreshed: {
    en: 'Printer read again',
    fr: 'Imprimante relue',
    de: 'Drucker neu gelesen',
    es: 'Impresora leída de nuevo',
  },
  refreshFailed: {
    en: 'The printer does not answer',
    fr: "L'imprimante ne répond pas",
    de: 'Der Drucker antwortet nicht',
    es: 'La impresora no responde',
  },
};

/** Messages of the Configuration screen. */
export const MESSAGES = {
  initFailed: {
    en: 'Startup failed: see the integration logs.',
    fr: "Échec du démarrage : consultez les journaux de l'intégration.",
    de: 'Start fehlgeschlagen: Sieh in den Protokollen der Integration nach.',
    es: 'Error al iniciar: consulte los registros de la integración.',
  },
  invalidAddress: {
    en: 'Invalid address: type an IP, a hostname or an http(s):// URL, without a password.',
    fr: 'Adresse invalide : saisissez une IP, un nom d’hôte ou une URL http(s)://, sans mot de passe.',
    de: 'Ungültige Adresse: Gib eine IP, einen Hostnamen oder eine http(s)://-URL ohne Passwort ein.',
    es: 'Dirección no válida: introduzca una IP, un nombre de host o una URL http(s)://, sin contraseña.',
  },
};

/** Why a printer did not answer, by SyncThruError code. */
export const FAILURES = {
  unreachable: {
    en: 'no answer (address, network or printer off)',
    fr: 'aucune réponse (adresse, réseau ou imprimante éteinte)',
    de: 'keine Antwort (Adresse, Netzwerk oder Drucker aus)',
    es: 'sin respuesta (dirección, red o impresora apagada)',
  },
  timeout: {
    en: 'no answer within 10 s',
    fr: 'pas de réponse en 10 s',
    de: 'keine Antwort innerhalb von 10 s',
    es: 'sin respuesta en 10 s',
  },
  http: {
    en: 'the web server refused the request',
    fr: 'le serveur web a refusé la requête',
    de: 'der Webserver hat die Anfrage abgelehnt',
    es: 'el servidor web rechazó la solicitud',
  },
  not_syncthru: {
    en: 'no SyncThru JSON service at this address',
    fr: 'pas de service JSON SyncThru à cette adresse',
    de: 'kein SyncThru-JSON-Dienst unter dieser Adresse',
    es: 'no hay servicio JSON SyncThru en esta dirección',
  },
  invalid_address: {
    en: 'invalid address',
    fr: 'adresse invalide',
    de: 'ungültige Adresse',
    es: 'dirección no válida',
  },
};

/** The test action: "C430W found: Ready, black toner 8 %…". */
export function testMessage({ address, printer, state, lowThreshold }) {
  const out = {};
  for (const lang of LANGUAGES) {
    const levels = printer.supplies
      .filter((supply) => supply.level !== null)
      .map((supply) => `${FEATURE_NAMES[lang][supply.key]} ${supply.level} %`)
      .join(', ');
    const low = printer.supplies.filter(
      (supply) => supply.level !== null && supply.level <= lowThreshold,
    ).length;
    const model = printer.identity.model || 'SyncThru';
    const parts = {
      en: `${model} answers at ${address}: ${STATE_LABELS.en[state]}.`,
      fr: `${model} répond à ${address} : ${STATE_LABELS.fr[state]}.`,
      de: `${model} antwortet unter ${address}: ${STATE_LABELS.de[state]}.`,
      es: `${model} responde en ${address}: ${STATE_LABELS.es[state]}.`,
    };
    const supplies = {
      en: levels ? ` ${levels}.` : ' No supply level reported.',
      fr: levels ? ` ${levels}.` : ' Aucun niveau de consommable annoncé.',
      de: levels ? ` ${levels}.` : ' Keine Füllstände gemeldet.',
      es: levels ? ` ${levels}.` : ' No se indica ningún nivel de consumible.',
    };
    const lowText = {
      en: ` ${low} below the threshold.`,
      fr: ` ${low} sous le seuil.`,
      de: ` ${low} unter dem Schwellenwert.`,
      es: ` ${low} por debajo del umbral.`,
    };
    out[lang] = `${parts[lang]}${supplies[lang]}${low > 0 ? lowText[lang] : ''}`;
  }
  return out;
}

/** The test action, failed: "No printer answers at 192.0.2.10: …". */
export function testFailedMessage({ address, code }) {
  const reason = FAILURES[code] ?? FAILURES.unreachable;
  return {
    en: `No SyncThru printer at ${address}: ${reason.en}.`,
    fr: `Aucune imprimante SyncThru à ${address} : ${reason.fr}.`,
    de: `Kein SyncThru-Drucker unter ${address}: ${reason.de}.`,
    es: `Ninguna impresora SyncThru en ${address}: ${reason.es}.`,
  };
}
