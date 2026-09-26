# Local observability

The app already emits OpenTelemetry traces — tRPC procedures, Drizzle queries,
better-auth, outbound fetches, and anything wrapped in `instrumentedFunction`.
Outside Vercel there is no collector to export them to, so they are dropped.
This brings up a Jaeger to catch them.

## Running it

```bash
docker compose -f docker-compose.observability.yml up -d
```

Then add to `web/.env`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Restart `pnpm dev` — the exporter is set up once at boot, so a running server
will not pick this up. Traces show up at <http://localhost:16686> under the
`expense-tracker` service, a few seconds behind the request (spans are batched).

Tear down with `docker compose -f docker-compose.observability.yml down`, and
drop the two env vars to go back to no export.

## Notes

- Storage is in-memory. Traces do not survive a restart of the container.
- Jaeger listens for OTLP on 4318 (HTTP) and 4317 (gRPC); the UI is on 16686.
- Traces can be read without the UI, which is handy for scripting:
  `curl -s 'localhost:16686/api/traces?service=expense-tracker&limit=50&lookback=1h'`
