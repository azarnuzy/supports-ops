# WhatsApp

SupportOps reaches WhatsApp through the **Meta WhatsApp Cloud API**. The Workspace brings its own
Meta App ([ADR-0018](../adr/0018-workspaces-bring-their-own-meta-app.md)): an Admin pastes four
values on the WhatsApp setup page, SupportOps verifies them against the Graph API, and only then
reveals the callback URL and the verify token to paste back into Meta.

This guide covers the case this repo was set up for: **reusing the WhatsApp number that already
serves `refactor-reseller-app`**. Path A (a fresh Meta test number) is documented too, because it is
the faster way to get a first conversation working locally.

## The one constraint that decides everything

A phone number belongs to exactly **one** WhatsApp Business Account (WABA), and a Meta App has
exactly **one** webhook callback URL per product. Several Apps *can* subscribe to the same WABA, and
if they do, **every inbound message is delivered to all of them** — the reseller agent and the
SupportOps AI Agent would both answer the same customer, twice, in the same thread.

So: one number, one live consumer. Pick which product owns the number before touching anything.

| Path | Number | Good for | Cost to the reseller app |
| --- | --- | --- | --- |
| **A. Meta test number** | new, free, issued by a new Meta App | local development, first end-to-end run | none — completely separate |
| **B. Take over the reseller number** | the existing one | demoing SupportOps on the real number | reseller stops receiving WhatsApp messages |
| **C. Second real number on the same WABA** | new, paid/verified | running both products for real | none |

Paths A and C need no coordination. Path B is a hand-over and is spelled out below.

---

## Path A — a Meta test number (recommended first run)

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create app** →
   use case **Other** → type **Business** → name it e.g. `SupportOps Dev`.
2. In the app, **Add product → WhatsApp → Set up**. Meta attaches a test WABA and a free test
   number automatically.
3. Open **WhatsApp → API Setup**. You now have, on one screen:
   - **Phone number ID** (the test number's)
   - **WhatsApp Business Account ID**
   - a temporary 24-hour token (do not use it — see [Permanent access token](#permanent-access-token))
4. Under **To**, add the personal WhatsApp numbers you will test from. A test number can only
   message numbers on that list, up to five of them.
5. Continue at [Connect it in SupportOps](#connect-it-in-supportops).

The test number cannot be used to receive messages from real customers, and it cannot be the
reseller's number. It is for proving the pipeline works.

---

## Path B — take the reseller number over to SupportOps

The summary is below. For the real thing — the rollback snapshot, the exact VPS commands, the
cutover order, and how to hand the number back later — follow
[the hand-over runbook](07-whatsapp-number-handover.md).

### B1. Inventory what you already have

Everything except the WABA ID is already in `refactor-reseller-app/.env`:

| SupportOps asks for | Reseller `.env` key |
| --- | --- |
| Phone Number ID | `META_WHATSAPP_PHONE_NUMBER_ID` |
| App Secret | `META_WHATSAPP_APP_SECRET` |
| Permanent access token | `META_WHATSAPP_ACCESS_TOKEN` (reuse, or mint a new one — see below) |
| WhatsApp Business Account ID | not stored there — fetch it in B2 |
| Verify token | **do not reuse.** SupportOps generates its own (`META_WHATSAPP_VERIFY_TOKEN` stays the reseller's) |

`VITE_WHATSAPP_BUSINESS_NUMBER` in that project is only the `wa.me` deep link on the public product
page. It is not an API credential and keeps working regardless of what you do here.

### B2. Find the WhatsApp Business Account ID

Meta Developers console → your app → **WhatsApp → API Setup**. The WABA ID sits directly above the
phone number selector. Confirm you are looking at the right number:

```sh
curl -s "https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>?fields=display_phone_number,verified_name,quality_rating" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

`display_phone_number` must be the reseller's business number. Cross-check the other direction with
`GET /v25.0/<WABA_ID>/phone_numbers`, which must list that same phone number ID.

### B3. Decide: same Meta App, or a second one

**Reuse the same Meta App (simplest, recommended).** The App Secret, Phone Number ID and token stay
identical; you only re-point the webhook callback URL from the reseller API to SupportOps. Because
an App has one callback URL, doing so hands the number over atomically — there is no window where
both products receive messages.

**A second Meta App** (`SupportOps Prod`) is only worth it if you want independent app secrets and
tokens. Then, in Business Settings, add the existing WABA to the new app, and **unsubscribe the
reseller app from the WABA** so it stops receiving:

```sh
# run with the RESELLER app's token, to remove the RESELLER app's subscription
curl -X DELETE "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <RESELLER_ACCESS_TOKEN>"

# confirm exactly one app remains subscribed
curl -s "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### B4. Stand the reseller's WhatsApp agent down

In `refactor-reseller-app`, set `WHATSAPP_ENABLED="false"` in `.env` (and in `env.production` on the
VPS) and redeploy. Its config schema treats every Meta value as optional once that flag is off, so
nothing else has to change and the values stay in place for a rollback.

Leaving it `true` does not cause double replies on its own once the webhook has moved — the reseller
simply never gets an inbound event again — but it leaves a second process holding a valid token for
your business number, able to send outbound messages into threads SupportOps is managing. Turn it
off.

### B5. Permanent access token

If the reseller's token was minted from a **System User**, it does not expire and can be reused
as-is. Prefer a separate token for SupportOps anyway, so revoking one product's access never takes
the other down:

1. [business.facebook.com/settings](https://business.facebook.com/settings) → **Users → System users**
   → **Add** → name `supportops` → role **Admin** (or Employee with explicit asset access).
2. **Add assets** → **WhatsApp accounts** → select your WABA → enable **Full control**.
3. **Generate new token** → select the SupportOps app → expiry **Never** → scopes:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copy it once; Meta never shows it again.

A token that starts working and then fails a day later is a user token from the API Setup page, not
a system user token. Check what you have:

```sh
curl -s "https://graph.facebook.com/v25.0/debug_token?input_token=<TOKEN>&access_token=<TOKEN>" | jq '.data'
```

`expires_at: 0` and `type: "SYSTEM_USER"` is what you want.

### B6. App Secret

App Dashboard → **App settings → Basic → App Secret → Show**. This is what Meta signs every webhook
delivery with (`X-Hub-Signature-256`); SupportOps refuses any request whose signature does not match
and acts on nothing in its body. If you created a second Meta App in B3, take the **new** app's
secret — the reseller's will fail every request.

---

## A public HTTPS callback URL

Meta will only deliver to a publicly reachable HTTPS endpoint with a valid certificate. SupportOps
serves one shared callback for every Workspace:

```
https://<your-api-host>/webhooks/whatsapp
```

**Production:** `https://api.support.azarnuzy.com/webhooks/whatsapp`. SupportOps builds it from
`BETTER_AUTH_URL`, which is the API's public URL.

**Local development:** `localhost` is not reachable from Meta, so run a tunnel and point Meta at it:

```sh
cloudflared tunnel --url http://localhost:8000     # or: ngrok http 8000
```

Then set the tunnel's URL as `BETTER_AUTH_URL` in `.env.local` so the setup page shows the URL you
will actually paste:

```sh
BETTER_AUTH_URL="https://<random>.trycloudflare.com"
```

The tunnel URL changes every restart on the free tier; when it does, update `BETTER_AUTH_URL`,
restart the API, and re-save the webhook URL in Meta.

## Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `TOOL_MASTER_KEY` | `.env.local` / `.env` | base64-encoded 32 bytes. Already required for Business Tools; it also encrypts the WhatsApp access token and App Secret at rest. Generate with `openssl rand -base64 32`. |
The callback URL is `${BETTER_AUTH_URL}/webhooks/whatsapp`; there is no separate WhatsApp callback
environment variable.

No Meta credential is ever put in an env file. They belong to the Workspace and live encrypted in
the database.

---

## Connect it in SupportOps

1. Sign in as an Admin → sidebar **Deploy → WhatsApp**.
2. Paste the four values: **Phone Number ID**, **WhatsApp Business Account ID**, **permanent access
   token**, **App Secret**.
3. Press **Verify and connect**. SupportOps calls the Graph API with your token, confirms the phone
   number ID really belongs to that WABA, and only then stores the credentials — encrypted — and
   creates the Channel.
   A wrong token or a mismatched WABA fails here with the reason, and nothing is saved.
4. On success the page reveals the **callback URL** and a **verify token** generated by SupportOps.
   The verify token is shown here and nowhere else; you never have to invent or store one.

## Register the webhook in Meta

1. App Dashboard → **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL**: the URL from step 4. **Verify token**: the token from step 4.
3. **Verify and save.** Meta immediately calls your endpoint with `hub.mode=subscribe`; SupportOps
   matches the verify token and echoes `hub.challenge` back. A failure here is almost always the URL
   (not public, not HTTPS, tunnel down) or a mistyped token.
4. Under **Webhook fields**, subscribe to **`messages`**. That single field carries inbound
   messages, media, and delivery/read statuses. Subscribe to nothing else — every extra field is
   traffic SupportOps ignores.

## Verify it end to end

```sh
# the handshake Meta performs, run by hand — expect the challenge echoed back
curl -i "https://<your-api-host>/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=12345"

# an unsigned POST must be rejected
curl -i -X POST "https://<your-api-host>/webhooks/whatsapp" -d '{}'
```

Then, in the platform, the WhatsApp page shows the connected `display_phone_number` and the
Channel's health. Send a WhatsApp message to the number from a real phone (on a test number: from a
phone listed under **To**) and follow it in the Shared Human Queue.

## Day-to-day

- **Disable without losing configuration**: the WhatsApp page's Active toggle. Inbound messages are
  dropped, the credentials stay encrypted in place. Use this rather than deleting when handing the
  number back.
- **Rotating the token**: mint a new system user token, paste it, Verify again. The old one can then
  be revoked in Business Settings.
- **Customer Service Window**: Meta lets you reply freely only within 24 hours of the Customer's
  last message. SupportOps tracks that from `customerLastMessageAt` and closes conversations well
  inside it; outside it, only the one approved Message Template can be sent.
- **Handing the number back to the reseller**: re-point the webhook callback URL to the reseller's
  API, set `WHATSAPP_ENABLED="true"` there, redeploy, and disable the SupportOps Channel. Nothing in
  either database has to change.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "The URL couldn't be validated" when saving the webhook | endpoint not publicly reachable, not HTTPS, tunnel dead, or verify token mistyped |
| Handshake returns 403 | the verify token in Meta is not the one SupportOps generated (the reseller's old token, most likely) |
| Messages arrive but nothing happens; API logs a signature failure | App Secret belongs to a different Meta App than the one delivering the webhook |
| Graph API error code 190 | user token expired — use a system user token (B5) |
| Graph API error code 10 / 200 | token missing `whatsapp_business_messaging` or `whatsapp_business_management` |
| Customer gets two different replies | two Meta Apps still subscribed to the WABA — unsubscribe one (B3) |
| Nothing arrives from a phone that used to work | test number's **To** allow-list, or the number was moved to another WABA |
| `Phone number already connected` on the setup page | another Workspace connected that phone number ID; phone numbers are globally unique in SupportOps |
