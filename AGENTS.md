# Architecture
- Use a guarded, generated vite-plugin-pwa worker for offline shells; HTML navigations remain NetworkFirst and messaging workers stay separate.
- Persist approved private reads under an authenticated owner ID, clear them on explicit sign-out, and never use a cached owner as server authorization.
- Queue temperature writes durably before reporting success, overlay them on cached dashboard data, and replay only through the existing authenticated temperature function.
- Keep shared offline session, connection and synchronization state in the authenticated layout so dashboard, history and assistant use the same owner.