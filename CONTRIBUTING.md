# Contributing to TalkOS

Thank you for improving TalkOS. Changes should preserve its local-first workspace model, visible agent activity, revision safety, and keyboard-accessible interface.

## Development setup

Use Node.js 24.x and install from the lockfile:

```bash
npm ci
npm run dev
```

The application runs without environment variables. Add your own credentials in **Settings**, or copy `.env.example` to `.env.local` for a local server fallback. Never commit populated environment files.

## Project checks

Run the complete release check before opening a pull request:

```bash
npm run check
```

During development, the individual commands are:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Use `npm test` when watch mode is useful. Add focused tests when changing workspace mutations, import/export behavior, API policies, session transitions, voice tools, or user interaction.

## Change guidelines

- Keep browser-only code and server-only credentials on their existing sides of the Next.js boundary.
- Route workspace mutations through the revision-aware model helpers.
- Preserve cancellation checks so interrupted or stale agent work cannot land.
- Keep credentials out of workspace snapshots, exports, logs, fixtures, screenshots, and commits.
- Maintain visible focus, semantic labels, keyboard access, and reduced-motion behavior.
- Update the relevant README or guide when commands, environment variables, architecture, or user-visible limits change.

## Pull requests

Describe the concrete user problem and the resulting behavior. Include the validation commands you ran and call out changes to storage schemas, credentials, API routes, imports/exports, or deployment behavior. Keep unrelated refactors in separate pull requests.
