# VaultMap

VaultMap is a visual repository intelligence tool for exploring public and authorized private GitHub repositories.

## Features

- Public repository scanning with the existing GitHub API flow.
- Secure GitHub App installation support for selected private repositories.
- Server-side permission validation before repository scans and file access.
- React-based repository tree and file viewer without exposing tokens in the browser.

## Required environment variables

See [apps/api/.env.example](apps/api/.env.example) and [apps/web/.env.example](apps/web/.env.example).

- `SESSION_SECRET`: signed cookie secret for server-side auth/session handling.
- `GITHUB_APP_ID`: GitHub App identifier.
- `GITHUB_APP_PRIVATE_KEY`: PEM-encoded GitHub App private key.
- `GITHUB_APP_CLIENT_ID`: OAuth client ID for the GitHub App.
- `GITHUB_APP_CLIENT_SECRET`: OAuth client secret when using the GitHub App callback flow.
- `GITHUB_APP_CALLBACK_URL`: callback URL used by the server.
- `GITHUB_APP_SETUP_URL`: install URL for the app.
- `GITHUB_TOKEN`: optional public API fallback only; never used for private user access.

## GitHub App setup

1. Create a GitHub App in GitHub with only read-only repository permissions for `Contents` and `Metadata`.
2. Choose selected repositories only for installation scope.
3. Configure a callback URL and install URL to your deployed backend.
4. Add the required environment variables listed above.
5. Install the app on the target GitHub organization or user account and grant access only to the repositories that VaultMap should scan.

## Local development

1. Copy the `.env.example` files in the API and web apps to real `.env` files.
2. Start the API with `pnpm --filter @vaultmap/api dev`.
3. Start the web app with `pnpm --filter @vaultmap/web dev`.
4. Open the frontend and scan a public repo, or connect GitHub to authorize selected private repos.

## Deployment notes

- Keep private keys and installation tokens on the server only.
- Do not expose GitHub App credentials in frontend bundles or browser storage.
- Use HTTP-only cookies for session state and validate all GitHub repository grants on the backend before each scan or file fetch.

## Revocation

- Revoke the GitHub App installation in GitHub to remove access immediately.
- Clear the browser session or disconnect the app from VaultMap to end local access.
