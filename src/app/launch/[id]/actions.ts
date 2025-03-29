"use server";

import { revalidatePath } from "next/cache";
import { http, createPublicClient, type Transport, type Chain } from "viem";
import { base } from "viem/chains";
import {
	updateTokenStatistics,
	updateTokenStatisticsInDb,
} from "~/server/lib/token-utils";

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
		console.log(`Updating token holdings for launch ${launchId}:`);
		console.log(`- Token address: ${tokenAddress}`);
		console.log(`- Creator address: ${creatorAddress}`);
		console.log(
			`- Creator's initial token allocation: ${creatorInitialTokens}`,
		);

		// Get updated token statistics
		const tokenStats = await updateTokenStatistics(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
			creatorInitialTokens,
		);

		// Update the database
		await updateTokenStatisticsInDb(launchId, tokenStats);

		// Revalidate the page to show updated data
		revalidatePath(`/launch/${launchId}`, "page");
	} catch (error) {
		// Enhanced error logging
		console.error("Error updating token holdings:");
		console.error("Error details:", error);
		if (error instanceof Error) {
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
		}
		// Don't throw - this is a background operation
	}
}
