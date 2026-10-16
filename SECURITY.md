# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret.** SyncThru status pages need no login, and the integration asks for none: an
  address typed with credentials (`http://user:password@…`) is refused, and masked in the logs.
- **Nothing stored in `/data`.** The configuration (printer addresses, language, interval,
  threshold) lives in Gladys; the last readings are kept in memory only.
- **Network**: plain HTTP GETs, from the container to the printers of the local network, on the
  two read-only SyncThru documents (`home.json`, `counters.json`). HTTPS is accepted for printers
  that redirect to it, without checking their self-signed certificate (nothing secret is sent).
  The SSDP search is sent by the Gladys core (mediated discovery), never by the container.
- Nothing is ever written to a printer.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)), and the printers
and their firmware.
