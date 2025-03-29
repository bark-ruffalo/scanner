"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { http, createPublicClient } from "viem";
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
 * @param initialBalance The initial balance as a string (from numeric DB type)
 */
export async function updateTokenHoldings(
	launchId: number,
	tokenAddress: string,
	creatorAddress: string,
	initialBalance: string,
) {
	try {
		// Get current balance
		const currentBalance = await getEvmErc20BalanceAtBlock(
			publicClient,
			tokenAddress as `0x${string}`,
			creatorAddress as `0x${string}`,
		);

		// Convert to number for comparison
		const currentBalanceNumber = Number(currentBalance);
		const initialBalanceNumber = Number(initialBalance);

		// Calculate percentage of initial allocation
		const percentageOfInitial =
			initialBalanceNumber > 0
				? (currentBalanceNumber / initialBalanceNumber) * 100
				: 0;

		// Update the database
		await db
			.update(launches)
			.set({
				creatorTokensHeld: currentBalance.toString(),
				creatorTokenHoldingPercentage: percentageOfInitial.toFixed(2),
			})
			.where(eq(launches.id, launchId));

		// Revalidate the page to show updated data
		revalidatePath(`/launch/${launchId}`);
	} catch (error) {
		console.error("Error updating token holdings:", error);
		// Don't throw - this is a background operation
	}
}
