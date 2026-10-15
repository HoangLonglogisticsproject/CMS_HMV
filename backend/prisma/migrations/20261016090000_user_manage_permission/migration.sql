-- Additive: a permission for the user-management API, granted to ADMIN only (ADMIN already holds every permission).
-- No existing role loses or gains anything else. Idempotent, so re-running it is harmless.
INSERT INTO "permissions" ("code", "description")
VALUES ('user:manage', 'Create users, assign roles, deactivate accounts, reset passwords and revoke sessions')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleCode", "permissionCode")
VALUES ('ADMIN', 'user:manage')
ON CONFLICT DO NOTHING;
