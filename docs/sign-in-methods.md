# Sign-in methods

Bayit signs people in through **registered sign-in methods**. Google is the first and, today, the only one. An installation can add another method as an extension: new files plus one line in `app/cloud/extensions/signin.mjs` (see `docs/extensions-registry.md`). Upstream ships that file empty and never edits it.

- Core registry: `app/cloud/signin-methods.mjs` (`SIGNIN_METHODS`, Google first, then `EXTRA_SIGNIN`).
- Wiring: `app/cloud/auth.mjs` builds the Auth.js providers from the configured methods and runs every sign-in through core admission.
- Screen: `/api/config` returns `signIn.methods` (`[{id, label:{en,he}}]`, only methods the owner has configured). The sign-in screen shows one button per method. With no method configured it shows no button, only a note that sign-in is not set up yet, plus the sample-data preview.
- Conformance test: `tests/signin-methods.test.mjs`. Every method, core or extra, must pass it.

## What a method provides

A method is an object with exactly these fields. Any other field is refused when the registry loads.

| Field | Meaning |
|---|---|
| `id` | Lowercase id. It is also the Auth.js provider id, so the method's callback is `/api/auth/callback/<id>`. Must be new: it cannot replace `google`. |
| `label` | `{en, he}` button text, e.g. `Continue with Google` / `המשך עם Google`. |
| `start` | How it starts. Only `'authjs'` exists: the app posts the Auth.js CSRF form to `/api/auth/signin/<id>` (`startSignIn(id)` in `app/src/cloud-client.jsx`). |
| `configured(env)` | True when the owner has set up everything the method needs. An unconfigured method is not offered and not built. |
| `provider(env)` | The Auth.js provider that **proves identity**. Its `id` must equal the method `id`. It may not be a `credentials` provider (those bypass database sessions) and may not set `allowDangerousEmailAccountLinking`. Checked every time it is built. |
| `verifiedAccount({profile, account, user})` | The **verified account** the provider returned, as `{email, email_verified}`. `email_verified` is `true` only when the method itself verified that address. Core admission reads only this. Google returns its OpenID profile unchanged. |
| `recentIdentity` | How the method supports the **"confirm it's you"** check before credential changes. Only `'sign-in-again'` exists: the signed-in person completes the method again; on that method's own callback core checks that the returned account is already linked to the same user, and only then marks that one session as recently authenticated (`session_auth`). A different person's account is refused and freshens nothing. |

Example line in `app/cloud/extensions/signin.mjs`:

```js
import {PASSKEY_SIGNIN} from './passkey-signin.mjs';
export const EXTRA_SIGNIN=[PASSKEY_SIGNIN];
```

## What stays in core and a method can never bypass

A method only proves who someone is. Everything below runs in core for every method, and a method has no field that could replace it:

- **Admission** — `signInAllowed` in `app/cloud/registration.mjs`: a verified email; the owner's allowlist (`BAYIT_ALLOWED_EMAILS` / `BAYIT_BOOTSTRAP_EMAIL`); existing household members; a valid invitation permit; open registration only when the owner sets `BAYIT_REGISTRATION_MODE=open`. Also `canCreateHousehold` and the household limit (`BAYIT_MAX_HOUSEHOLDS`). An account whose provider is not a registered method is refused.
- **Account linking** — a second identity can link to a signed-in account only after core confirms it already belongs to that same user.
- **Session creation and lifetime** — Auth.js database sessions, 14 days, expired sessions deleted on read.
- **Session listing and revocation** — `/api/security/sessions` (`ownSessions`), revocation needing a recent identity.
- **The recent-identity window** — 30 minutes for everyone (`RECENT_IDENTITY_MS` in `app/cloud/security.mjs`, user decision 2026-11-10; the client reads it from `/api/security/sessions`).
- **Rate limits** — `limit()` per user and per bucket, the AI limits, and the invitation permit's origin and size checks.
- **Sign-out** and the offline-data clean-up on the device.

## What a passkey method (package 4.1) will need from core

None of this exists yet. 2.4 only built the seam; 4.1 needs the user's approval of each item and a security review.

1. **Credential storage per user.** A table for passkey credentials (credential id, public key, counter, transports, user id, created/last used), plus listing and removing them in Account security. Auth.js's WebAuthn provider expects an `authenticators` table in the adapter, and is marked experimental.
2. **An identity without Google.** Today a person is a verified email. A passkey proves possession of a key, not an email. Core needs a rule for what `verifiedAccount` returns: an email verified some other way (an invitation sent to it, or the owner's setup code), or admission that is keyed on the invitation itself rather than an email. This changes who can sign in, so it is the user's decision.
3. **A first-owner setup code.** A one-time code the owner sets at install (environment or CLI), checked by core, that admits the first account and then expires. Today the first owner is the allowlisted Google email.
4. **Registering a passkey through an invitation.** Joining a family must still go through a valid invitation (and its permit), consumed by core, before a new passkey is stored.
5. **Account recovery.** What happens when a person loses every device with their passkey: a second passkey, a parent-issued recovery invitation, or the owner's operator path. Must not let a parent take over another adult's or a child's identity (see `docs/security-hardening.md`, child identity binding).
6. **Recent identity without a redirect.** `'sign-in-again'` assumes a redirect flow. The client's "confirm it's you" buttons (`security-settings.jsx`, `connection-dialog.jsx`, `riseup-connect.jsx`) call `googleSignIn` directly; they need to ask the server which method the person used and start that one (or a WebAuthn assertion in place).
7. **Server messages that name Google.** `requireRecent` says "Confirm your identity with Google…" and the worker's not-configured messages say "Google sign-in is awaiting…". They should name the method once there is more than one.
8. **Relying-party settings.** The passkey origin and RP id must match the installation's public address (`publicOrigin`), including Docker installations behind a proxy.
9. **Abuse limits** on registration and assertion endpoints, through core `limit()`.
10. **Security review** before release (plan, package 4.1).
