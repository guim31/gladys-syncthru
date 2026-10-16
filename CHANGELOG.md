# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-16

### Added

- Samsung printers followed through their SyncThru web service, one device per printer: state
  (ready, printing, sleeping, warming up, toner low, paper jam, out of paper, error,
  unreachable), online, the level of each toner and drum, the state of each paper tray, the paper
  level on the models that report it, and the printed and copied page counters.
- Printers found from the Discover tab when they answer the network search (SSDP), and a manual
  list of addresses for the others.
- Read only: the integration never prints, never changes a setting of the printer.
- Scene triggers _Supply running low_ (a toner or a drum reaches the configured threshold) and
  _Paper jam or out of paper_.
- Dashboard widget _Printer_: toner and drum gauges, state, panel text, trays, page count, and a
  _Refresh_ button.
- _Test a printer_ action in the Configuration tab.
- Every text in English, French, German and Spanish, with the documentation.

[Unreleased]: https://github.com/guim31/gladys-syncthru/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-syncthru/releases/tag/v1.0.1
