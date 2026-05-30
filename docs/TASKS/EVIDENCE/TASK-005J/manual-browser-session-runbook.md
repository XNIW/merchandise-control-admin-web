# TASK-005J Manual Browser Session Runbook

Use this only after Gate 1A bootstrap has been applied.

## Required runtime values

Provide these through local runtime env. Do not commit them and do not paste values into docs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PLATFORM_ADMIN_TEST_EMAIL`
- `PLATFORM_ADMIN_TEST_PASSWORD`
- `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes`

If no password is available, sign in manually through `/auth/login` with the already bootstraped Platform Admin account.

## Manual verification

1. Start the app with the runtime env loaded.
2. Open `/auth/login`.
3. Sign in with the Platform Admin account.
4. Open `/platform`.
5. Verify the overview is authorized and not `not_configured` or `unauthorized`.
6. Open `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/system`, `/platform/operations`.
7. Verify rows are server-rendered through the read model and no mock rows are shown as live.
8. Open `/auth/logout`.
9. Reopen `/platform` and verify data is hidden without a valid session.

## Evidence to record

- Browser date/time.
- Routes checked.
- Whether `/platform/users` and `/platform/shops` showed live read-model rows or a real empty state.
- Whether `/platform/audit` showed real audit rows or a real audit-empty state.
- Confirmation that no password, token, refresh token, JWT or magic link was logged or saved.
