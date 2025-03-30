import "server-only";
// Use type imports for types
import type {
	Abi,
	AbiItem,
	Address,
	GetLogsReturnType,
	Log,
	PublicClient,
} from "viem";
// Keep value imports separate
import {
	http,
	createPublicClient,
	decodeEventLog,
	formatUnits,
	parseAbi,
	parseAbiItem,
} from "viem";
import { base } from "viem/chains";
import { env } from "~/env";
import { formatTokenBalance } from "~/lib/utils";
import type { TokenUpdateResult } from "~/server/queries";
// Define ABI for standard ERC20 balanceOf function
export const balanceOfAbi = parseAbiItem(
	"function balanceOf(address account) view returns (uint256)",
) as AbiItem; // Cast remains as parseAbiItem returns a complex type

// Define ABI for standard ERC20 Transfer event
export const transferEventAbi = parseAbiItem(
	"event Transfer(address indexed from, address indexed to, uint256 value)",
) as AbiItem;

// Define ERC20 ABI with Transfer event in the format viem expects
export const erc20Abi = [
	{
		type: "event",
		name: "Transfer",
		inputs: [
			{
				indexed: true,
				name: "from",
				type: "address",
			},
			{
				indexed: true,
				name: "to",
				type: "address",
			},
			{
				indexed: false,
				name: "value",
				type: "uint256",
			},
		],
	},
] as const;

// Define common token lock contract addresses
const KNOWN_LOCK_ADDRESSES: Record<string, string> = {
	"0x100cc9618a91f242ea6f374bea9ef4e979b6a78a": "Team.Finance",
	"0x663a5c229c09b049e36dcc11a9dd1d8062d7595f": "UniCrypt",
	"0xf4c8e32eadec4bfe97e0f595add0f4450a863a11": "DxLock",
	"0xdad686299fb562f89e55da05f1d96fabeb2a2e32":
		"Virtuals Protocol 6-Month Lock",
	// Add more as needed
};

// Define common addresses associated with selling
const KNOWN_DEX_ADDRESSES: Record<string, string> = {
	// Base
	"0x743f2f29cdd66242fb27d292ab2cc92f45674635": "Sigma.Win Sniper",
	"0x8292b43ab73efac11faf357419c38acf448202c5":
		"Virtuals Protocol Approval Address", // TODO: in the future, this might be used to track if the creator is planning to sell
	// Special handling for dynamic VP pair addresses added by virtuals-base.ts
	__VP_PAIR_ADDRESS__: "Virtuals Protocol token's bonding curve", // This is a placeholder that will be replaced at runtime

	// Common routers across networks
	"0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Router",
	"0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
	"0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
	"0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
};

// Define a type for Transfer event args
interface TransferEventArgs {
	from: Address;
	to: Address;
	value: bigint;
}

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
 * @param currentBalanceBigInt - Optional pre-fetched current balance (as bigint)
 * @param launchPairAddress - Optional launch-specific selling address
 * @returns TokenUpdateResult containing the updated token statistics
 */
export async function updateEvmTokenStatistics(
	client: PublicClient,
	tokenAddress: Address,
	creatorAddress: Address,
	creatorInitialTokens: string,
	currentBalanceBigInt?: bigint,
	launchPairAddress?: Address,
): Promise<TokenUpdateResult> {
	console.log(`Updating EVM token statistics for token ${tokenAddress}:`);
	console.log(`- Creator address: ${creatorAddress}`);
	console.log(`- Initial tokens: ${creatorInitialTokens}`);

	// Add the launch pair address to known selling addresses if provided
	if (launchPairAddress) {
		addKnownEvmSellingAddress(
			launchPairAddress,
			"Launch-specific Selling Address",
		);
	}

	// Get current balance from blockchain if not provided
	const currentBalanceWei =
		currentBalanceBigInt !== undefined
			? currentBalanceBigInt
			: await getEvmErc20BalanceAtBlock(client, tokenAddress, creatorAddress);

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

	// Default result without token movement details
	const result: TokenUpdateResult = {
		creatorTokensHeld: roundedCurrentTokens,
		creatorTokenHoldingPercentage: percentageOfInitialHeld.toFixed(2),
		tokenStatsUpdatedAt: new Date(),
		// Store the launch-specific selling address if provided
		mainSellingAddress: launchPairAddress ? launchPairAddress : undefined,
	};

	// Only analyze token movement if creator has at least 1% less than initial allocation
	if (percentageOfInitialHeld < 99 && initialTokensNum > 0) {
		try {
			console.log(
				"Creator has reduced their token holdings. Analyzing movements...",
			);

			// Create a dedicated client with the Alchemy HTTP endpoint
			// This ensures we don't use the default fallback endpoint
			const httpUrl = env.BASE_RPC_URL
				? env.BASE_RPC_URL.replace("wss://", "https://")
				: undefined;

			console.log(`Using HTTP RPC URL: ${httpUrl || "(default)"}`);

			// Create a specific client for log analysis to ensure proper RPC URL
			const analysisClient = httpUrl
				? createPublicClient({
						chain: base,
						transport: http(httpUrl),
					})
				: client; // Fall back to provided client if no URL

			// Get the creator's transfer history (outgoing transfers)
			const transferLogs = await analysisClient
				.getLogs({
					address: tokenAddress,
					event: transferEventAbi as unknown as AbiItem & { type: "event" },
					args: {
						from: creatorAddress,
					},
					// Limit the block range to avoid timeouts on public endpoints
					fromBlock: 0n, // From genesis or earliest available
					toBlock: "latest",
				})
				.catch(async (error) => {
					console.error(
						`Error fetching logs, trying with recent blocks only: ${error.message}`,
					);

					// Get the latest block number for fallback range
					let recentBlocksStart = 0n;
					try {
						const latestBlock = await analysisClient.getBlockNumber();
						// Use last ~2 weeks of blocks (approx 100k blocks)
						recentBlocksStart = latestBlock - 100000n;
						if (recentBlocksStart < 0n) recentBlocksStart = 0n;
					} catch (blockError) {
						console.error(`Failed to get latest block number: ${blockError}`);
					}

					// Fallback to recent blocks only if first attempt fails
					return analysisClient
						.getLogs({
							address: tokenAddress,
							event: transferEventAbi as unknown as AbiItem & { type: "event" },
							args: {
								from: creatorAddress,
							},
							// Only check recent blocks as fallback
							fromBlock: recentBlocksStart,
							toBlock: "latest",
						})
						.catch((secondError) => {
							console.error(
								`Second attempt also failed: ${secondError.message}`,
							);
							return []; // Return empty array if both attempts fail
						});
				});

			if (transferLogs.length === 0) {
				result.creatorTokenMovementDetails =
					"No outgoing transfers found despite balance reduction. Possible contract interaction.";
				return result;
			}

			// Process logs to extract transfer data
			const transfers = transferLogs
				.map((log) => {
					try {
						const decoded = decodeEventLog({
							abi: erc20Abi,
							data: log.data,
							topics: log.topics,
						});

						// Explicitly type the args to avoid property access errors
						const args = decoded.args as TransferEventArgs;

						return {
							to: args.to,
							value: args.value,
							blockNumber: log.blockNumber,
							transactionHash: log.transactionHash,
						};
					} catch (error) {
						console.error("Error decoding transfer log:", error);
						return null;
					}
				})
				.filter((t): t is NonNullable<typeof t> => t !== null);

			// Sort by value (descending) and take up to 3 most significant transfers
			const significantTransfers = transfers
				.sort((a, b) => ((b?.value || 0n) > (a?.value || 0n) ? 1 : -1))
				.slice(0, 3);

			const movementDetails: string[] = [];

			// Track if any tokens were sent to the zero address (burn)
			let sentToZeroAddress = false;

			for (const transfer of significantTransfers) {
				if (!transfer) continue;

				const { to, value, transactionHash } = transfer;
				const formattedValue = formatTokenBalance(value);

				// Handle zero address (token burn)
				if (to.toLowerCase() === "0x0000000000000000000000000000000000000000") {
					movementDetails.push(
						`Burned ${formattedValue} tokens (sent to address 0x0 - might be token migration).`,
					);
					sentToZeroAddress = true;
					continue;
				}

				// Check if destination is a known lock contract
				const isKnownLock = Object.entries(KNOWN_LOCK_ADDRESSES).find(
					([address]) => address.toLowerCase() === to.toLowerCase(),
				);

				if (isKnownLock) {
					movementDetails.push(
						`Locked ${formattedValue} tokens in ${isKnownLock[1]} (${to}).`,
					);
				} else {
					// Check if destination is a known DEX router
					const isKnownDex = Object.entries(KNOWN_DEX_ADDRESSES).find(
						([address]) => address.toLowerCase() === to.toLowerCase(),
					);

					// Also check if it matches the launch-specific pair address
					const isLaunchPair =
						launchPairAddress &&
						to.toLowerCase() === launchPairAddress.toLowerCase();

					if (isKnownDex || isLaunchPair) {
						const dexName = isKnownDex
							? isKnownDex[1]
							: "Launch-specific Selling Address";
						movementDetails.push(
							`Sold ${formattedValue} tokens through ${dexName} (${to}).`,
						);
					} else {
						// Check if destination is any contract
						const isContract = await isDestinationContract(client, to);
						if (isContract) {
							movementDetails.push(
								`Transferred ${formattedValue} tokens to contract ${to} (possibly sold or added liquidity).`,
							);
						} else {
							movementDetails.push(
								`Transferred ${formattedValue} tokens to address ${to} (possibly to another wallet).`,
							);
						}
					}
				}
			}

			// If tokens were sent to zero address, add a note about potential token migration
			if (sentToZeroAddress) {
				movementDetails.push(
					'Note: tokens sent to the zero address usually indicate a token migration to a DEX-traded "graduated" token; the creator might still hold the new token variant. You should check!',
				);
			}

			result.creatorTokenMovementDetails = movementDetails.join(" ");
			console.log(
				`- Token movement details: ${result.creatorTokenMovementDetails}`,
			);
		} catch (error) {
			console.error("Error analyzing token movements:", error);
			result.creatorTokenMovementDetails = "Error analyzing token movements";
		}
	}

	return result;
}

/**
 * Checks if a destination address is a contract
 * @param client The viem client
 * @param address The address to check
 * @returns True if the address is a contract, false otherwise
 */
async function isDestinationContract(
	client: PublicClient,
	address: Address,
): Promise<boolean> {
	try {
		const code = await client.getBytecode({
			address,
		});
		// If there is bytecode, it's a contract
		return code !== undefined && code !== "0x";
	} catch (error) {
		console.error(`Error checking if ${address} is a contract:`, error);
		return false; // Assume it's not a contract if we can't determine
	}
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
			// Log both WEI and ETH values with block number
			console.log(
				`Balance fetched at block ${blockNumber || "latest"}: ${balance} WEI (${formatUnits(balance, 18)} ETH)`,
			);
			return balance;
		}

		if (typeof balance === "string" || typeof balance === "number") {
			// Convert string/number to bigint
			const balanceBigInt = BigInt(balance);
			// Log both WEI and ETH values with block number
			console.log(
				`Balance fetched at block ${blockNumber || "latest"}: ${balanceBigInt} WEI (${formatUnits(balanceBigInt, 18)} ETH)`,
			);
			return balanceBigInt;
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

/**
 * Adds a selling address to the KNOWN_DEX_ADDRESSES mapping
 * @param sellingAddress The address to add as a known selling destination
 * @param label Optional custom label for the address, defaults to "DEX Pair Address"
 */
export function addKnownEvmSellingAddress(
	sellingAddress: Address,
	label?: string,
): void {
	if (!sellingAddress) return;

	// Normalize the address format (lowercase)
	const normalizedAddress = sellingAddress.toLowerCase();

	// Add it to KNOWN_DEX_ADDRESSES if not already present
	if (!KNOWN_DEX_ADDRESSES[normalizedAddress]) {
		KNOWN_DEX_ADDRESSES[normalizedAddress] = label || "the launchpad";
		console.log(
			`Added selling address ${normalizedAddress} to KNOWN_DEX_ADDRESSES as "${KNOWN_DEX_ADDRESSES[normalizedAddress]}"`,
		);
	}
}
