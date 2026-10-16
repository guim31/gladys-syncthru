# Gladys Samsung SyncThru integration

External integration for [Gladys Assistant](https://gladysassistant.com) that follows **Samsung
printers** (Xpress, ProXpress, MultiXpress, CLP, CLX, SCX, ML…, and the HP models of the former
Samsung range that kept the same web interface) through their built-in **SyncThru** web service:
printer state, toner levels, drums (imaging units), paper trays and page counters. Fully local: no
account, no cloud, no password, no dependency beyond the official
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

It completes [IPP Printers](https://github.com/guim31/gladys-ipp) for the Samsung models whose IPP
service does not report the supplies.

> **Developed without the hardware: feedback welcome.** Everything was written and tested against
> real SyncThru answers published by pysyncthru and Home Assistant (M2070, C430W, C480FW), not on a
> live printer. Open an issue with the output of `node scripts/probe.mjs <printer address>` (the
> identity is masked) or of the **Test a printer** button if something is wrong on yours.

Not affiliated with Samsung or HP. Samsung and SyncThru are trademarks of their owners.

## What it does

- **One device per printer**: state (Ready, Printing, Sleeping, Warming up, Toner low, Paper jam,
  Out of paper, Error, Unreachable…), online, one level per toner and per drum, one text per paper
  tray (Ready, Empty, or the printer's code), the paper level on the models that report it, and the
  printed / copied page counters when the printer serves them.
- **Read only**: two GETs, `/sws/app/information/home/home.json` and
  `/sws/app/information/counters/counters.json`. Nothing is ever printed, set or reset.
- **Discovery**: printers answering the UPnP printer M-SEARCH are found through the Gladys mediated
  network discovery (SSDP never reaches the sandboxed container: the core sends the search and
  relays the answers), then probed in unicast; only the ones serving a SyncThru document are kept.
  A manual list of addresses covers the others.
- **Its own polling** (every 60 s by default), independent from the Gladys scheduler
  (GladysAssistant/Gladys#3198), with the core's `onPoll` as a fallback. Only the changes are sent,
  stable values again every 6 hours.
- **Two scene triggers**: _Supply running low_ (a toner or a drum crosses the configured threshold)
  and _Paper jam or out of paper_.
- **A dashboard widget**: up to five gauges (toners first), the state, panel text, trays, page count,
  and a _Refresh_ button.
- **Test a printer** action in the Configuration screen.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Samsung printer on the local network whose
  `http://<printer>/sws/app/information/home/home.json` answers (it shows a page of text in a
  browser). The oldest models, with only HTML SyncThru pages, are not supported.

## Installation

In Gladys: **Integrations → Install from GitHub**, with the address of this repository (or from the
store once it is listed). Then open the **Configuration** tab, optionally list the printer
addresses, save, and add the printers from the **Discover** tab.

The user documentation, in four languages, is in [`docs/`](docs/en.md).

## Limits

- Developed without the hardware (see above); the HP models are not verified.
- The paper format of the trays is not shown: SyncThru gives an undocumented numeric code.
- The jam / empty-tray detection reads the front panel text (English, French, German, Spanish) and
  the Samsung error codes (`M1-1110`, `M1-5112`): another panel language may show only _Warning_.
- A printer whose firmware masks its serial number and MAC address is identified by its address:
  give it a fixed one.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
node scripts/probe.mjs 192.0.2.10 [--raw]   # read-only probe of a real printer
node scripts/probe.mjs --ssdp               # who answers the printer M-SEARCH
```

The tests run against the SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`) and a fake
SyncThru HTTP server on `127.0.0.1` serving real answers (`test/fixtures/syncthru/`). See
[`CLAUDE.md`](CLAUDE.md) for the architecture and the pitfalls.

## Credits

- [pysyncthru](https://github.com/nielstron/pysyncthru) by nielstron (MIT): the SyncThru endpoints,
  the meaning of the fields, and real printer answers used as test fixtures.
- The Home Assistant [`syncthru`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/syncthru)
  integration (Apache-2.0): the SSDP search target, the supported-part rules, and a real C430W
  answer used as a fixture.
- Built from the official
  [integration-template-js](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache-2.0](LICENSE).
