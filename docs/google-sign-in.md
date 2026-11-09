# Google sign-in setup

Bayit uses "Sign in with Google" so that each person has their own account. You create a free sign-in client in **your own** Google Cloud project once per installation. Bayit asks Google only for the basic `openid`, `email` and `profile` scopes. It never sees anyone's Google password, mail, contacts or files.

You need the exact address of your installation (your **origin**), for example:
- Cloudflare: `https://<project>.pages.dev`
- Docker: the `BAYIT_ORIGIN` you set, e.g. `https://bayit.example.com`

## 1. Create a project

1. Open <https://console.cloud.google.com/> and sign in with the Google account that will manage the installation.
2. Use the project picker at the top to make a **New project**, for example "Bayit". Select it.

## 2. Configure the sign-in screen

1. Open **Google Auth Platform** (search for it in the top bar) and choose **Get started**.
2. **App information:** the app name people will see (for example "Bayit" or "The Cohen family"), and a support email.
3. **Audience:** choose **External**. "Internal" is only for Google Workspace organisations.
4. **Contact information:** your email. Agree to the policy and **Create**.

## 3. Decide who may sign in

A new app starts in **Testing**. While it's in Testing, only the Google accounts you list can sign in. That's ideal for one family:

- **Audience → Test users → Add users:** add the Gmail address of every family member who will sign in (up to 100).

Bayit uses only the basic scopes, so you can also choose **Publish app** to let any Google account through Google's screen. Google may ask you to verify your app's branding. Bayit still decides who gets in: only the owner (`BAYIT_BOOTSTRAP_EMAIL`) and people with an invitation link.

## 4. Create the client

1. **Google Auth Platform → Clients → Create client.**
2. **Application type:** Web application. **Name:** anything, for example "Bayit web".
3. **Authorized redirect URIs → Add URI:**
   ```
   <your origin>/api/auth/callback/google
   ```
   For example `https://cohen-bayit.pages.dev/api/auth/callback/google`. It must match exactly: https, no trailing slash, same spelling.
4. **Create.** Copy the **Client ID** and the **Client secret** straight into your password manager. Google may show the secret only once.

You don't need any "Authorized JavaScript origins".

## 5. Give them to Bayit

- **Cloudflare:**
  ```bash
  npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project>
  npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project>
  ```
  Then redeploy with `npm run deploy:cloud`.
- **Docker:** put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then run `docker compose up -d`.

## 6. Try it

Open your address and choose **Continue with Google**. The owner creates the family; everyone else joins through an invitation from **Settings → Family → Invite**.

## If it doesn't work

| What you see | Why | Fix |
| --- | --- | --- |
| `Error 400: redirect_uri_mismatch` | The redirect URI in Google doesn't exactly match your address. | Copy the URI from the error into the client's **Authorized redirect URIs**. Check https, no trailing slash, and the exact `.pages.dev` name. |
| "Access blocked" or `access_denied` | The app is in Testing and this account isn't a test user. | Add the account under **Audience → Test users**. |
| "The installation owner must allow your account…" | Google worked, but Bayit doesn't know this person yet. | The owner sends them an invitation, or checks `BAYIT_BOOTSTRAP_EMAIL`. |
| "Sign-in is awaiting the owner's setup" | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing. | Add them (step 5) and redeploy or restart. |

Changing your address later (a custom domain, a new project name)? Add the new redirect URI to the same client. You can keep the old one until you've switched.
