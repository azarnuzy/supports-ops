# Email

Session Links and account emails (email verification and password reset) are delivered asynchronously by the worker: Session Links on the `session-email` queue, account emails on the general `account-email` queue. In production, create a [Resend](https://resend.com) account, add and verify the sending domain's DNS records in Resend, then set `EMAIL_FROM` to an address on that domain and `RESEND_API_KEY` to a Resend API key in `.env` for root Docker Compose production. The managed VPS deployment keeps its separate `deploy/env.production` file because `deploy/deploy.sh` explicitly reads it.

Registering through the form requires email verification before the first sign-in. The verification link is valid for 24 hours, signs the user into their Workspace, and can be re-sent once every 60 seconds. The link points at the API (`BETTER_AUTH_URL`) and then redirects to the Platform, which is the first entry of `CLIENT_ORIGINS`. Users created by `pnpm seed:demo`, `pnpm createsuperuser`, or by an Admin inviting a Human Agent are verified from the start.

The sign-in page's "Forgot password?" emails a single-use reset link valid for 1 hour (limited to 3 requests per minute per IP). Resetting signs out every existing session and signs the user in again. Operator passwords are reset only with the CLI.

For local development, `docker compose -f docker-compose.dev.yaml -f docker-compose.mailpit.yaml up -d` starts Mailpit. The worker defaults to Mailpit at `smtp://localhost:1025`; submit Pre-Chat or register a Workspace, then open [http://localhost:8025](http://localhost:8025) to inspect the Session Link or verification email.
