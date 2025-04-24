# Scanner

Live on: https://scanner.trulyadog.com

Contribute! Consider adding support for other launchpads or improving the existing features!

## About

The project is a WIP web app designed to monitor various launchpads (both crypto and traditional finance). It aims to:
- Aggregate information about upcoming and recent launches.
- Utilize LLMs to summarize, analyze, and rate launches as potential investments.
- Provide filters based on launchpad type, specific launchpads, rating, tokenomics (e.g., creator holdings), etc.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **Database**: PostgreSQL
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Language**: TypeScript
- **Environment Variables**: [T3 Env](https://env.t3.gg/)
- **Linting/Formatting**: [Biome](https://biomejs.dev/)
- **Package Manager**: [pnpm](https://pnpm.io/)
- **Deployment**: [Render](https://render.com/) (Chosen for WebSocket support)

## Recommended Editor Extensions (VS Code / Cursor)

- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss): Autocompletion, linting, and syntax highlighting for Tailwind CSS.
- [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome): Integrates Biome formatting and linting into the editor.
- Consider Drizzle-related extensions if available and helpful for schema visualization or query building.

## Important Notes for Developers

- This project is primarily developed using a coding AI agent (Roo Code extension in Cursor IDE). The `.cursor/rules` directory contains valuable context for AI prompts, especially `project-info.mdc`.
- The `./update-context.sh` script can generate a `context-codebase.md` file containing the entire codebase, which is useful for providing context to LLMs. You'll probably want to also add relevant rule files (`.mdc` from the `.cursor/rules` directory) before sending the task to your own AI agent.
- Hosted on Render due to its WebSocket support, which is necessary for listening to on-chain contract events via wss RPC endpoints.
- In `src/server/lib/ai-utils.ts`, LLM models can be configured differently for development and production environments.
- When implementing a new launchpad listener (e.g., in `src/server/launchpads/`), consider adding a corresponding `debugFetchHistoricalEvents` function and integrating it into `src/instrumentation.ts` for testing and backfilling.
- Run `pnpm check:write` after making code changes to format and lint the code.
- Database migrations are handled via `pnpm db:push`. Schema changes are defined in `src/server/db/schema.ts`.
- All database access should go through the Data Access Layer (DAL) defined in `src/server/queries.ts`. The database client itself is instantiated globally in `src/server/db/index.ts`.
- The application requires several environment variables (see `.env.example`). These are validated using T3 Env (`src/env.js`). Ensure your `.env` file is configured correctly.
- Shared utility functions (e.g., formatting, URL parsing) reside in `src/lib/utils.ts`. Content fetching utilities are in `src/lib/content-utils.ts`.
- Server-specific utilities, including blockchain client setup (`src/server/lib/evm-client.ts`, `src/server/lib/svm-client.ts`), chain-specific interactions (`src/server/lib/evm-utils.ts`, `src/server/lib/svm-utils.ts`), AI interactions (`src/server/lib/ai-utils.ts`), and launchpad-specific helpers (`src/server/lib/virtuals-utils.ts`), are located in `src/server/lib/`.
- This project was bootstrapped using the T3 Stack. You might want to read their documentations first:
  - [Create T3 App](https://create.t3.gg/en/introduction)
  - [T3 Env](https://env.t3.gg/docs/introduction)

## TODO

### High Priority
- [ ] Add a traditional VC investing launchpad listener (e.g., scraping a website like AngelList or Republic).
- [ ] Refine and test the Admin page functionality (add/edit/delete launches).
- [ ] Research other launchpads to integrated with.
- [ ] Integrate Sentry.

### Medium Priority
- [ ] Allow users to submit a URL for a launch to be analyzed and potentially added.
- [ ] Implement a comment section for each launch (consider a simple backend or a third-party service).
- [ ] Add like/dislike functionality for launches.
- [ ] Make evm-client.ts more general so that it can be used for other EVM chains.

### Low Priority or Optional
- [ ] Add comprehensive unit and integration tests.
- [ ] Ensure the "Creator initial number of tokens" percentage display uses a common utility function. (`src/lib/utils.ts`)

### Bugs
- [ ]

---
*Previously Completed:*
- Set up the repo
- Deploy on <strike>Vercel</strike> Render
- Add database and connect to UI
- Show launches on homepage
- Add filters (Launchpad, Rating)
- Add launch detail page
- Research initial launchpads
- Summarize, analyze, rate with LLM
- Add EVM crypto launchpad listener (Virtuals Protocol - Base)
- Check creator token holdings/movements
- Store creator token holding status in DB
- Separate prod/dev databases (via table prefix)
- Implement background processing on launch page load
- Add password-protected Admin page stub
- Add Admin functions to trigger updates/analysis and add/edit/delete launches
- Ensure new launches are detected via WebSocket listener
- Show unrated launches when rating filter is set to 0
- Use different LLMs in prod/dev
- Improve error handling and user feedback for background processes (LLM analysis, token stats updates)
- Fixed bugs: middleware wrong location, not adding total token supply to DB, etc.
- Completed implementation of Solana launchpad (Virtuals Protocol - Solana)
- Enhanced LLM analysis to access and incorporate information from external links found in launch descriptions (socials, websites, docs) using both simple fetching and Firecrawl API
- Implemented automatic reanalysis of launches when significant token movements are detected
