"use server";

import { revalidatePath } from "next/cache";
import { http, type Chain, type Transport, createPublicClient } from "viem";
import { base } from "viem/chains";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";
import { updateTokenStatisticsInDb } from "~/server/queries";
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
		const tokenStats = await updateEvmTokenStatistics(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
			creatorInitialTokens,
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
