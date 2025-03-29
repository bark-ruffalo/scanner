import { eq } from "drizzle-orm";
import { type Address, type PublicClient, formatUnits } from "viem";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { getEvmErc20BalanceAtBlock } from "./evm-utils";

interface TokenUpdateResult {
	creatorTokensHeld: string;
	creatorTokenHoldingPercentage: string;
	tokenStatsUpdatedAt: Date;
}

/**
 * Updates token statistics for a given token and creator address.
 * This is the central function for updating token-related information,
 * used both when adding new launches and when refreshing existing ones.
 *
 * @param client - The viem public client to use for blockchain queries
 * @param tokenAddress - The token contract address
 * @param creatorAddress - The creator's address
 * @param creatorInitialTokens - The creator's initial token allocation (as a string)
 * @param blockNumber - Optional block number to check balance at
 * @returns TokenUpdateResult containing the updated token statistics
 */
export async function updateTokenStatistics(
	client: PublicClient,
	tokenAddress: Address,
	creatorAddress: Address,
	creatorInitialTokens: string,
	blockNumber?: bigint,
): Promise<TokenUpdateResult> {
	console.log(`Updating token statistics for token ${tokenAddress}:`);
	console.log(`- Creator address: ${creatorAddress}`);
	console.log(`- Initial tokens: ${creatorInitialTokens}`);
	if (blockNumber) console.log(`- At block: ${blockNumber}`);

	// Get current balance from blockchain
	const currentBalanceWei = await getEvmErc20BalanceAtBlock(
		client,
		tokenAddress,
		creatorAddress,
		blockNumber,
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

	return {
		creatorTokensHeld: roundedCurrentTokens,
		creatorTokenHoldingPercentage: percentageOfInitialHeld.toFixed(2),
		tokenStatsUpdatedAt: new Date(),
	};
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
			tokenStatsUpdatedAt: tokenStats.tokenStatsUpdatedAt,
			updatedAt: new Date(),
		})
		.where(eq(launches.id, launchId));
}
