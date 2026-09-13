# Deploying TalkOS

TalkOS is configured for Vercel's native Next.js deployment. The public deployment model uses API credentials supplied by each visitor, so the project can be deployed without environment variables.

## Deploy from GitHub

1. Push the repository to GitHub.
2. In Vercel, select **Add New → Project** and import `sahil-sharma-50/Talk-OS`.
3. Confirm the framework preset is **Next.js** and the root directory is `.`.
4. Leave environment variables empty for the visitor-provided credential model.
5. Select **Deploy**.

Vercel reads `vercel.json`, runs `npm ci`, runs `npm run build`, and serves the Next.js application and API routes over HTTPS.

You can also use the repository's [Deploy with Vercel](https://vercel.com/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsahil-sharma-50%2FTalk-OS) button.

## Verify a deployment

After Vercel reports a successful deployment:

1. Open the HTTPS deployment URL.
2. Confirm the Documents, Sheets, Planner, Research, Canvas, Dashboard, and Settings tabs render.
3. Open **Settings** and save an AssemblyAI API key and published Agent ID.
4. Start voice, grant microphone permission, and confirm live captions appear.
5. Add a Tavily API key and run a small research request if research is needed.
6. Reload the tab and confirm workspace data returns; close the tab session when you want saved credentials cleared.

Microphone access normally requires HTTPS outside localhost. Vercel supplies HTTPS for preview and production URLs.

## Visitor-provided credentials

This is the recommended public configuration and requires no Vercel secrets.

- The visitor enters credentials in TalkOS **Settings**.
- The browser stores them in tab-scoped `sessionStorage`.
- The AssemblyAI credentials are sent to the same-origin token route, which exchanges the API key for a short-lived session token.
- The Tavily key is sent to the same-origin research route only for search and extraction requests.
- The application does not log or persist these values.

Do not add provider keys to variables prefixed with `NEXT_PUBLIC_`; values with that prefix can be included in browser bundles.

## Optional server-funded credentials

Server-funded sessions are intentionally disabled in production. If a private deployment has authentication and usage limits, configure these Vercel environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | Yes for voice | Server-side AssemblyAI credential |
| `ASSEMBLYAI_AGENT_ID` | Yes for voice | Published AssemblyAI agent identifier |
| `TAVILY_API_KEY` | Only for research | Server-side Tavily credential |
| `TALKOS_ALLOW_SERVER_CREDENTIALS` | Yes | Must be exactly `true` to enable server fallback credentials in production |

Apply secrets only to the intended Vercel environments. Redeploy after changing them. An origin check is not authentication and does not prevent automated API usage, so do not enable this mode on an unrestricted public deployment.

## Preview deployments

Once the GitHub repository is connected, Vercel creates preview deployments for pull requests and non-production branches. Run `npm run check` locally before pushing and use the preview URL to test microphone permission, API route responses, imports, exports, and browser persistence.

## Local production check

```bash
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. Localhost is treated as a secure context by current browsers for microphone development.

## Troubleshooting

- **Voice not configured:** save both an AssemblyAI API key and Agent ID in Settings. Supplying only one is rejected.
- **Invalid Agent ID:** use the published agent identifier, not an email address.
- **Research key required:** save a Tavily key in Settings before running live research.
- **Microphone unavailable:** use HTTPS, grant browser permission, and check that another application is not holding the input device.
- **Build version mismatch:** use Node.js 24.x and reinstall with `npm ci`.
- **Workspace missing on another device:** TalkOS stores its workspace locally and does not synchronize it through Vercel.
