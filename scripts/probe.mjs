#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a SyncThru printer, with the integration's own client.
//
//   node scripts/probe.mjs <address>          what the integration would see
//   node scripts/probe.mjs <address> --raw    + the documents, identity masked
//   node scripts/probe.mjs --ssdp             who answers the printer M-SEARCH
//
// Only GETs of home.json and counters.json (and one SSDP M-SEARCH with
// --ssdp): nothing is ever written to a printer. The serial number, MAC and
// IP addresses, host name and admin contacts are masked in the output, so it
// can be pasted in an issue.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { buildDevice } from '../src/devices.js';
import { SSDP_SEARCH_TARGET, ssdpAddresses } from '../src/discovery.js';
import { classifyState, readPrinter } from '../src/printer.js';
import { normalizeAddress, readCounters, readHome } from '../src/syncthru/client.js';

const IDENTITY_KEYS = [
  'serial_num',
  'mac_addr',
  'ip_addr',
  'ipv6_link_addr',
  'host_name',
  'admin_email',
  'admin_name',
  'admin_phone',
];

function mask(value) {
  const text = String(value ?? '');
  return text ? `<${text.length} characters masked>` : '';
}

/** A copy of a document without what identifies the printer or its owner. */
function masked(document) {
  const copy = structuredClone(document);
  for (const key of IDENTITY_KEYS) {
    if (copy?.identity && key in copy.identity) {
      copy.identity[key] = mask(copy.identity[key]);
    }
  }
  return copy;
}

async function ssdp() {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const results = [];
  socket.on('message', (message, remote) => {
    results.push({
      source_ip: remote.address,
      source_port: remote.port,
      headers: message.toString(),
    });
  });
  await new Promise((resolve) => socket.bind(0, resolve));
  const search = [
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 3',
    `ST: ${SSDP_SEARCH_TARGET}`,
    '',
    '',
  ].join('\r\n');
  socket.send(search, 1900, '239.255.255.250');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  socket.close();
  const addresses = ssdpAddresses(results);
  console.log(`${results.length} SSDP answer(s), ${addresses.length} address(es) to probe:`);
  for (const address of addresses) {
    try {
      const printer = readPrinter(await readHome(address));
      console.log(`  ${address}: SyncThru, ${printer.identity.model || 'unknown model'}`);
    } catch (err) {
      console.log(`  ${address}: not SyncThru (${err.code ?? err.message})`);
    }
  }
}

async function probe(input, raw) {
  const address = normalizeAddress(input);
  const home = await readHome(address);
  const counters = await readCounters(address);
  const printer = readPrinter(home, counters);
  const fakeGladys = {
    externalIds: (type, id) => ({
      device: `ext:probe:${type}:${id}`,
      feature: (key) => `ext:probe:${type}:${id}:${key}`,
    }),
  };
  const device = buildDevice(fakeGladys, { baseUrl: address, printer }, { language: 'en' });

  console.log(
    `Model:        ${printer.identity.model || '(none)'} / ${printer.identity.deviceName || '(no device_name)'}`,
  );
  console.log(`Location:     ${printer.identity.location || '(none)'}`);
  console.log(
    `Serial / MAC: ${printer.identity.serial ? 'present' : 'absent'} / ${printer.identity.mac ? 'present' : 'absent'}`,
  );
  console.log(`hrDeviceStatus: ${printer.hrStatus}, panel: "${printer.display}"`);
  console.log(`State:        ${classifyState(printer)}`);
  console.log('Supplies:');
  for (const supply of printer.supplies) {
    console.log(`  ${supply.key.padEnd(14)} ${String(supply.level).padStart(4)} %  ${supply.code}`);
  }
  console.log(`Trays (paper level supported: ${printer.paperLevelSupported}):`);
  for (const tray of printer.trays) {
    console.log(
      `  ${tray.key.padEnd(12)} capacity ${tray.capacity}, paper_size1 ${tray.sizeCode}, level ${tray.level}, code "${tray.code}"`,
    );
  }
  console.log(`Output tray codes: ${JSON.stringify(printer.outputCodes)}`);
  console.log(`Counters:     ${counters ? JSON.stringify(counters) : 'not served'}`);
  console.log(
    `Feature keys: ${device.features.map((feature) => feature.external_id.split(':').pop()).join(', ')}`,
  );
  const flags = Object.keys(home).filter((key) => key.startsWith('GXI_'));
  console.log(`GXI flags:    ${flags.map((key) => `${key}=${home[key]}`).join(' ')}`);
  if (raw) {
    console.log('\nhome.json (identity masked):');
    console.log(JSON.stringify(masked(home), null, 2));
    if (counters) {
      console.log('\ncounters.json:');
      console.log(JSON.stringify(counters, null, 2));
    }
  }
}

const args = process.argv.slice(2);
try {
  if (args.includes('--ssdp')) {
    await ssdp();
  } else if (args[0] && !args[0].startsWith('--')) {
    await probe(args[0], args.includes('--raw'));
  } else {
    console.log('Usage: node scripts/probe.mjs <address> [--raw] | --ssdp');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`Failed: ${err.code ?? 'error'}: ${err.message}`);
  process.exitCode = 1;
}
