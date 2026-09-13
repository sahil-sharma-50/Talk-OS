# App Boundary

This directory contains the Next.js App Router entry points and server routes.

| Path | Responsibility |
| --- | --- |
| `layout.tsx` | Root HTML, fonts, metadata, and global stylesheet |
| `page.tsx` | Mounts the TalkOS client application |
| `globals.css` | Product-wide layout, themes, responsive behavior, and motion |
| `api/voice-token/route.ts` | Same-origin AssemblyAI token exchange |
| `api/research/route.ts` | Same-origin Tavily search and extraction proxy |

Keep provider credentials and upstream authorization inside server routes. Client components should call the local `/api` endpoints and must not embed secrets at build time. Route policy changes require focused tests next to the route and coverage of development, production, and visitor-provided credential behavior.

Product behavior belongs in `features`; reusable workspace UI belongs in `components/talkos`.
