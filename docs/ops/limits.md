# Operational Limits

## Current Limits

- `maxUploadBytes`: `20 MiB`
- `maxJobsPerIpPerDay`: `10`

These limits are defined in `worker/src/limits.ts`.

## API Behavior

- Upload larger than `maxUploadBytes` must return:
  - `ok: false`
  - `code: "ERR_INVALID_FILE"`

## Recommended Monitoring

- Track upload rejection ratio by day
- Track median conversion completion time
- Track per-IP job distribution to spot abuse
