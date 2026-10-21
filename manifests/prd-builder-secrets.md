# Secret: `prd-builder-secrets`

DevOps creates this Secret by hand in the same namespace as the Deployment (currently `stress`). It is **not** in git and no values are stored here. `manifests/deployment.yaml` reads each key below with `secretKeyRef`.

| Key | Required | What it is | Where the value comes from |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | API key the PRD chat and the verification judge use to call Claude | Anthropic console, a key for this app |
| `AUTH_SECRET` | yes | Random string NextAuth uses to sign sessions | Generate: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | yes | Google OAuth client ID for sign-in (restricted to `@blackbuck.com`) | Google Cloud console, OAuth client for this app |
| `AUTH_GOOGLE_SECRET` | yes | Google OAuth client secret for the same client | Same OAuth client |
| `OPENROUTER_API_KEY` | no | Only if a user picks an OpenRouter model in Settings | OpenRouter account |

## Create it

```bash
kubectl create secret generic prd-builder-secrets \
  --namespace stress \
  --from-literal=ANTHROPIC_API_KEY='...' \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=AUTH_GOOGLE_ID='...' \
  --from-literal=AUTH_GOOGLE_SECRET='...' \
  --from-literal=OPENROUTER_API_KEY='...'   # optional; omit the line if unused
```

## Notes

- The Google OAuth client must list `<AUTH_URL>/api/auth/callback/google` as an authorized redirect URI, where `AUTH_URL` is the public URL set in `deployment.yaml`.
- Rotating a value: update the Secret, then restart the Deployment (`kubectl rollout restart deployment/prd-builder -n stress`). Pods read secrets at start.
- Keep real values out of the repo, chat and tickets.
