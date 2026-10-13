# WebSocket load testing

The WebSocket load harness ramps concurrent clients through configurable tiers and soaks each passing tier for 10 minutes by default. Authenticated runs send `GET_ROOMS`, measure request-to-response p50/p95/p99, count errors and timeouts, and sample server CPU and memory from `/api/metrics`.

## Production-equivalent run

Use an isolated instance with the same CPU and memory limits, database, reverse proxy, TLS, and server configuration as production. Supply a JSON file containing one distinct valid AUTH payload for every load client. Each payload must contain a unique `telegramId` and either a valid Telegram `initData` value or a current reconnect ticket. Keep this file private; the harness never prints credential contents.

Before starting the server, set a temporary `WS_MAX_TOTAL_CONNECTIONS` and `WS_MAX_CONNECTIONS_PER_IP` at least as high as the largest tier being measured. A single load generator usually appears as one client IP, so either raise that temporary per-IP limit or distribute clients across generator IPs. Keep the remaining WebSocket settings identical to intended production configuration. Production refuses to start without an explicit total cap and a stable `WS_RECONNECT_SECRET` of at least 32 characters.

For example, in PowerShell:

```powershell
$env:WS_LOAD_URL = 'wss://staging.example.com/ws'
$env:WS_LOAD_CREDENTIALS_FILE = 'C:\secure\ws-load-auth.json'
$env:WS_LOAD_TIERS = '100,250,500,1000'
$env:WS_LOAD_SOAK_MS = '600000'
npm run ws:load
```

The harness prints one JSON result per tier. A tier qualifies when authenticated command p95 is below 500 ms, the measured CPU usage and process memory stay at or below 80% of their available capacity, and there are no errors or timeouts. CPU uses the higher of server-process utilization and host-wide utilization. If the target does not expose usable metrics, the run is marked ineligible instead of assuming headroom.

After a run, set `WS_MAX_TOTAL_CONNECTIONS` to the highest qualifying tier and repeat that tier for the full soak with that cap in place. This final result is the single-instance cap; it does not establish multi-instance capacity.

## Short protocol smoke

Run `npm run ws:load -- --self-test` to check client ramping, AUTH, command latency collection, and result formatting against a local protocol fixture. This is a harness smoke only and is never reported as product capacity. For a shorter real-target check, set `WS_LOAD_SOAK_MS` to a small value and use a low tier; short runs do not satisfy the 10-minute capacity acceptance criterion.

## WebSocket settings

See `.env.example` for the configurable admission, rate, queue, timeout, and buffer limits. Configure `WS_TRUSTED_PROXY_IPS` only with the exact direct peer IPs of trusted reverse proxies. The server ignores forwarded IP headers from other peers. WebSocket payload size remains capped at 64 KiB and compression remains disabled.
