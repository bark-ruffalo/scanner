import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Determine the admin password schema based on the environment
const adminPasswordSchema =
	process.env.NODE_ENV === "production"
		? z
				.string()
				.min(8, "ADMIN_PASSWORD must be at least 8 characters in production") // Stricter validation for production
		: z.string().min(1, "ADMIN_PASSWORD cannot be empty"); // Allow short passwords in development/test

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		POSTGRES_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		BASE_RPC_URL: z
			.string()
			.url()
			.optional()
			.refine(
				(url) => !url || url.startsWith("wss://"), // Check only if url is defined
				{ message: "BASE_RPC_URL must start with wss:// if provided" },
			),
		HELIUS_API_KEY: z.string().min(1),
		VIRTUALS_SOLANA_PROGRAM_ID: z.string().optional(),
		OPENROUTER_API_KEY: z
			.string()
			.min(10, "A valid OPENROUTER_API_KEY has to be added to the environment")
			.startsWith("sk-or-v1-", "OPENROUTER_API_KEY must start with sk-or-v1-"),
		OPENROUTER_API_HOST: z.string().url(),
		ADMIN_PASSWORD: adminPasswordSchema,
		FIRECRAWL_API_KEY: z
			.string()
			.min(10, "A valid FIRECRAWL_API_KEY has to be added to the environment")
			.startsWith("fc-", "FIRECRAWL_API_KEY must start with fc-"),
		TELEGRAM_BOT_TOKEN: z.string(),
		TELEGRAM_GROUP_ID: z.string(),
		TELEGRAM_TOPIC_ID: z.string(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 *
	 * Use `runtimeEnv` - `runtimeEnvStrict` may not be supported by @t3-oss/env-nextjs.
	 */
	runtimeEnv: {
		POSTGRES_URL: process.env.POSTGRES_URL,
		NODE_ENV: process.env.NODE_ENV,
		BASE_RPC_URL: process.env.BASE_RPC_URL,
		HELIUS_API_KEY: process.env.HELIUS_API_KEY,
		VIRTUALS_SOLANA_PROGRAM_ID: process.env.VIRTUALS_SOLANA_PROGRAM_ID,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		OPENROUTER_API_HOST: process.env.OPENROUTER_API_HOST,
		ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
		FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
		TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
		TELEGRAM_GROUP_ID: process.env.TELEGRAM_GROUP_ID,
		TELEGRAM_TOPIC_ID: process.env.TELEGRAM_TOPIC_ID,
		// NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR, // Ensure client vars are mapped if added to the 'client' schema
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
