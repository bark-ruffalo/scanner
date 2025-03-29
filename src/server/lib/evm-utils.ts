import "server-only";
// Use type imports for types
import type { AbiItem, Address, PublicClient } from "viem";
// Keep value imports separate
import { formatUnits, parseAbiItem } from "viem";
import type { TokenUpdateResult } from "~/server/queries";

// Define ABI for standard ERC20 balanceOf function
export const balanceOfAbi = parseAbiItem(
	"function balanceOf(address account) view returns (uint256)",
) as AbiItem; // Cast remains as parseAbiItem returns a complex type

// Define a minimal client interface
interface ReadContractClient {
	readContract(args: {
		address: Address;
		abi: readonly AbiItem[];
		functionName: string;
		args: readonly unknown[];
		blockNumber?: bigint;
	}): Promise<unknown>;
	getBlockNumber(): Promise<bigint>;
}

/**
 * Updates token statistics for a given EVM token and creator address.
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
export async function updateEvmTokenStatistics(
	client: PublicClient,
	tokenAddress: Address,
	creatorAddress: Address,
	creatorInitialTokens: string,
	blockNumber?: bigint,
): Promise<TokenUpdateResult> {
	console.log(`Updating EVM token statistics for token ${tokenAddress}:`);
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
	const roundedCurrentTokens = Math.round(currentTokensHeld).toString();

	console.log(`- Current tokens held by creator: ${roundedCurrentTokens}`);
	console.log(`- Initial token allocation: ${Math.round(initialTokensNum)}`);

	// Calculate what percentage of initial allocation is still held
	const percentageOfInitialHeld =
		initialTokensNum > 0 ? (currentTokensHeld / initialTokensNum) * 100 : 0;

	console.log(
		`- Percentage of initial allocation still held: ${percentageOfInitialHeld.toFixed(2)}%`,
	);

	// Return the values in database format
	return {
		creatorTokensHeld: roundedCurrentTokens,
		creatorTokenHoldingPercentage: percentageOfInitialHeld.toFixed(2),
		tokenStatsUpdatedAt: new Date(),
	};
}

/**
 * Fetches the EVM-based ERC20 token balance of an account at a specific block number.
 * @param client A viem client that can call readContract
 * @param tokenAddress The address of the ERC20 token contract.
 * @param accountAddress The address of the account whose balance is being checked.
 * @param blockNumber Optional block number at which to check the balance. If not provided, uses the latest block.
 * @returns A promise that resolves to the balance as a bigint, or 0n if an error occurs.
 */
export async function getEvmErc20BalanceAtBlock(
	client: ReadContractClient, // Use the interface instead of {readContract: Function}
	tokenAddress: Address,
	accountAddress: Address,
	blockNumber?: bigint,
): Promise<bigint> {
	const blockDescription = blockNumber
		? `at block ${blockNumber}`
		: `at latest block ${await client.getBlockNumber()}`;
	console.log(`Fetching creator's balance ${blockDescription}...`);
	try {
		const contractArgs: {
			address: Address;
			abi: readonly AbiItem[];
			functionName: string;
			args: readonly unknown[];
			blockNumber?: bigint;
		} = {
			address: tokenAddress,
			abi: [balanceOfAbi], // Use the shared ABI fragment
			functionName: "balanceOf",
			args: [accountAddress],
		};

		// Only add blockNumber if it's specified
		if (blockNumber !== undefined) {
			contractArgs.blockNumber = blockNumber;
		}

		const balance = await client.readContract(contractArgs);

		// Handle type conversion with proper guards
		if (typeof balance === "bigint") {
			return balance;
		}

		if (typeof balance === "string" || typeof balance === "number") {
			// Convert string/number to bigint
			return BigInt(balance);
		}

		// If it's neither bigint nor string/number, return 0n as a safe fallback
		console.warn(
			`Unexpected balance type (${typeof balance}) for token ${tokenAddress}, account ${accountAddress}. Using 0.`,
		);
		return 0n;
	} catch (error) {
		console.error(
			`Error fetching balance for token ${tokenAddress} / account ${accountAddress}${
				blockNumber !== undefined ? ` at block ${blockNumber}` : ""
			}:`,
			error,
		);
		return 0n;
	}
}
