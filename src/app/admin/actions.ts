"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { analyzeLaunch } from "~/server/lib/ai-utils";
import { publicClient } from "~/server/lib/evm-client";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";
import {
	getLaunchById,
	updateLaunchAnalysis,
	updateTokenStatisticsInDb,
} from "~/server/queries";

/**
 * Deletes a launch from the database
 * @throws {Error} If deletion fails
 */
export async function deleteLaunch(id: number) {
	try {
		await db.delete(launches).where(eq(launches.id, id));
		revalidatePath("/admin");
		revalidatePath("/");
		return { success: true };
	} catch (error) {
		console.error(`Error deleting launch ${id}:`, error);
		throw new Error(
			`Failed to delete launch: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Updates token statistics for a launch
 * @throws {Error} If update fails or launch not found
 */
export async function updateLaunchTokenStats(
	launchId: number,
	tokenAddress: string,
	creatorAddress: string,
	creatorInitialTokens: string,
) {
	try {
		const launch = await getLaunchById(launchId);
		if (!launch) {
			throw new Error(`Launch with ID ${launchId} not found`);
		}

		// Register the main selling address if it exists
		const tokenStats = await updateEvmTokenStatistics(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
			creatorInitialTokens,
			undefined,
			launch.mainSellingAddress as `0x${string}` | undefined,
		);

		await updateTokenStatisticsInDb(launchId, tokenStats);
		revalidatePath(`/launch/${launchId}`);
		revalidatePath("/admin");
		revalidatePath("/");
		return { success: true };
	} catch (error) {
		console.error(`Error updating token stats for launch ${launchId}:`, error);
		throw new Error(
			`Failed to update token statistics: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Updates token statistics for all launches
 * @returns Object with success count and error count
 */
export async function updateAllTokenStats() {
	const allLaunches = await db.query.launches.findMany();
	const results = { success: 0, failed: 0, total: allLaunches.length };

	for (const launch of allLaunches) {
		try {
			// Extract token info from description
			const tokenAddressMatch = launch.description.match(
				/Token address: (0x[a-fA-F0-9]{40})/,
			);
			const creatorMatch = launch.description.match(
				/Creator address: (0x[a-fA-F0-9]{40})/,
			);
			const initialTokensMatch = launch.description.match(
				/Creator initial number of tokens: ([\d,]+)/,
			);

			if (
				!tokenAddressMatch?.[1] ||
				!creatorMatch?.[1] ||
				!initialTokensMatch?.[1]
			) {
				console.log(
					`Skipping launch ${launch.id}: Could not extract token info from description`,
				);
				results.failed++;
				continue;
			}

			await updateLaunchTokenStats(
				launch.id,
				tokenAddressMatch[1],
				creatorMatch[1],
				initialTokensMatch[1].replace(/,/g, ""),
			);
			results.success++;
		} catch (error) {
			console.error(
				`Error updating token stats for launch ${launch.id}:`,
				error,
			);
			results.failed++;
		}
	}

	revalidatePath("/admin");
	revalidatePath("/");
	return results;
}

/**
 * Reanalyzes a launch with LLM
 * @throws {Error} If reanalysis fails or launch not found
 */
export async function reanalyzeLaunch(id: number) {
	try {
		const launch = await getLaunchById(id);
		if (!launch) {
			throw new Error(`Launch with ID ${id} not found`);
		}

		const analysisResult = await analyzeLaunch(
			launch.description,
			launch.launchpad,
		);

		await updateLaunchAnalysis(id, {
			description: launch.description,
			analysis: analysisResult.analysis,
			summary: analysisResult.summary,
			rating: analysisResult.rating,
			llmAnalysisUpdatedAt: new Date(),
		});

		revalidatePath(`/launch/${id}`);
		revalidatePath("/admin");
		revalidatePath("/");
		return { success: true, rating: analysisResult.rating };
	} catch (error) {
		console.error(`Error reanalyzing launch ${id}:`, error);
		throw new Error(
			`Failed to reanalyze launch: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Reanalyzes all launches with LLM
 * @returns Object with success count and error count
 */
export async function reanalyzeAllLaunches() {
	const allLaunches = await db.query.launches.findMany();
	const results = { success: 0, failed: 0, total: allLaunches.length };

	for (const launch of allLaunches) {
		try {
			await reanalyzeLaunch(launch.id);
			results.success++;
		} catch (error) {
			console.error(`Error reanalyzing launch ${launch.id}:`, error);
			results.failed++;
		}
	}

	revalidatePath("/admin");
	revalidatePath("/");
	return results;
}
