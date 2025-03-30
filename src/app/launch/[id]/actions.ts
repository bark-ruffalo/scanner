"use server";

import { revalidatePath } from "next/cache";
import { http, type Chain, type Transport, createPublicClient } from "viem";
import { base } from "viem/chains";
import {
	addKnownEvmSellingAddress,
	updateEvmTokenStatistics,
} from "~/server/lib/evm-utils";
import { getLaunchById, updateTokenStatisticsInDb } from "~/server/queries";
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
				"Launch-specific Selling Address",
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
		revalidatePath(`/launch/${launchId}`, "page");
	} catch (error) {
		console.error("Error updating token holdings:", error);
		if (error instanceof Error) {
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
		}
	}
}
