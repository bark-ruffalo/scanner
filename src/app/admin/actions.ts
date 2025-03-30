"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { http, type Chain, type Transport, createPublicClient } from "viem";
import { base } from "viem/chains";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { analyzeLaunch } from "~/server/lib/ai-utils";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";
import {
	getLaunchById,
	updateLaunchAnalysis,
	updateTokenStatisticsInDb,
} from "~/server/queries";

// Create a public client for Base network with explicit typing
const publicClient = createPublicClient<Transport, Chain>({
	chain: base,
	transport: http(),
});

/**
 * Deletes a launch from the database
 */
export async function deleteLaunch(id: number) {
	await db.delete(launches).where(eq(launches.id, id));
	revalidatePath("/admin");
	revalidatePath("/");
}

/**
 * Updates token statistics for a launch
 */
export async function updateLaunchTokenStats(
	launchId: number,
	tokenAddress: string,
	creatorAddress: string,
	creatorInitialTokens: string,
) {
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
}

/**
 * Updates token statistics for all launches
 */
export async function updateAllTokenStats() {
	const allLaunches = await db.query.launches.findMany();

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
				continue;
			}

			await updateLaunchTokenStats(
				launch.id,
				tokenAddressMatch[1],
				creatorMatch[1],
				initialTokensMatch[1].replace(/,/g, ""),
			);
		} catch (error) {
			console.error(
				`Error updating token stats for launch ${launch.id}:`,
				error,
			);
		}
	}
}

/**
 * Reanalyzes a launch with LLM
 */
export async function reanalyzeLaunch(id: number) {
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
}

/**
 * Reanalyzes all launches with LLM
 */
export async function reanalyzeAllLaunches() {
	const allLaunches = await db.query.launches.findMany();

	for (const launch of allLaunches) {
		try {
			await reanalyzeLaunch(launch.id);
		} catch (error) {
			console.error(`Error reanalyzing launch ${launch.id}:`, error);
		}
	}
}
