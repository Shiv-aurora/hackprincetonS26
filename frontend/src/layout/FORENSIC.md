# Forensic Dock Documentation

## Audit row shape

Each row in the forensic table corresponds to one entry from `GET /api/audit`.
The `AuditEntry` interface (defined in `useForensicStream.ts`) has the following fields:

| Field            | Type                                      | Description                              |
|------------------|-------------------------------------------|------------------------------------------|
| `request_id`     | `string`                                  | Unique identifier for this API call      |
| `timestamp`      | `string` (ISO-8601 UTC)                   | When the call was made                   |
| `model`          | `string`                                  | Cloud model name used                    |
| `prompt_length`  | `number`                                  | Length of the proxy prompt in chars      |
| `prompt_hash`    | `string`                                  | SHA-256 hash of the proxy prompt text    |
| `system_length`  | `number`                                  | System message length in chars           |
| `system_hash`    | `string \| null`                          | SHA-256 hash of system message, or null  |
| `max_tokens`     | `number`                                  | Token cap passed to cloud model          |
| `response_length`| `number`                                  | Response length in chars                 |
| `response_hash`  | `string \| null`                          | SHA-256 hash of cloud response, or null  |
| `status`         | `"ok" \| "canary_leak" \| "mock_ok" \| "error"` | Pipeline outcome                  |
| `error_type`     | `string \| null`                          | Error classification if status = "error" |

**Raw prompt and response content is never stored, transmitted to, or rendered by the forensic dock.
Only hashes and lengths are available in this schema by design.**

## What each column shows

| Column          | Content                                                                |
|-----------------|------------------------------------------------------------------------|
| Proxy Sent      | Timestamp (local HH:MM:SS), SHA-256 hash of proxy prompt, prompt length, canary/mock badge |
| Cloud Response  | Model name, SHA-256 hash of cloud response, response length            |
| Rehydrated      | Status string, error type (if any)                                     |

## Canary row styling

Rows with `status === "canary_leak"` are rendered with:
- `background: rgba(244, 135, 113, 0.15)` — error color at 15% opacity
- "CANARY LEAK" badge in `var(--color-error)` bold text in the Proxy Sent column
- Status text also rendered in `var(--color-error)` in the Rehydrated column

These visually alarm the operator that a canary sentinel string reached the cloud API,
indicating a potential privacy bypass of the NGSP pipeline.

## Polling interval

The `useForensicStream` hook polls `GET /api/audit` every **2000 ms** (2 seconds).
It cleans up the `setInterval` on component unmount. Fetch errors are swallowed
silently; the hook returns the last known state rather than throwing or clearing the display.
