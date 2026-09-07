# Email

Session Links are delivered asynchronously by the worker. In production, create a [Resend](https://resend.com) account, add and verify the sending domain's DNS records in Resend, then set `EMAIL_FROM` to an address on that domain and `RESEND_API_KEY` to a Resend API key in `env.production`.

For local development, `docker compose -f docker-compose.dev.yaml -f docker-compose.mailpit.yaml up -d` starts Mailpit. The worker defaults to Mailpit at `smtp://localhost:1025`; submit Pre-Chat, then open [http://localhost:8025](http://localhost:8025) to inspect the Session Link email.
