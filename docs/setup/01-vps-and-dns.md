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
```

From a local checkout of this repository, copy the initial non-secret deployment configuration to the VPS. When the usual interactive command is `ssh tencent-lighthouse`, use that same alias directly:

```bash
scp deploy/compose.prod.yaml deploy/deploy.sh deploy/env.production.example \
  tencent-lighthouse:/srv/apps/supports-ops/
```

The alias is convenient on the local computer only. The GitHub Actions setup below uses its resolved IP address, user, and port instead.

On the VPS, turn the example into the production environment file, set permissions to `600`, and replace every placeholder. This file remains only on the server.

```bash
cd /srv/apps/supports-ops
cp env.production.example env.production
chmod 600 env.production
```

The shared Caddy container must be connected to the external `proxy` network and be the only container that publishes ports `80` and `443`. From the local checkout, copy `deploy/supports-ops.caddy` into the shared Caddy configuration directory, then validate and reload Caddy using that installation's normal commands. Caddy obtains and renews certificates automatically once all three DNS records resolve to the VPS.

## GitHub environment

GitHub Actions cannot use the local `tencent-lighthouse` SSH alias: that alias only exists on the developer's computer. Resolve its concrete hostname, user, and port first. Run this **on the local computer**, not on the VPS:

```bash
ssh -G tencent-lighthouse | rg '^(hostname|user|port|identityfile) '
```

The output is similar to this (do not copy these example values):

```text
user ubuntu
hostname 203.0.113.42
port 22
identityfile ~/.ssh/tencent-lighthouse
```

Use the values after `hostname`, `user`, and `port` below. `VPS_HOST` is the public IP address or public hostname, **not** `tencent-lighthouse`.

### Create a dedicated deployment key

Do not upload the personal key used for interactive administration. Create a separate key with no passphrase so the non-interactive GitHub runner can use it:

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/supportops-github-actions" \
  -C "supportops-github-actions"
```

When prompted for a passphrase, leave it empty. Install only the new public key on the VPS. This command uses the existing, working `tencent-lighthouse` alias:

```bash
cat "$HOME/.ssh/supportops-github-actions.pub" | \
  ssh tencent-lighthouse 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
```

Verify the new key works before giving it to GitHub. Replace `ubuntu` and `203.0.113.42` with the resolved user and hostname if they differ:

```bash
ssh -i "$HOME/.ssh/supportops-github-actions" -o IdentitiesOnly=yes \
  ubuntu@203.0.113.42 'docker version --format "{{.Server.Version}}"'
```

The command must print a Docker version. If it reports permission denied for Docker, log in through `ssh tencent-lighthouse` and add the deploy user to the Docker group, then log out and back in:

```bash
sudo usermod -aG docker "$USER"
```

### Capture the pinned server host key

GitHub must verify that it is talking to the real VPS. First record the server key from a trusted connection (for example, the fingerprint shown on your first confirmed SSH login, or the fingerprint displayed in Tencent Lighthouse). Then retrieve the key with the resolved host and port:

```bash
VPS_HOST="203.0.113.42"
VPS_PORT="22"
ssh-keyscan -H -p "$VPS_PORT" "$VPS_HOST" > /tmp/supportops-vps-known-hosts
ssh-keygen -lf /tmp/supportops-vps-known-hosts
```

Compare this fingerprint with the trusted fingerprint before continuing. `ssh-keyscan` alone does not authenticate a server and must not be trusted without this comparison. Copy the complete, hashed output to the clipboard on macOS:

```bash
pbcopy < /tmp/supportops-vps-known-hosts
```

### Add the GitHub secrets and variables

In GitHub, open **azarnuzy/supports-ops → Settings → Environments → New environment**, name it `production`, then use **Add environment secret** for these values:

| Secret | Exact value to paste |
| --- | --- |
| `VPS_HOST` | Resolved `hostname` / public IP, e.g. `203.0.113.42` |
| `VPS_SSH_PRIVATE_KEY` | Entire contents of `$HOME/.ssh/supportops-github-actions` — copy with `pbcopy < "$HOME/.ssh/supportops-github-actions"` |
| `VPS_KNOWN_HOSTS` | Complete output copied from `/tmp/supportops-vps-known-hosts` |

Use **Add environment variable** in that same `production` environment for:

| Variable | Value |
| --- | --- |
| `VPS_USER` | Resolved SSH user, usually `ubuntu` |
| `VPS_PORT` | Resolved SSH port, usually `22` |

Never commit `env.production`, a private key, or `VPS_KNOWN_HOSTS` to the repository. The workflow writes the private key only into the short-lived GitHub Actions runner's `~/.ssh/id_ed25519` file.

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
