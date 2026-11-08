# Vercel public-key refactor
- [x] Remove every runtime import and call that uses the privileged database key.
- [x] Replace phone-only sign-in with verified WhatsApp OTP and persistent device sessions.
- [x] Run assistant reads and writes through the signed-in user's RLS client.
- [x] Disable public WhatsApp/cron automation that cannot be user-authorized safely.
- [x] Add Vercel build output and public environment configuration.
- [x] Pass 25 focused tests, typecheck, build health, and sign-in screen validation.
- [ ] Push clean source to GitHub; direct API push waits on GitHub authorization (normal Git sync may already be connected).
- [ ] Verify live WhatsApp delivery and a production Vercel deployment; waits on phone-provider configuration and deployment access.

# Offline PWA
- [x] Add bleeding-started toggle on calendar dates with backdated cycle boundaries and retained readings.
- [x] Extend predicted fertility colours and bleeding markers across future months; refresh from readings.
- [x] Test bleeding-date validation and future projections; all 16 tests pass.
- [ ] Verify saving a bleeding start and calendar controls in the signed-in app; waits on user signing in (no matching managed session).
- [x] Cache published app pages safely without registering in previews.
- [x] Restore this device's signed-in calendar, charts and previously loaded history offline.
- [x] Queue valid temperature entries, update local predictions and synchronize when connected.
- [x] Show connection/sync state and keep online-only actions clear.
- [x] Verify temperature rules, signed-in offline saving, reload persistence and bot restrictions in preview.
- [ ] Verify published cold-open offline and real reconnect synchronization; waits on publishing this version (preview workers are disabled).