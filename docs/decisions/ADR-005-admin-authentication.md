# ADR-005: Server-Side Sessions, CSRF Tokens and Permission-Based RBAC

## Status
Accepted — implemented in `backend/src/modules/auth`.

## Context
The CMS admin is a browser app used by a small team. Credentials must never be readable by frontend
JavaScript, sessions must be revocable, and authorization must not be a hard-coded role check.

## Decision
- **Passwords:** `scrypt` from `node:crypto` (N=2^15, r=8, p=3 — an OWASP-listed equivalent of N=2^17, p=1 at
  32 MiB per hash). Parameters are stored with each hash so they can be raised. Unknown emails are verified
  against a dummy hash so timing does not reveal accounts.
- **Sessions:** opaque 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and the
  `__Host-` prefix in production). Only its SHA-256 is stored (`sessions.id`), with expiry (default 12 h) and
  `revokedAt`. Logout and user deactivation take effect on the next request. No JWTs: nothing to revoke-list.
- **CSRF:** synchronizer token per session, returned by login/session and required as `X-CSRF-Token` on every
  unsafe method; plus an `Origin` allow-list check on unsafe requests (also protects login).
- **Rate limiting:** login attempts are counted before the password check, per IP (20 / 15 min) and per
  IP+account (5 / 15 min); successes are refunded. In-memory — one API instance only (see Consequences).
- **Authorization:** `permissions` and `role_permissions` tables; routes declare
  `@RequirePermissions('article:publish')`. A global guard is default-deny: routes are protected unless
  marked `@Public()`. Permissions are loaded from the database per request, so role changes apply immediately.
- **Audit:** logins (success/failure), logouts and every content/media mutation are written to `audit_logs`
  in the same transaction as the change.

## Consequences
- Frontend must send `credentials: 'include'` and the CSRF header; CMS and API must be same-site or proxied.
- User management: `/api/v1/admin/users*` (permission `user:manage`, ADMIN only; never leaves zero active admins) and
  self-service `POST /auth/password`. CLIs: `user:create` (create only, refuses existing emails), `user:reset-password`
  (explicit, confirmed), `user:list`. See `docs/operations/auth-runbook.md`.
- Rate-limit counters must move to Redis/Postgres before running more than one API instance.
- No MFA, email-based self-service recovery or lockout notifications yet (recovery is admin- or CLI-initiated).
