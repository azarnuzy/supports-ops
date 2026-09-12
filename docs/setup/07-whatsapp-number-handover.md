# Handing the WhatsApp number over from the reseller app

A runbook for moving the business WhatsApp number that currently serves
[`refactor-reseller-app`](https://github.com/azarnuzy/refactor-reseller-app) — deployed on the VPS at
`api.reseller.azarnuzy.com` — over to SupportOps, **and back again**, without re-verifying a number,
re-creating a WABA, or losing a credential.

The design principle behind every step: **change as little as possible.** Same Meta App, same
WhatsApp Business Account, same phone number, same App Secret, same catalog. The only things that
move are the webhook callback URL, the verify token, and which process is switched on. That is what
makes the hand-over reversible in about five minutes.

> **Before you start.** Deploy SupportOps and confirm its API is reachable at
> `https://api.support.azarnuzy.com`. Phases 0–2 change nothing about how the reseller behaves;
> Phase 3 moves live message delivery to SupportOps.

## What moves, and what does not

| Thing | Moves? | Why |
| --- | --- | --- |
| Phone number, WABA, display name, quality rating | no | they stay exactly where they are; only who listens changes |
| Meta App, App Secret | no | reuse the same app — one app, one callback URL, so re-pointing it is atomic |
| Webhook callback URL | **yes** | from the reseller API to SupportOps |
| Verify token | **yes** | SupportOps generates its own; the reseller's stays in its `env.production` for the rollback |
| Access token | new one, additive | a dedicated System User token for SupportOps; the reseller's keeps working, untouched |
| Commerce catalog (`META_WHATSAPP_CATALOG_ID`) | no | it is attached to the WABA, not to the app that listens. It simply goes unused while SupportOps owns the number |
| Conversation history | no | messages stay in whichever product's database received them. There is no migration, and none is wanted |

---

## Phase 0 — Preconditions

- [ ] SSH access to the VPS, and the app directory `/srv/apps/reseller-app` intact
      (`env.production`, `.release.env`, `compose.prod.yaml`, `deploy.sh`)
- [ ] Admin on the Meta App in [developers.facebook.com/apps](https://developers.facebook.com/apps)
      and on the Business in [business.facebook.com/settings](https://business.facebook.com/settings)
- [ ] Pick a quiet hour. Customers mid-conversation on the reseller bot will have their thread
      continue in a different product, and the new product does not know what was said before.
- [ ] SupportOps reachable over public HTTPS — production API host, or a tunnel for local
      development (see [07-whatsapp.md](07-whatsapp.md#a-public-https-callback-url))

---

## Phase 1 — Take the rollback snapshot

This is the phase that makes the rest safe. **Do not skip it, and do not shorten it.** Rolling back
means pasting these exact values back into Meta; if you did not write them down, the rollback turns
into a debugging session.

### 1.1 Read the current values off the VPS

```bash
ssh tencent-lighthouse
cd /srv/apps/reseller-app
grep -E '^(WHATSAPP_ENABLED|META_WHATSAPP_|VITE_WHATSAPP)' env.production
```

### 1.2 Confirm the reseller's live webhook configuration

The callback URL currently registered with Meta is the reseller API's route:

```
https://api.reseller.azarnuzy.com/api/whatsapp/webhook
```

Prove it is live and that the verify token in `env.production` is the one Meta holds:

```bash
curl -i "https://api.reseller.azarnuzy.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<META_WHATSAPP_VERIFY_TOKEN>&hub.challenge=snapshot-ok"
```

`200` with the body `snapshot-ok` means that URL plus that token is a working pair — exactly what you
will paste back on rollback. A `403` means the token in `env.production` is not the one registered in
Meta: fix that mismatch **now**, while the reseller still owns the number, not during a rollback.

Also record it from the Meta side: App Dashboard → **WhatsApp → Configuration**. Screenshot the
Webhook block (callback URL, and which fields are subscribed).

### 1.3 Write the snapshot down

Store it in your password manager, or in a file outside any repository (e.g.
`~/.secrets/whatsapp-handover.md`, `chmod 600`). **Never commit it.**

```markdown
# WhatsApp hand-over snapshot — <date>

Business number (display):   +62...
Phone Number ID:             <META_WHATSAPP_PHONE_NUMBER_ID>
WhatsApp Business Account ID:<WABA_ID>
Meta App:                    <app name> / <app id>
App Secret:                  <META_WHATSAPP_APP_SECRET>
Graph API version:           v25.0

## Reseller (restore these to roll back)
Callback URL:   https://api.reseller.azarnuzy.com/api/whatsapp/webhook
Verify token:   <META_WHATSAPP_VERIFY_TOKEN>
Access token:   <META_WHATSAPP_ACCESS_TOKEN>   (system user? expires?)
Catalog ID:     <META_WHATSAPP_CATALOG_ID>
Identity HMAC:  <WHATSAPP_IDENTITY_HMAC_SECRET>
Subscribed fields: messages
Verified working on <date> with the hub.challenge curl.

## SupportOps (filled in during Phase 2 and 3)
Callback URL:   https://api.support.azarnuzy.com/webhooks/whatsapp
Verify token:   <generated by SupportOps>
Access token:   <system user "supportops" token>
```

### 1.4 Keep a copy of `env.production`

```bash
cp env.production env.production.pre-supportops
chmod 600 env.production.pre-supportops
```

Rollback then costs one `cp` back. Do not put this file in the repo.

### 1.5 Find the WABA ID if the snapshot has a gap

The reseller's `.env` never stored it. Meta Developers console → **WhatsApp → API Setup** shows it
above the phone number selector. Cross-check both directions:

```bash
# the number, from its ID
curl -s "https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>?fields=display_phone_number,verified_name,quality_rating" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# the IDs, from the WABA — <PHONE_NUMBER_ID> must appear in this list
curl -s "https://graph.facebook.com/v25.0/<WABA_ID>/phone_numbers" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## Phase 2 — Give SupportOps its own access token

Additive and reversible: the reseller's token is not touched and keeps working. Separate tokens mean
that revoking SupportOps' access later never takes the reseller down with it.

1. [business.facebook.com/settings](https://business.facebook.com/settings) → **Users → System users**
   → **Add** → name `supportops`.
2. **Add assets** → **WhatsApp accounts** → select the WABA from your snapshot → **Full control**.
3. **Generate new token** → select the same Meta App → expiry **Never** → scopes
   `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy it into the snapshot's SupportOps block. Meta shows it exactly once.

Check what you got — `"expires_at": 0` and `"type": "SYSTEM_USER"`:

```bash
curl -s "https://graph.facebook.com/v25.0/debug_token?input_token=<NEW_TOKEN>&access_token=<NEW_TOKEN>" | jq '.data'
```

Nothing has changed for customers at this point. Messages still reach the reseller. You can stop here
and resume later.

---

## Phase 3 — The cutover

Order matters: **re-point the webhook first, stand the reseller down second.** A Meta App has one
callback URL, so saving the new one moves delivery in a single step with no window where both
products receive. Doing it the other way round leaves a gap where inbound messages hit a reseller
that answers 404.

### 3.1 Connect the Channel in SupportOps

Sign in as an Admin → **Deploy → WhatsApp** → paste the four values from the snapshot:

| Field | Value |
| --- | --- |
| Phone Number ID | the same one the reseller used |
| WhatsApp Business Account ID | from 1.5 |
| Permanent access token | the `supportops` system user token from Phase 2 |
| App Secret | the **same** App Secret — you are reusing the reseller's Meta App |

Press **Verify and connect**. SupportOps calls the Graph API before saving anything; on success it
reveals a **callback URL** and a **verify token** it generated. Copy both into the snapshot.

### 3.2 Re-point the webhook in Meta

App Dashboard → **WhatsApp → Configuration → Webhook → Edit**:

1. Replace the callback URL `https://api.reseller.azarnuzy.com/api/whatsapp/webhook`
   with `https://api.support.azarnuzy.com/webhooks/whatsapp`.
2. Replace the verify token with the one SupportOps generated.
3. **Verify and save.** Meta calls the new URL immediately; a failure here means the URL is not
   publicly reachable over HTTPS, or the token was mistyped. Nothing has moved yet if it fails — the
   old configuration stays in place, which is exactly why this step comes first.
4. Confirm **`messages`** is still the subscribed field, and that nothing else got subscribed.

**Delivery has now moved.** From this moment the reseller receives nothing.

### 3.3 Stand the reseller's WhatsApp agent down on the VPS

The reseller will not receive inbound messages any more, but it still holds a valid token and can
send outbound messages into threads SupportOps now manages. Switch it off:

```bash
ssh tencent-lighthouse
cd /srv/apps/reseller-app

# flip the flag; every META_WHATSAPP_* value stays in the file for the rollback
sed -i 's/^WHATSAPP_ENABLED=.*/WHATSAPP_ENABLED=false/' env.production
grep '^WHATSAPP_ENABLED' env.production

# env vars are injected when the container is created, so recreate it — a plain restart keeps the old value
docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml \
  up -d --force-recreate --wait api

docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml ps
```

Verify the reseller's WhatsApp surface is closed and the rest of the app is unharmed:

```bash
# 404 — the WhatsApp router is disabled
curl -i "https://api.reseller.azarnuzy.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<OLD_VERIFY_TOKEN>&hub.challenge=x"

# 200 — the reseller itself is still up and serving
curl --fail https://api.reseller.azarnuzy.com/health
curl --fail --head https://reseller.azarnuzy.com
```

`WHATSAPP_ENABLED=false` disables both directions in that codebase: the webhook routes return 404 and
the Graph API client refuses to send. The "Order via WhatsApp" button on the public product page is
just a `wa.me` deep link built from `VITE_WHATSAPP_BUSINESS_NUMBER` — it is not an API call and keeps
working. If you do not want customers arriving on a number the reseller no longer answers, rebuild
the platform image with that variable empty; it is a build-time value, so editing `env.production`
alone will not change it.

### 3.4 Verify the hand-over end to end

- [ ] Send a WhatsApp message to the business number from a personal phone
- [ ] It appears in SupportOps and the AI Agent answers in the same thread
- [ ] The reseller's API logs show no WhatsApp activity
- [ ] SupportOps' WhatsApp settings page shows the connected number and a healthy Channel
- [ ] `curl --fail https://api.reseller.azarnuzy.com/health` still passes

---

## Rolling back — giving the number to the reseller again

Same principle, reverse order: switch the receiver on first, then move the webhook, then stop
SupportOps from sending.

### R1. Bring the reseller's WhatsApp agent back up

```bash
ssh tencent-lighthouse
cd /srv/apps/reseller-app

sed -i 's/^WHATSAPP_ENABLED=.*/WHATSAPP_ENABLED=true/' env.production
# or, to restore the whole file exactly as it was:
# cp env.production.pre-supportops env.production

docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml \
  up -d --force-recreate --wait api

# the webhook answers again with the ORIGINAL verify token
curl -i "https://api.reseller.azarnuzy.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<OLD_VERIFY_TOKEN>&hub.challenge=rollback-ok"
```

`200 rollback-ok` before you touch Meta. Do not proceed until you see it.

### R2. Point the webhook back

App Dashboard → **WhatsApp → Configuration → Webhook → Edit** → paste the reseller's callback URL and
verify token from the snapshot → **Verify and save** → confirm the `messages` field.

### R3. Disable the Channel in SupportOps

WhatsApp settings page → turn the Channel **inactive**. Do not delete it: disabling keeps the
encrypted credentials in place, so a second hand-over later is just steps 3.1–3.3 again without any
Meta work. SupportOps will not receive (Meta no longer delivers there) and will not send.

### R4. Confirm

- [ ] A WhatsApp message to the number is answered by the reseller agent again
- [ ] Product catalog cards work again (the catalog was never detached)
- [ ] SupportOps shows the Channel as inactive

Total rollback: two values pasted into Meta, one env flag, one container recreate.

---

## Things worth knowing before you flip

- **In-flight conversations do not transfer.** A customer mid-order on the reseller bot will get the
  SupportOps AI Agent on their next message, with no knowledge of the order. Hence: quiet hour.
- **The 24-hour Customer Service Window is per number, not per product.** After the move, SupportOps
  can reply freely only to customers who wrote within the last 24 hours. Threads older than that
  need the approved Message Template.
- **The catalog keeps working, it is just unused.** `META_WHATSAPP_CATALOG_ID` is attached to the
  WABA. SupportOps does not send catalog cards; the reseller will again as soon as it owns the number.
- **Quality rating is shared.** A bot that spams or gets blocked damages a rating that both products
  inherit. Check it after the move: `GET /v25.0/<PHONE_NUMBER_ID>?fields=quality_rating`.
- **Do not reuse the reseller's verify token in SupportOps.** SupportOps generates its own, and
  keeping them distinct is what makes the snapshot's rollback pair unambiguous.
- **Do not delete the reseller's system user token** to "clean up" after the move. It costs nothing
  to leave in place and is the difference between a five-minute rollback and a token-minting detour.
- **Two apps subscribed at once is the one configuration to avoid.** If you ever create a second Meta
  App instead of reusing this one, verify exactly one app is subscribed before you leave:
  `GET /v25.0/<WABA_ID>/subscribed_apps`. Both subscribed means every customer gets two replies.
