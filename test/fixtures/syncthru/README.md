# SyncThru answers

Real answers of Samsung printers, kept verbatim (CRLF line ends, unquoted keys,
raw line breaks inside strings) except for the identity, anonymized: addresses
in 192.0.2.0/24, invented serial numbers, host names and MAC addresses.

| File                   | Printer                  | Source                                                                                                       |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `m2070-home.js.txt`    | Samsung M2070 (mono)     | [pysyncthru](https://github.com/nielstron/pysyncthru) `tests/test_structure/state1`, MIT, by nielstron       |
| `m2070-counters.js.txt`| same, `counters.json`    | same                                                                                                         |
| `c480fw-home.js.txt`   | Samsung C480FW (colour)  | pysyncthru `tests/test_structure/state2` (serial and MAC masked by the reporter)                             |
| `c430w-home.json`      | Samsung C430W (colour)   | [Home Assistant](https://github.com/home-assistant/core) `tests/components/syncthru/fixtures/state.json`, Apache-2.0 |

The jammed and out-of-paper documents of the tests are derived from these in
the tests themselves (`test/helpers/printers.js`), not captured on a printer.
