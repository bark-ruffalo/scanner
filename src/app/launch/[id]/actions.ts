"use server";

import { revalidatePath } from "next/cache";
import { http, type Chain, type Transport, createPublicClient } from "viem";
import { base } from "viem/chains";
import { analyzeLaunch } from "~/server/lib/ai-utils";
import {
	addKnownEvmSellingAddress,
	updateEvmTokenStatistics,
} from "~/server/lib/evm-utils";
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
 * Updates the token holdings for a launch in the background
 * @param launchId The ID of the launch to update
 * @param tokenAddress The token contract address
 * @param creatorAddress The creator's address
 * @param creatorInitialTokens The creator's initial token allocation at launch (in ETH)
 */
export async function updateTokenHoldings(
	launchId: number,
	tokenAddress: string,
	creatorAddress: string,
	creatorInitialTokens: string,
) {
	try {
		// Get the current launch data from the database
		const launch = await getLaunchById(launchId);
		if (!launch) {
			console.error(`Launch with ID ${launchId} not found`);
			return;
		}

		// If the creator already has less than 80% of their initial allocation, skip the update
		const currentPercentage = Number(
			launch.creatorTokenHoldingPercentage || "100",
		);
		if (currentPercentage < 80) {
			console.log(
				`Creator has already sold more than 20% of tokens (currently holds ${currentPercentage}%). Skipping token stats update.`,
			);
			return;
		}

		// Register the main selling address if it exists
		if (launch.mainSellingAddress) {
			addKnownEvmSellingAddress(
				launch.mainSellingAddress as `0x${string}`,
				launch.launchpad,
			);
		}

		const tokenStats = await updateEvmTokenStatistics(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
			creatorInitialTokens,
			undefined,
			launch.mainSellingAddress as `0x${string}` | undefined,
		);

		await updateTokenStatisticsInDb(launchId, tokenStats);

		// Check if there's been a significant change in token holdings
		const newPercentage = Number(tokenStats.creatorTokenHoldingPercentage);
		const percentageDiff = Math.abs(newPercentage - currentPercentage);

		// If there's a significant change (more than 5% difference)
		if (percentageDiff > 5) {
			console.log(
				`Significant token holding change detected (${percentageDiff}% difference). Triggering reanalysis...`,
			);

			// Update the description with recent developments
			const updatedDescription = launch.description.includes(
				"### Recent developments",
			)
				? launch.description.replace(
						/### Recent developments[\s\S]*?(?=\n\n|$)/,
						`### Recent developments\nAs of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${tokenStats.creatorTokensHeld} tokens held (${newPercentage}% of initial allocation)${
							tokenStats.creatorTokenMovementDetails
								? `\n${tokenStats.creatorTokenMovementDetails}`
								: ""
						}`,
					)
				: `${launch.description}\n\n### Recent developments\nAs of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${tokenStats.creatorTokensHeld} tokens held (${newPercentage}% of initial allocation)${
						tokenStats.creatorTokenMovementDetails
							? `\n${tokenStats.creatorTokenMovementDetails}`
							: ""
					}`;

			// Trigger reanalysis with updated description
			try {
				const analysisResult = await analyzeLaunch(
					updatedDescription,
					launch.launchpad,
				);

				// Update the database with new analysis using the DAL function
				await updateLaunchAnalysis(launchId, {
					description: updatedDescription,
					analysis: analysisResult.analysis,
					summary: analysisResult.summary,
					rating: analysisResult.rating,
					llmAnalysisUpdatedAt: new Date(),
				});

				console.log(
					`Analysis updated for launch ${launchId} with new rating: ${analysisResult.rating}/10`,
				);
			} catch (analysisError) {
				console.error("Error during reanalysis:", analysisError);
			}
		}

		revalidatePath(`/launch/${launchId}`, "page");
	} catch (error) {
		console.error("Error updating token holdings:", error);
		if (error instanceof Error) {
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
		}
	}
}
