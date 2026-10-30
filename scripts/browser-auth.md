# Manual browser authentication

This development helper opens a dedicated Playwright browser. Complete login,
MFA or site verification yourself. It waits for a configured authenticated-page
selector before saving state; it does not click challenges or enter credentials.

For EXT, the success selector is `table.search-table` on `https://ext.to`.

```powershell
npm run auth:ext -- login
npm run auth:ext -- check
npm run auth:ext -- probe
```

`login` reuses the dedicated profile when possible, otherwise waits up to five
minutes for manual verification. Closing the browser or pressing Ctrl+C cancels.
`check` never prompts or logs in: it exits with code 2 when verification is needed.
`probe` verifies manually if necessary, closes the browser, and checks both a new
context loaded from the state JSON and the reopened persistent browser profile.
The profile flow restores missing session cookies from JSON after a restart,
without replacing newer cookies already present in the profile.

Chrome must be installed. Set `HASIMIO_AUTH_BROWSER=msedge` to use installed Edge.
Use `--state-only` to restore just the JSON rather than the full profile.
`--headless` is available for noninteractive checks; interactive login always
requires a visible browser. A site may reject headless or restored sessions even
when verification worked in the original window.

State and the dedicated profile are kept under ignored `playwright/.auth/`.
The JSON includes cookies, local storage and IndexedDB; it does not include
session storage. Treat both files and profile as credentials. Do not commit or
upload them. The helper itself does not request or record passwords.
Use one process per profile. No personal Chrome profile is opened or modified.

Reuse the generic helper from another authorized workflow:

```js
import {openAuthenticatedSession} from './browser-auth.mjs';

const session = await openAuthenticatedSession({
  loginUrl: 'https://internal.example/login',
  checkUrl: 'https://internal.example/dashboard',
  authenticatedSelector: '[data-testid="signed-in-user"]',
  statePath: 'playwright/.auth/internal-state.json',
  profileDir: 'playwright/.auth/internal-profile',
  mode: 'state',
  interactive: true,
}, {
  onLoginRequired: () => console.log('Complete login in the browser.'),
});
try {
  // Perform authorized work through session.page or session.context.
  await session.save(); // Saves only while the authenticated selector is visible.
} finally {
  await session.close();
}
```

The browser-auth helper is standalone tooling; it is not yet connected to
Hasimio's playback-provider requests. In particular, browser verification does
not establish that ordinary Node HTTP requests will be accepted.
