# Anonymous Usage Telemetry

Zoneless can optionally send **anonymous, aggregate usage heartbeats** to
[zoneless.com](https://zoneless.com). Telemetry is **opt-in and off by default**,
and only applies to **self-hosted** instances (not operator-managed hosting).

## Consent

Enable via the checkbox during setup or under **Settings → Anonymous usage**,
or `POST /v1/telemetry` with `{ "enabled": true }` as a platform user.

Disable the same way, or set `ZONELESS_TELEMETRY=0`.

## What is sent

One HTTPS POST roughly once per day when enabled:

| Field                | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `instance_id`        | Random UUID generated at opt-in                              |
| `zoneless_version`   | Package version string                                       |
| `livemode`           | Whether `LIVEMODE=true`                                      |
| `single_tenant`      | Whether single-tenant mode is on                             |
| `setup_completed`    | Whether at least one platform account exists                 |
| `os`                 | `process.platform` (e.g. `linux`)                            |
| `node_major`         | Major Node.js version number                                 |
| `payment_count_7d`   | Bucket: `0`, `1-10`, `11-100`, `101-1000`, `1000+`           |
| `usdc_volume_7d`     | Bucket: `0`, `lt_1k`, `lt_10k`, `lt_100k`, `lt_1m`, `gte_1m` |
| `connected_accounts` | Bucket: `0`, `1`, `2-10`, `11-100`, `100+`                   |

## What is never sent

Emails, business names, domains, API keys, wallet addresses, customer PII,
exact dollar amounts, request bodies, logs, or IP addresses.
