# Account deletion audit

## Account-owned Supabase records

The canonical schema in `project-notes/db-needs.md` defines three records keyed directly to `auth.users(id)`:

| Table | User key | Delete behavior |
| --- | --- | --- |
| `saved_searches` | `user_id` | Foreign key uses `ON DELETE CASCADE` |
| `price_watches` | `user_id` | Foreign key uses `ON DELETE CASCADE` |
| `deep_dive_usage` | `user_id` (primary key) | Foreign key uses `ON DELETE CASCADE` |

No repository schema or application write path was found for another account-keyed table, profile row, storage object, or user-ID-bearing record. Because all three owned tables cascade, `DELETE /api/account` does not perform client-side or pre-auth table deletion. The server verifies the bearer token and calls the Supabase admin `deleteUser` operation for that verified user ID; the database foreign keys remove the owned rows with the auth user.

Before production release, confirm the deployed Supabase constraints still match the canonical schema. This is live-environment verification and cannot be proven by the local test suite.

## Records not reliably tied to an account

Search caches/history telemetry, analytics search runs/events/impressions/clicks, search attempts/events, rate-limit events, tester feedback, product/deep-dive caches, Render/Vercel/Sentry logs, and third-party provider records do not store the Supabase user ID in the documented schema. Some use random search/session IDs, an optional feedback email, request metadata, or a one-way IP-derived rate key. They are operational records, not account-owned rows, and the self-service endpoint cannot reliably identify or delete them as part of an account deletion.

## Failure and repeat-request behavior

- Invalid or absent bearer tokens return `401`; no user ID is accepted from the client.
- Missing server-side Supabase configuration returns `503`.
- An admin deletion failure returns a retryable `500` before client-side session/history cleanup.
- A concurrent admin `user_not_found` result is treated as success. A later reuse of a deleted user's invalid token safely returns `401`.
- The service-role/secret key remains server-only.
