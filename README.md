# quark-remote-client

A Deno service that connects to a browser over CDP and exposes a small HTTP API for Quark Cloud Drive.

## Env

| Name | Default |
| --- | --- |
| `CDP_URL` | `http://127.0.0.1:9222` |
| `RECONNECT_INTERVAL_MS` | `5000` |
| `LOG_LEVEL` | `trace` |
| `SERVER_PORT` | `3000` |

In Docker Compose, use the service name:

```yaml
environment:
  CDP_URL: http://quark-docker:9222
```

## Local

```bash
deno task dev
```

## Docker

See at `docker-compose.yaml`

## Service

OpenAPI document is available at `http://localhost:3000`.

OpenAPI spec at `http://localhost:3000/spec.json`.
