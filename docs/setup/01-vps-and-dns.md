# VPS and DNS

This guide covers the actions that require access to the domain registrar, the VPS, or GitHub repository settings. The deployment workflow builds images in GitHub Actions; the server never builds application code.

## DNS

Create `A` records pointing at the VPS public IPv4 address:

| Hostname | Purpose |
| --- | --- |
| `support.azarnuzy.com` | Dashboard |
| `api.support.azarnuzy.com` | API |
| `widget.support.azarnuzy.com` | Web Widget |

Do not proxy these records through a CDN until the first Caddy certificate issuance and HTTPS checks have completed.

## Prepare the VPS

Install Docker Engine with the Compose plugin, then create the shared Caddy network and application directory. Run these commands as the VPS user that GitHub Actions will use (normally `ubuntu`):

```bash
docker network create proxy
sudo install -d -m 700 -o "$USER" -g "$USER" /srv/apps/supports-ops
cd /srv/apps/supports-ops
```

Copy `deploy/env.production.example` from this repository to `/srv/apps/supports-ops/env.production`, set permissions to `600`, and replace every placeholder. This file remains only on the server.

```bash
cp env.production.example env.production
chmod 600 env.production
```

The shared Caddy container must be connected to the external `proxy` network and be the only container that publishes ports `80` and `443`. Copy `deploy/supports-ops.caddy` into the shared Caddy configuration directory, then validate and reload Caddy using that installation's normal commands. Caddy obtains and renews certificates automatically once all three DNS records resolve to the VPS.

## GitHub environment

Create a `production` environment in the `azarnuzy/supports-ops` repository and set these secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP address or hostname |
| `VPS_SSH_PRIVATE_KEY` | Private key for the deploy user |
| `VPS_KNOWN_HOSTS` | Pinned `ssh-keyscan -H` output for the VPS |

Optionally set repository environment variables `VPS_PORT` (defaults to `22`) and `VPS_USER` (defaults to `ubuntu`). Add the matching public key to that user's `~/.ssh/authorized_keys` and allow it to run Docker without `sudo`.

Make the four `ghcr.io/azarnuzy/supports-ops-*` packages public, or add a read-only GHCR credential to the VPS before the first deployment. The workflow uses GitHub's ephemeral token only to publish; the VPS must be able to pull the selected SHA independently.

## First deploy, verification, and rollback

After the workflow has run on `main`, verify:

```bash
curl --fail https://api.support.azarnuzy.com/health
curl --fail --location https://support.azarnuzy.com/
curl --fail --location https://widget.support.azarnuzy.com/
```

Record the deployed SHA from `/srv/apps/supports-ops/.release.env`. Demonstrate rollback once by running the deploy script with the previous known-good SHA:

```bash
cd /srv/apps/supports-ops
./deploy.sh PREVIOUS_COMMIT_SHA
```

Confirm the three HTTPS checks again. A successful rollback replaces `.release.env` with the restored SHA; no image is built on the VPS.
