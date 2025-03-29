"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { http, createPublicClient, formatUnits } from "viem";
import { base } from "viem/chains";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { getEvmErc20BalanceAtBlock } from "~/server/lib/evm-utils";

// Create a public client for Base network
const publicClient = createPublicClient({
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

		// Get current balance from blockchain
		const currentBalanceWei = await getEvmErc20BalanceAtBlock(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
		);

		console.log(
			`- Current balance from blockchain (in wei): ${currentBalanceWei.toString()}`,
		);

		// Convert wei to eth for current balance
		const currentTokensHeld = Number(formatUnits(currentBalanceWei, 18));
		const initialTokensNum = Number(creatorInitialTokens);

		console.log(`- Current tokens held by creator: ${currentTokensHeld}`);
		console.log(`- Initial token allocation: ${initialTokensNum}`);

		// Calculate what percentage of initial allocation is still held
		const percentageOfInitialHeld =
			initialTokensNum > 0 ? (currentTokensHeld / initialTokensNum) * 100 : 0;

		console.log(
			`- Percentage of initial allocation still held: ${percentageOfInitialHeld}%`,
		);

		// Round the current balance to match database format
		const roundedCurrentTokens = Math.round(currentTokensHeld).toString();

		// Log the exact values we're trying to update in the database
		console.log("Attempting to update database with:");
		console.log(
			`- creatorTokensHeld (current balance): ${roundedCurrentTokens}`,
		);
		console.log(
			`- creatorTokenHoldingPercentage (% of initial still held): ${percentageOfInitialHeld.toFixed(2)}`,
		);

		// Update the database with current values
		await db
			.update(launches)
			.set({
				creatorTokensHeld: roundedCurrentTokens,
				creatorTokenHoldingPercentage: percentageOfInitialHeld.toFixed(2),
				tokenStatsUpdatedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(launches.id, launchId));

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
