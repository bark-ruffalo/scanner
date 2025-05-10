# Scanner

Live on: https://scanner.trulyadog.com

Contribute! Consider adding support for other launchpads or improving the existing features!

## About

The project is a WIP web app designed to monitor various launchpads (both crypto and traditional finance). It aims to:
- Aggregate information about upcoming and recent launches.
- Utilize LLMs to summarize, analyze, and rate launches as potential investments.
- Provide filters based on launchpad type, specific launchpads, rating, tokenomics (e.g., creator holdings, token movements), etc.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org) (App Router)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (via `@tailwindcss/postcss`)
- **Database**: PostgreSQL
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Language**: TypeScript
- **Environment Variables**: [T3 Env](https://env.t3.gg/) (Schema in `src/env.js`)
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
- In `src/server/lib/ai-utils.ts`, LLM models can be configured differently for development and production environments using environment variables.
- When implementing a new launchpad listener (e.g., in `src/server/launchpads/`), consider adding a corresponding `debugFetchHistoricalEvents` function and integrating it into `src/instrumentation.ts` for testing and backfilling.
- Run `pnpm check:write` after making code changes to format and lint the code using Biome.
- Database migrations are handled via `pnpm db:push`. Schema changes are defined in `src/server/db/schema.ts`.
- All database access **must** go through the Data Access Layer (DAL) defined in `src/server/queries.ts`. The database client itself is instantiated globally in `src/server/db/index.ts`.
- The application requires several environment variables (see `.env.example`). These are strictly validated at runtime using T3 Env (`src/env.js`). Ensure your `.env` file is configured correctly.
- Shared utility functions (e.g., formatting, URL parsing) reside in `src/lib/utils.ts`. Content fetching utilities (including Firecrawl integration) are in `src/lib/content-utils.ts`.
- Server-specific utilities, including blockchain client setup (`src/server/lib/evm-client.ts`, `src/server/lib/svm-client.ts`), chain-specific interactions (`src/server/lib/evm-utils.ts`, `src/server/lib/svm-utils.ts`), AI interactions (`src/server/lib/ai-utils.ts`), common server helpers (`src/server/lib/common-utils.ts`), are located in `src/server/lib/`. (Note: `virtuals-utils.ts` was largely made redundant by the consolidated listener).
- The Virtuals Protocol listener (`src/server/launchpads/virtuals.ts`) now handles launches from both Base and Solana by periodically fetching data from the Virtuals API. It includes a debug function (`debugVirtualsLaunchById`) for processing specific launch IDs.
- Admin routes (`/admin/*`) are protected by Basic Authentication configured in `middleware.ts`.
- This project was bootstrapped using the T3 Stack. You might want to read their documentation first:
  - [Create T3 App](https://create.t3.gg/en/introduction)
  - [T3 Env](https://env.t3.gg/docs/introduction)

## TODO

### High Priority
- [ ] Add a traditional VC investing launchpad listener (e.g., scraping a website like AngelList or Republic).
- [ ] Refine and test the Admin page functionality (add/edit/delete launches).
- [ ] Research other launchpads to integrate with.

### Medium Priority
- [ ] Allow users to submit a URL for a launch to be analyzed and potentially added.
- [ ] Implement a comment section for each launch (consider a simple backend or a third-party service).
- [ ] Add like/dislike functionality for launches.
- [ ] Generalize `evm-client.ts` and `evm-utils.ts` to better support multiple EVM chains beyond Base.

### Low Priority or Optional
- [ ] Add comprehensive unit and integration tests.
- [ ] Remove unused helper functions (`monitorTokenBurns`, `monitorTokenTransfers`) from `src/server/lib/svm-utils.ts`.

### Bugs
- [ ] The `updateSolanaTokenStatistics` function in `src/server/lib/svm-utils.ts` calculates the creator token holding percentage using standard number division and `Math.round()`, which can lead to precision loss with large token amounts (BigInts) and doesn't align with the `calculateBigIntPercentage` utility used for EVM. It should be refactored to use `calculateBigIntPercentage` from `src/lib/utils.ts` for consistency and accuracy.

## Changelog

- Fixed: Homepage revalidation is now triggered via a POST to /api/revalidate-homepage from background jobs, instead of direct revalidatePath calls, to avoid static generation store errors.
- Added: /api/revalidate-homepage API route for on-demand homepage revalidation.

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
- Check creator token holdings/movements and store in DB
- Separate prod/dev databases (via table prefix)
- Add password-protected Admin page with functions to trigger updates/analysis and add/edit/delete launches
- Ensure new launches are detected via WebSocket listener
- Show unrated launches when rating filter is set to 0
- Use different LLMs in prod/dev via environment variables
- Improve error handling and user feedback for background processes (LLM analysis, token stats updates)
- Refactored Solana launchpad listener (Virtuals Protocol - Solana) to use Helius SDK
- Enhanced LLM analysis to access and incorporate information from external links found in launch descriptions (socials, websites, docs) using both simple fetching and Firecrawl API
- Implemented automatic reanalysis of launches when significant token movements are detected
- Added admin functions for historical event fetching and manual token stats updates
- Fully integrate and configure Sentry for error monitoring
- Consolidated Virtuals Protocol listeners (Base & Solana) into a single API-polling listener (`src/server/launchpads/virtuals.ts`) supporting Genesis, Undergrad, and Available launch types. Updated admin interface for debugging specific launch IDs.