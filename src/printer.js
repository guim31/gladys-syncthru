// -----------------------------------------------------------------------------
// What a SyncThru document says, in plain terms.
//
// The field names and their meaning come from pysyncthru (MIT) and the Home
// Assistant `syncthru` integration (Apache 2.0), checked against the real
// answers kept in their tests (test/fixtures/):
//   - status.hrDeviceStatus: the HOST-RESOURCES-MIB device status,
//     1 unknown, 2 running, 3 warning, 4 testing, 5 down;
//   - status.status1..4: the lines of the front panel display;
//   - toner_<color>, drum_<color>, drum_color: `opt` 0 = not fitted,
//     `remaining` in %, `newError` the printer's error code ("C1-5110");
//   - tray1..tray5, mp, manual: `opt` 1 = installed, `capa` in sheets,
//     `paper_level` (only when GXI_SUPPORT_PAPER_LEVEL is 1), `newError`;
//   - outputTray: [[number, capacity, status text], ...];
//   - counters.json GXI_BILLING_PRINT_TOTAL_IMP_CNT / ..._COPY_...
// -----------------------------------------------------------------------------

export const COLORS = ['black', 'cyan', 'magenta', 'yellow'];

/** Supply keys in display order: the toners first, then the drums. */
export const SUPPLY_KEYS = [
  ...COLORS.map((color) => `toner_${color}`),
  ...COLORS.map((color) => `drum_${color}`),
  'drum_color',
];

/** Input trays: SyncThru key -> feature key. */
export const TRAYS = [
  ['tray1', 'tray_1'],
  ['tray2', 'tray_2'],
  ['tray3', 'tray_3'],
  ['tray4', 'tray_4'],
  ['tray5', 'tray_5'],
  ['mp', 'tray_mp'],
  ['manual', 'tray_manual'],
];

/** Printer states, by priority of what the user must know. */
export const STATES = [
  'ready',
  'printing',
  'sleeping',
  'warming_up',
  'busy',
  'toner_low',
  'warning',
  'jam',
  'out_of_paper',
  'error',
  'offline',
  'unknown',
];

// The front panel speaks the language it was set to: the usual words in the
// four languages of Gladys. `printing` must not catch "Printer" / "Drucker".
const JAM = /jam|bourrage|papierstau|\bstau\b|atasco|inceppa/i;
const OUT_OF_PAPER =
  /out of paper|paper (empty|out)|no paper|(load|add) paper|plus de papier|manque (de )?papier|pas de papier|chargez|kein papier|papier (fehlt|leer|einlegen)|sin papel|(cargue|a[ñn]ada) papel/i;
const PRINTING =
  /\bprinting\b|impression en cours|\bimpression\b|imprimiendo|\bdruckt\b|druckvorgang|\bwird gedruckt\b/i;
const WARMING = /warm|pr[ée]chauff|chauffe|aufw[äa]rm|calentando|calentamiento/i;
const SLEEPING =
  /sleep|power ?sav|veille|[ée]conomie d'[ée]nergie|energiespar|ruhemodus|ahorro|reposo/i;

// Samsung error codes (service manuals): M = paper path, `M1-5112` "Tray 1
// paper empty", `M1-1110` "jam in tray 1"; C = consumables, `C1-1110` "toner
// below 10 %". A heuristic, used only when the printer reports a problem.
const PAPER_EMPTY_CODE = /^M\d-5/i;
const PAPER_JAM_CODE = /^M\d-(?!5)\d/i;
const CONSUMABLE_CODE = /^C\d-\d/i;

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** The printer's code, or '' (some firmwares write "0" for "no error"). */
function errorCode(value) {
  const text = cleanText(value === undefined || value === null ? '' : String(value));
  return text === '0' ? '' : text;
}

function percent(value) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(number)));
}

function count(value) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return null;
  }
  return number >= 0 ? Math.round(number) : null;
}

/**
 * Read a SyncThru answer.
 * @param {object} home parsed home.json
 * @param {object|null} [counters] parsed counters.json
 */
export function readPrinter(home, counters = null) {
  const root = asObject(home);
  const status = asObject(root.status);
  const identity = asObject(root.identity);
  const hr = Number(status.hrDeviceStatus);

  const supplies = [];
  for (const key of SUPPLY_KEYS) {
    const raw = root[key];
    if (raw === undefined) {
      continue;
    }
    const entry = asObject(raw);
    // pysyncthru: `opt` 0 means the part is not fitted (or not reported).
    if (Number(entry.opt ?? 0) === 0) {
      continue;
    }
    const [kind, color] = key.split('_');
    supplies.push({
      key,
      kind,
      color,
      level: percent(entry.remaining),
      code: errorCode(entry.newError),
    });
  }

  const paperLevelSupported = Number(root.GXI_SUPPORT_PAPER_LEVEL) === 1;
  const trays = [];
  for (const [rawKey, key] of TRAYS) {
    const entry = asObject(root[rawKey]);
    // pysyncthru: only `opt` 1 is an installed tray (2 shows up on absent ones).
    if (Number(entry.opt) !== 1) {
      continue;
    }
    trays.push({
      key,
      slot: key.replace('tray_', ''),
      capacity: count(entry.capa),
      level: paperLevelSupported ? percent(entry.paper_level) : null,
      sizeCode: count(entry.paper_size1),
      code: errorCode(entry.newError),
    });
  }

  const outputCodes = (Array.isArray(root.outputTray) ? root.outputTray : [])
    .map((tray) => (Array.isArray(tray) ? errorCode(tray[2]) : ''))
    .filter(Boolean);

  const display = [1, 2, 3, 4]
    .map((line) => cleanText(status[`status${line}`]))
    .filter(Boolean)
    .join(' ');

  const counterRoot = counters ? asObject(counters) : null;
  return {
    identity: {
      model: cleanText(identity.model_name),
      deviceName: cleanText(identity.device_name),
      hostName: cleanText(identity.host_name),
      location: cleanText(identity.location),
      serial: cleanText(identity.serial_num),
      mac: cleanText(identity.mac_addr),
    },
    hrStatus: Number.isInteger(hr) ? hr : null,
    display,
    supplies,
    trays,
    paperLevelSupported,
    outputCodes,
    counters: {
      printed: counterRoot ? count(counterRoot.GXI_BILLING_PRINT_TOTAL_IMP_CNT) : null,
      copied: counterRoot ? count(counterRoot.GXI_BILLING_COPY_TOTAL_IMP_CNT) : null,
    },
  };
}

/** Every error code the printer reports right now. */
export function activeCodes(printer) {
  return [
    ...printer.supplies.map((supply) => supply.code),
    ...printer.trays.map((tray) => tray.code),
    ...printer.outputCodes,
  ].filter(Boolean);
}

/**
 * The state of the printer, one of STATES (never `offline`, which is the
 * absence of an answer).
 * @param {ReturnType<typeof readPrinter>} printer
 * @param {{ lowThreshold?: number }} [options]
 */
export function classifyState(printer, { lowThreshold = 10 } = {}) {
  const hr = printer.hrStatus;
  const text = printer.display;
  const trouble = hr === 3 || hr === 5;
  const codes = trouble ? activeCodes(printer) : [];

  if (JAM.test(text) || codes.some((code) => PAPER_JAM_CODE.test(code))) {
    return 'jam';
  }
  if (OUT_OF_PAPER.test(text) || codes.some((code) => PAPER_EMPTY_CODE.test(code))) {
    return 'out_of_paper';
  }
  if (hr === 5) {
    return 'error';
  }
  if (PRINTING.test(text)) {
    return 'printing';
  }
  if (WARMING.test(text)) {
    return 'warming_up';
  }
  if (SLEEPING.test(text)) {
    return 'sleeping';
  }
  if (hr === 3) {
    const low = printer.supplies.some(
      (supply) => supply.level !== null && supply.level <= lowThreshold,
    );
    const consumableOnly = codes.length > 0 && codes.every((code) => CONSUMABLE_CODE.test(code));
    return low || consumableOnly ? 'toner_low' : 'warning';
  }
  if (hr === 4) {
    return 'busy';
  }
  if (hr === 2) {
    return 'ready';
  }
  return 'unknown';
}

/** Is a supply low, against the configured threshold. */
export function isLow(supply, lowThreshold) {
  return supply.level !== null && supply.level <= lowThreshold;
}

/**
 * The stable platform id of a printer: its serial number, else its MAC, else
 * its address. External ids are forever: never change this order.
 * @param {ReturnType<typeof readPrinter>} printer
 * @param {string} baseUrl
 */
export function platformIdOf(printer, baseUrl) {
  const serial = printer.identity.serial.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Some firmwares mask the serial ("xxxxxxxx"): not an identity.
  if (serial.length >= 4 && !/^(x+|0+)$/.test(serial)) {
    return serial;
  }
  const mac = printer.identity.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (mac.length === 12 && !/^(0+|f+)$/.test(mac)) {
    return `mac-${mac}`;
  }
  const host = String(baseUrl)
    .replace(/^https?:\/\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `host-${host}`;
}

/** The name proposed for the device: "Samsung C430W (Living room)". */
export function printerName(printer, baseUrl) {
  const { deviceName, model, hostName, location } = printer.identity;
  let name = deviceName || (model ? `Samsung ${model}` : '') || hostName;
  if (!name) {
    name = `SyncThru ${String(baseUrl).replace(/^https?:\/\//, '')}`;
  }
  if (location && !name.includes(location)) {
    name = `${name} (${location})`;
  }
  return name.slice(0, 80);
}
