# Google sign-in

Optional. When configured, the sign-in and register pages show **Continue with Google**. Without the credentials the button is hidden and form sign-in and registration work as before.

- An **unknown Google email** gets the same start as form registration — an Organization, its first Workspace, an Admin who is also Organization Admin (named from the Google profile), and the Trial Grant. No verification email is sent; Google has already verified the address.
- A **Google email matching an existing User** signs into that account and links Google to it. The existing User must have verified their email first; an unverified form registration is not linked, so nobody can claim an address by registering it before its owner.
- A Google-only User can add a password from **Profile → Security → Set password**.

## 1. Create the OAuth client

In the [Google Cloud console](https://console.cloud.google.com/), pick or create a project, then:

1. **APIs & Services → OAuth consent screen**: choose **External**, set the app name and support email, and add your email as developer contact. The default scopes (`openid`, `email`, `profile`) are all that is needed. While the app is in **Testing**, only listed test users can sign in; **Publish** it to let anyone.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
3. Under **Authorized redirect URIs**, add the API callback — the API (`BETTER_AUTH_URL`) receives it, not the Platform:
   - Local: `http://localhost:8000/api/auth/callback/google`
   - Production: `https://api.support.azarnuzy.com/api/auth/callback/google`

   Authorized JavaScript origins are not needed.

## 2. Set the env vars

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | The OAuth client secret |

Put both in `.env.local` (development), `.env` (root Docker Compose) or `deploy/env.production` (VPS), then restart the API. Set both or neither: with only one the button stays hidden.

The Platform origin the user returns to must be listed in `CLIENT_ORIGINS`.
