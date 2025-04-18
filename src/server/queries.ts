import { and, eq, gt, gte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import "server-only";
import { db } from "./db";
import { launches } from "./db/schema";
import { analyzeLaunch } from "./lib/ai-utils";

// --- Configuration ---
// Set to true to overwrite existing launches with the same title and launchpad,
// false to skip adding duplicates.
const OVERWRITE_EXISTING_LAUNCHES = true;
// Set to true to re-analyze launches that already have analysis, summary, and rating
const OVERWRITE_LLM_RESPONSES = true;
// --- End Configuration ---

// Define the type for data needed to create a new launch record.
// It uses TypeScript's Omit utility type to take the 'launches' table insert type
// (inferred by Drizzle as `typeof launches.$inferInsert`) and exclude properties
// that are automatically generated by the database (id, createdAt, updatedAt).
// This ensures that functions adding launches only accept the required fields.
export type NewLaunchData = Omit<
	typeof launches.$inferInsert,
	"id" | "createdAt" // Keep updatedAt potentially for update logic
>;

/**
 * Fetches launch records from the database.
 * Optionally filters launches by launchpad name and minimum rating.
 * @param filter Optional string. If provided and not "All", filters by `launches.launchpad`.
 * @param minRating Optional string. If provided, filters launches by minimum rating.
 * @returns A promise that resolves to an array of launch objects.
 */
export async function getLaunches(filter?: string, minRating?: string) {
	console.log(
		`Fetching launches from DB. Filter: ${filter ?? "None (fetching all)"}, Min Rating: ${minRating ?? "None"}`,
	);

	const conditions = [];

	// Add launchpad filter condition if provided
	if (filter && filter !== "All") {
		conditions.push(eq(launches.launchpad, filter));
	}

	// Add minimum rating condition if provided
	if (minRating !== undefined) {
		const rating = Number.parseInt(minRating, 10);
		if (!Number.isNaN(rating)) {
			// When minRating is 0, include both unrated (-1) and 0 rated launches
			if (rating === 0) {
				conditions.push(
					gte(launches.rating, -1), // This includes both -1 and 0 ratings
				);
			} else {
				conditions.push(
					and(
						gt(launches.rating, rating - 1), // Using gt with rating-1 is equivalent to gte with rating
						ne(launches.rating, -1),
					),
				);
			}
		}
	}

	// Uses Drizzle's query builder (`db.query.launches`).
	const result = await db.query.launches.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		// Orders the results by the `launchedAt` column in descending order (newest first).
		orderBy: (launches, { desc }) => [desc(launches.launchedAt)],
	});
	console.log(`Fetched ${result.length} launches.`);
	return result;
}

/**
 * Fetches a distinct list of all launchpad names present in the database.
 * Useful for populating filter dropdowns or lists.
 * @returns A promise that resolves to an array of unique launchpad name strings.
 */
export async function getDistinctLaunchpads() {
	console.log("Fetching distinct launchpads from DB...");
	// Uses Drizzle's `selectDistinct` to get unique values from the `launchpad` column.
	const distinctLaunchpadsResult = await db
		.selectDistinct({ launchpad: launches.launchpad })
		.from(launches); // Specifies the table to query from.

	// The result is an array of objects like [{ launchpad: 'Name1' }, { launchpad: 'Name2' }].
	// We map this to extract just the names into a simple string array.
	const launchpadNames = distinctLaunchpadsResult.map(
		({ launchpad }) => launchpad,
	);
	console.log(`Found ${launchpadNames.length} distinct launchpads.`);
	return launchpadNames;
}

/**
 * Inserts a new launch record into the database or updates it if it already exists
 * (based on title and launchpad) and OVERWRITE_EXISTING_LAUNCHES is true.
 * Before insertion, it uses LLM to analyze, rate and summarize the launch.
 * After successful insertion or update, it triggers a revalidation of the Next.js cache
 * for the homepage ('/') to ensure the UI reflects the new data.
 * @param launchData An object conforming to the NewLaunchData type, which includes:
 *   - Required fields: launchpad, title, url, description
 *   - Optional fields: imageUrl, creatorTokenHoldingPercentage, creatorTokensHeld, totalTokenSupply
 */
export async function addLaunch(launchData: NewLaunchData) {
	console.log(
		`Attempting to add/update launch in DB: ${launchData.title} from ${launchData.launchpad}`,
	);
	let actionTaken: "inserted" | "updated" | "skipped" | "error" = "error"; // Track outcome

	try {
		// Check if a launch with the same title and launchpad already exists
		const existingLaunch = await db.query.launches.findFirst({
			where: and(
				eq(launches.title, launchData.title),
				// Make sure launchpad is not undefined by using the default value from the schema if needed
				eq(launches.launchpad, launchData.launchpad || "added manually"),
			),
			columns: {
				// Need the ID to perform an update
				id: true,
				// Also get existing analysis data to avoid reanalyzing unnecessarily
				analysis: true,
				summary: true,
				rating: true,
				// Get existing token data to preserve it if not provided in update
				creatorTokenHoldingPercentage: true,
				creatorTokensHeld: true,
				totalTokenSupply: true,
				creatorInitialTokensHeld: true, // Get existing value
				tokensForSale: true, // Get existing value
				// Get existing addresses
				creatorAddress: true,
				tokenAddress: true,
			},
		});

		// Enhanced data with AI analysis - if missing in either new launch or existing launch
		let enhancedData = { ...launchData };
		const needsAnalysis =
			!existingLaunch ||
			existingLaunch.analysis === "-" ||
			existingLaunch.summary === "-" ||
			existingLaunch.rating === -1 ||
			OVERWRITE_LLM_RESPONSES;

		if (needsAnalysis) {
			try {
				console.log("Analyzing launch description with AI...");
				const analysisResult = await analyzeLaunch(
					launchData.description,
					launchData.launchpad,
				);
				console.log(`Analysis complete! Rating: ${analysisResult.rating}/10`);

				// Enhance the data with AI-generated content
				enhancedData = {
					...launchData,
					analysis: analysisResult.analysis,
					summary: analysisResult.summary,
					rating: analysisResult.rating,
					llmAnalysisUpdatedAt: new Date(), // Set LLM analysis timestamp
				};
			} catch (analysisError) {
				console.error("Error during AI analysis:", analysisError);
				// Continue with original data if analysis fails
				console.log("Proceeding with original data (without AI analysis).");
			}
		} else {
			console.log("Skipping AI analysis (already analyzed or not needed).");
		}

		if (existingLaunch) {
			// Launch exists, check if we should overwrite
			if (OVERWRITE_EXISTING_LAUNCHES) {
				console.log(
					`Duplicate launch detected: "${launchData.title}" from ${launchData.launchpad}. Overwriting...`,
				);
				// Prepare data for update, preserving existing token data if not provided in update
				const updateData: Partial<typeof launches.$inferInsert> = {
					...enhancedData,
					// Preserve existing token data if not provided in update
					creatorTokenHoldingPercentage:
						enhancedData.creatorTokenHoldingPercentage ??
						existingLaunch.creatorTokenHoldingPercentage,
					creatorTokensHeld:
						enhancedData.creatorTokensHeld ?? existingLaunch.creatorTokensHeld,
					totalTokenSupply:
						enhancedData.totalTokenSupply ?? existingLaunch.totalTokenSupply,
					// Preserve new fields if not provided in update
					creatorInitialTokensHeld:
						enhancedData.creatorInitialTokensHeld ??
						existingLaunch.creatorInitialTokensHeld,
					tokensForSale:
						enhancedData.tokensForSale ?? existingLaunch.tokensForSale,
					basicInfoUpdatedAt: new Date(), // Update basic info timestamp
					// Preserve addresses if not provided in update
					creatorAddress:
						enhancedData.creatorAddress ?? existingLaunch.creatorAddress,
					tokenAddress:
						enhancedData.tokenAddress ?? existingLaunch.tokenAddress,
				};
				await db
					.update(launches)
					.set(updateData)
					.where(eq(launches.id, existingLaunch.id));
				console.log(
					`Successfully updated launch: ${launchData.title} from ${launchData.launchpad}`,
				);
				actionTaken = "updated";
			} else if (needsAnalysis) {
				// If overwrite is disabled but analysis was needed and performed, update only the AI fields
				console.log(
					`Existing launch detected: "${launchData.title}" from ${launchData.launchpad}. Updating only AI analysis fields...`,
				);
				// Only update the AI-generated fields
				const updateData = {
					analysis: enhancedData.analysis,
					summary: enhancedData.summary,
					rating: enhancedData.rating,
					llmAnalysisUpdatedAt: new Date(), // Update LLM analysis timestamp
				};
				await db
					.update(launches)
					.set(updateData)
					.where(eq(launches.id, existingLaunch.id));
				console.log(
					`Successfully updated AI analysis for: ${launchData.title} from ${launchData.launchpad}`,
				);
				actionTaken = "updated";
			} else {
				// If overwrite is disabled and no analysis needed, log and skip
				console.log(
					`Duplicate launch detected: "${launchData.title}" from ${launchData.launchpad}. Skipping insertion as overwrite is disabled.`,
				);
				actionTaken = "skipped";
				// No 'return' here, proceed to revalidation if needed (though skipping means no change)
			}
		} else {
			// If launch does not exist, proceed with insertion
			console.log(
				`"${launchData.title}" not found. Proceeding with insertion...`,
			);
			await db.insert(launches).values(enhancedData);
			console.log(
				`Successfully added launch: ${launchData.title} from ${launchData.launchpad}`,
			);
			actionTaken = "inserted";
		}

		// Only revalidate if data was actually changed (inserted or updated)
		if (actionTaken === "inserted" || actionTaken === "updated") {
			// Revalidate the cache for the specified path.
			// Wrapped in try-catch to handle "static generation store missing" error during direct script execution
			try {
				console.log("Attempting to revalidate Next.js cache for path: /");
				// Check if we're in a Next.js rendering context before attempting to revalidate
				// The headers() function from next/headers is only available in a Next.js rendering context
				// If this is imported outside a rendering context, it will throw an error
				if (
					typeof globalThis.Headers !== "undefined" &&
					typeof process !== "undefined" &&
					process.env.NEXT_RUNTIME === "nodejs"
				) {
					revalidatePath("/");
					console.log("Cache revalidation triggered for /.");
				} else {
					console.log(
						"Cache revalidation skipped: not in a Next.js rendering context.",
					);
				}
			} catch (revalidateError) {
				console.warn(
					// Use warn for expected scenarios
					"Cache revalidation skipped: not in a Next.js rendering context.",
					revalidateError instanceof Error
						? revalidateError.message
						: revalidateError,
				);
				// This is expected when running outside of Next.js rendering context (like in direct script execution)
			}
		}
	} catch (error) {
		actionTaken = "error";
		// Log any errors that occur during the database check, insertion or update process.
		console.error(
			`Error processing launch "${launchData.title}" in database:`, // Updated error message context
			error,
		);
		// Consider re-throwing the error if needed by the caller
		// throw error;
	}
	// Optionally return the action taken
	// return actionTaken;
}

export async function getLaunchById(id: number) {
	// Ensure db connection is established if not already
	const launch = await db.query.launches.findFirst({
		where: eq(launches.id, id),
	});
	return launch ?? null; // Return the launch or null if not found
}

export async function getLaunchMetadata(id: number) {
	const launch = await getLaunchById(id);
	return {
		title: launch ? `${launch.title} | Scanner` : "Launch Not Found | Scanner",
	};
}

export interface TokenUpdateResult {
	creatorTokensHeld: string;
	creatorTokenHoldingPercentage: string;
	tokenStatsUpdatedAt: Date;
	creatorTokenMovementDetails?: string;
	mainSellingAddress?: string;
	sentToZeroAddress?: boolean;
}

/**
 * Updates token statistics in the database for a specific launch.
 *
 * @param launchId - The ID of the launch to update
 * @param tokenStats - The token statistics to update
 */
export async function updateTokenStatisticsInDb(
	launchId: number,
	tokenStats: TokenUpdateResult,
) {
	await db
		.update(launches)
		.set({
			creatorTokensHeld: tokenStats.creatorTokensHeld,
			creatorTokenHoldingPercentage: tokenStats.creatorTokenHoldingPercentage,
			creatorTokenMovementDetails: tokenStats.creatorTokenMovementDetails,
			tokenStatsUpdatedAt: tokenStats.tokenStatsUpdatedAt,
			sentToZeroAddress: tokenStats.sentToZeroAddress ?? false,
			updatedAt: new Date(),
		})
		.where(eq(launches.id, launchId));
}

/**
 * Updates a launch's description and analysis data
 * @param launchId The ID of the launch to update
 * @param data The updated launch data
 */
export async function updateLaunchAnalysis(
	launchId: number,
	data: {
		description: string;
		analysis: string;
		summary: string;
		rating: number;
		llmAnalysisUpdatedAt: Date;
	},
) {
	await db.update(launches).set(data).where(eq(launches.id, launchId));
}
