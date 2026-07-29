# Account deletion audit

## Account-owned Supabase records

The canonical schema in `project-notes/db-needs.md` defines four records keyed directly to `auth.users(id)`:

| Table | User key | Delete behavior |
| --- | --- | --- |
| `saved_searches` | `user_id` | Foreign key uses `ON DELETE CASCADE` |
| `user_preferences` | `user_id` (primary key) | Foreign key uses `ON DELETE CASCADE` |
| `price_watches` | `user_id` | Foreign key uses `ON DELETE CASCADE` |
| `deep_dive_usage` | `user_id` (primary key) | Foreign key uses `ON DELETE CASCADE` |

The analytics tables also contain an optional `account_id` foreign key with `ON DELETE SET NULL`; it supports internal reporting filters but does not make analytics an account-owned record. Because all four owned tables cascade, `DELETE /api/account` does not perform client-side or pre-auth table deletion. The server verifies the bearer token and calls the Supabase admin `deleteUser` operation for that verified user ID; the database foreign keys remove the owned rows with the auth user and clear any optional analytics account links.

Before production release, confirm the deployed Supabase constraints still match the canonical schema. This is live-environment verification and cannot be proven by the local test suite.

## Records not reliably tied to an account

Search caches/history telemetry, analytics search runs/events/impressions/clicks, search attempts/events, rate-limit events, tester feedback, product/deep-dive caches, Render/Vercel/Sentry logs, and third-party provider records are operational records, not account-owned rows. Analytics may temporarily store a nullable Supabase account ID for signed-in activity; the database clears that link on account deletion. Other records use random search/session IDs, an optional feedback email, request metadata, or a one-way IP-derived rate key, and the self-service endpoint cannot reliably identify or delete them as part of an account deletion.

## Failure and repeat-request behavior

- Invalid or absent bearer tokens return `401`; no user ID is accepted from the client.
- Missing server-side Supabase configuration returns `503`.
- An admin deletion failure returns a retryable `500` before client-side session/history cleanup.
- A concurrent admin `user_not_found` result is treated as success. A later reuse of a deleted user's invalid token safely returns `401`.
- The service-role/secret key remains server-only.
