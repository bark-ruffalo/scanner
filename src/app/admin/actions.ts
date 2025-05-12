"use server";

import { PublicKey } from "@solana/web3.js";
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
	tokenAddress?: string,
	creatorAddress?: string,
	creatorInitialTokens?: string,
) {
	try {
		const launch = await getLaunchById(launchId);
		if (!launch) {
			throw new Error(`Launch with ID ${launchId} not found`);
		}

		// Get token info from the launch record itself
		const {
			tokenAddress: launchTokenAddress,
			creatorAddress: launchCreatorAddress,
			creatorInitialTokensHeld,
		} = launch;
		if (
			!launchTokenAddress ||
			!launchCreatorAddress ||
			!creatorInitialTokensHeld
		) {
			throw new Error("Launch is missing required token information");
		}

		if (launch.launchpad === "VIRTUALS Protocol (Base)") {
			// For Base launches, update using EVM utilities
			const tokenStats = await updateEvmTokenStatistics(
				publicClient,
				launchTokenAddress as `0x${string}`,
				launchCreatorAddress as `0x${string}`,
				creatorInitialTokensHeld,
				undefined,
				launch.mainSellingAddress as `0x${string}` | undefined,
			);

			await updateTokenStatisticsInDb(launchId, tokenStats);
		} else if (launch.launchpad === "VIRTUALS Protocol (Solana)") {
			// For Solana launches, update using Solana utilities
			const { getConnection } = await import("~/server/lib/svm-client");
			const { updateSolanaTokenStatistics, getSolanaTokenBalance } =
				await import("~/server/lib/svm-utils");

			const connection = getConnection();
			const tokenMintPk = new PublicKey(launchTokenAddress);
			const creatorPk = new PublicKey(launchCreatorAddress);

			// Fetch the current raw balance before calling updateSolanaTokenStatistics
			const currentBalanceRaw = await getSolanaTokenBalance(
				connection,
				tokenMintPk,
				creatorPk,
			);

			const tokenStats = await updateSolanaTokenStatistics(
				connection,
				tokenMintPk,
				creatorPk,
				creatorInitialTokensHeld,
				currentBalanceRaw, // Pass the fetched current raw balance
			);

			await updateTokenStatisticsInDb(launchId, tokenStats);
		} else {
			throw new Error(`Unsupported launchpad: ${launch.launchpad}`);
		}

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
			await updateLaunchTokenStats(launch.id);
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

// --- Debug Launchpad Historical Events ---
export async function debugLaunchpadHistoricalEvents({
	launchpad,
	from,
	to,
	overwriteExisting,
}: {
	launchpad: string;
	from: string;
	to?: string;
	overwriteExisting?: boolean;
}) {
	try {
		let resultMsg = "";
		if (launchpad === "Virtuals Protocol") {
			const { debugVirtualsLaunchById } = await import(
				"~/server/launchpads/virtuals"
			);
			// 'from' is the API ID for Virtuals Protocol
			const debugResult = await debugVirtualsLaunchById(
				from,
				overwriteExisting,
			);
			resultMsg = debugResult.message;
		} else {
			throw new Error(
				`Unknown or unsupported launchpad for debug: ${launchpad}`,
			);
		}

		revalidatePath("/admin");
		revalidatePath("/");
		return { message: resultMsg };
	} catch (error) {
		console.error("Error debugging historical events:", error);
		throw new Error(
			`Failed to debug historical events: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
