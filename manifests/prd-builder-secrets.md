# Secret: `prd-builder-secrets`

DevOps creates this Secret by hand in the same namespace as the Deployment (currently `stress`). It is **not** in git and no values are stored here. `manifests/deployment.yaml` reads each key below with `secretKeyRef`.

Sign-in is handled by Cloudflare Access, so the app needs no Google OAuth client and no session secret.

| Key | Required | What it is | Where the value comes from |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | API key the PRD chat and the verification judge use to call Claude | Anthropic console, a key for this app |
| `OPENROUTER_API_KEY` | no | Only if a user picks an OpenRouter model in Settings | OpenRouter account |

## Create it

```bash
kubectl create secret generic prd-builder-secrets \
  --namespace stress \
  --from-literal=ANTHROPIC_API_KEY='...' \
  --from-literal=OPENROUTER_API_KEY='...'   # optional; omit the line if unused
```

## Not secrets, but required (plain env in `deployment.yaml`)

| Variable | What it is |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Zero Trust team domain, e.g. `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Audience (AUD) tag of the Cloudflare Access application that protects this app |

The app verifies the `Cf-Access-Jwt-Assertion` token against that team's keys and only lets `@blackbuck.com` emails in. Do not expose the Service to anything that bypasses Cloudflare.

## Notes

- Rotating a value: update the Secret, then restart the Deployment (`kubectl rollout restart deployment/prd-builder -n stress`). Pods read secrets at start.
- Google Docs export no longer works in the cluster (it needs a Google OAuth token and client that this deployment doesn't have).
- Keep real values out of the repo, chat and tickets.
