// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTableCreator,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { env } from "~/env";

// Log which table prefix will be used based on the environment
const isDevelopment = env.NODE_ENV === "development";
// console.log(
// 	`Database tables will use the "${isDevelopment ? "dev_scanner_" : "scanner_"}" prefix because the app is running in ${isDevelopment ? "development" : "production"} mode (NODE_ENV=${env.NODE_ENV}).`,
// );

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => {
	// Use different table prefixes based on the environment
	const prefix = isDevelopment ? "dev_scanner_" : "scanner_";
	return `${prefix}${name}`;
});

// Define the 'launches' table
export const launches = createTable(
	"launch",
	{
		id: serial("id").primaryKey(),
		launchpad: varchar("launchpad", { length: 256 })
			.default("added manually")
			.notNull(),
		creatorAddress: varchar("creator_address", { length: 256 }),
		tokenAddress: varchar("token_address", { length: 256 }),
		launchpadSpecificId: varchar("launchpad_specific_id", { length: 256 }), // For Virtuals API ID etc.
		chain: varchar("chain", { length: 50 }), // e.g., BASE, SOLANA
		status: varchar("status", { length: 50 }), // e.g., UNDERGRAD, GENESIS
		title: varchar("title", { length: 256 }).notNull(),
		url: varchar("url", { length: 1024 }).notNull(),
		description: text("description").notNull(),
		summary: text("summary").default("-").notNull(),
		analysis: text("analysis").default("-").notNull(),
		// Rating: -1 (not rated), 0-10 (rated)
		rating: integer("rating").default(-1).notNull(),
		imageUrl: varchar("image_url", { length: 1024 }),
		creatorTokenHoldingPercentage: numeric("creator_token_holding_percentage", {
			precision: 6,
			scale: 2,
		}),
		creatorTokensHeld: numeric("creator_tokens_held", {
			precision: 78, // Maximum precision for PostgreSQL numeric type
			scale: 0, // No decimal places needed for token amounts
		}),
		// Add the new field for initial creator tokens
		creatorInitialTokensHeld: numeric("creator_initial_tokens_held", {
			precision: 78,
			scale: 0,
		}),
		// Add the new field for tokens available for sale
		tokensForSale: numeric("tokens_for_sale", {
			precision: 78,
			scale: 0,
		}),
		creatorTokenMovementDetails: varchar("creator_token_movement_details", {
			length: 1024,
		}),
		mainSellingAddress: varchar("main_selling_address", {
			length: 256, // Long enough for any blockchain address including Solana
		}),
		totalTokenSupply: numeric("total_token_supply", {
			precision: 78, // Maximum precision for PostgreSQL numeric type
			scale: 0, // No decimal places needed for token amounts
		}),
		// Add a flag to track if tokens were sent to the zero address (burned)
		sentToZeroAddress: boolean("sent_to_zero_address").default(false).notNull(),
		launchedAt: timestamp("launched_at")
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		// Track when the basic info section was last updated (title, description, etc.)
		basicInfoUpdatedAt: timestamp("basic_info_updated_at", {
			withTimezone: true,
		})
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		// Track when the token statistics section was last updated
		tokenStatsUpdatedAt: timestamp("token_stats_updated_at", {
			withTimezone: true,
		})
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		// Track when the LLM analysis section was last updated
		llmAnalysisUpdatedAt: timestamp("llm_analysis_updated_at", {
			withTimezone: true,
		})
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(table) => ({
		// Add indexes for columns likely used in filtering/searching
		launchpadIdx: index("launchpad_idx").on(table.launchpad),
		ratingIdx: index("rating_idx").on(table.rating),
		titleIdx: index("title_idx").on(table.title),
		launchpadSpecificIdIdx: index("launchpad_specific_id_idx").on(
			table.launchpadSpecificId,
		),
		chainIdx: index("chain_idx").on(table.chain),
		statusIdx: index("status_idx").on(table.status),
		// Add indexes for new address fields
		creatorAddressIdx: index("creator_address_idx").on(table.creatorAddress),
		tokenAddressIdx: index("token_address_idx").on(table.tokenAddress),
		// Add check constraint for rating values
		ratingCheck: check(
			"rating_check",
			sql`${table.rating} >= -1 AND ${table.rating} <= 10`,
		),
	}),
);

// Note on RLS:
// Row Level Security (RLS) needs to be enabled for the 'launches' table in your Supabase project,
// and appropriate policies must be created based on your application's authentication and authorization logic.
// Example SQL to enable RLS (run this in Supabase SQL editor or a migration):
// ALTER TABLE scanner_launch ENABLE ROW LEVEL SECURITY;
//
// You will then need to define policies, e.g.:
// CREATE POLICY "Allow authenticated users to read all launches" ON scanner_launch FOR SELECT TO authenticated USING (true);
// CREATE POLICY "Allow users to insert their own launches" ON scanner_launch FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
// -- Add policies for UPDATE and DELETE as needed, potentially checking ownership.
