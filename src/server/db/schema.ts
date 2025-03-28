// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTableCreator,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `scanner_${name}`);

// Define the 'launches' table
export const launches = createTable(
	"launch",
	{
		id: serial("id").primaryKey(),
		launchpad: varchar("launchpad", { length: 256 })
			.default("added manually")
			.notNull(),
		title: varchar("title", { length: 256 }).notNull(),
		url: varchar("url", { length: 1024 }).notNull(),
		description: text("description").notNull(),
		summary: text("summary").default("-").notNull(),
		analysis: text("analysis").default("-").notNull(),
		// Rating: -1 (not rated), 0-10 (rated)
		rating: integer("rating").default(-1).notNull(),
		launchedAt: timestamp("launched_at")
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
