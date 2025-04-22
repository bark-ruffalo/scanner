import type { Idl } from "@coral-xyz/anchor";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import {
	fetchDigitalAsset,
	mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { TOKEN_PROGRAM_ID, getAccount, getMint } from "@solana/spl-token";
import {
	type Commitment,
	Connection,
	type ConnectionConfig,
	PublicKey,
} from "@solana/web3.js";
import "server-only";
import { env } from "~/env";
import { formatTokenBalance, SVM_DECIMALS } from "~/lib/utils";
import type { TokenUpdateResult } from "~/server/queries";

// --- Rate Limiter ---

/**
 * Configuration for exponential backoff retry
 */
interface RetryConfig {
	initialDelayMs: number;
	maxRetries: number;
	backoffFactor: number;
}

/**
 * Simple rate limiter for RPC requests with exponential backoff retry
 */
class RateLimiter {
	private queue: Array<() => Promise<unknown>> = [];
	private processing = false;
	private lastRequestTime = 0;
	private requestsInWindow = 0;
	private readonly requestsPerSecond: number;
	private readonly minDelayMs: number;
	private readonly retryConfig: RetryConfig;

	constructor(
		requestsPerSecond = 2,
		minDelayMs = 500,
		retryConfig: Partial<RetryConfig> = {},
	) {
		this.requestsPerSecond = requestsPerSecond;
		this.minDelayMs = minDelayMs;
		this.retryConfig = {
			initialDelayMs: 1000, // Start with 1 second delay
			maxRetries: 6,
			backoffFactor: 2, // Double the delay each retry
			...retryConfig,
		};
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async retryWithBackoff<T>(
		operation: () => Promise<T>,
		attempt = 1,
	): Promise<T> {
		try {
			return await operation();
		} catch (error) {
			// Check if it's a rate limit error (429)
			const isRateLimitError =
				error instanceof Error &&
				(error.message.includes("429") ||
					error.message.toLowerCase().includes("too many requests"));

			if (isRateLimitError && attempt < this.retryConfig.maxRetries) {
				const delayMs =
					this.retryConfig.initialDelayMs *
					this.retryConfig.backoffFactor ** (attempt - 1);
				console.log(
					`Rate limit hit. Retrying in ${delayMs}ms (attempt ${attempt} of ${this.retryConfig.maxRetries})...`,
				);
				await this.sleep(delayMs);
				return this.retryWithBackoff(operation, attempt + 1);
			}
			throw error;
		}
	}

	private async processQueue() {
		if (this.processing) return;
		this.processing = true;

		while (this.queue.length > 0) {
			const now = Date.now();
			const timeSinceLastRequest = now - this.lastRequestTime;

			// Reset window if more than 1 second has passed
			if (timeSinceLastRequest > 1000) {
				this.requestsInWindow = 0;
			}

			// Check if we need to wait
			if (this.requestsInWindow >= this.requestsPerSecond) {
				const waitTime = 1000 - timeSinceLastRequest;
				if (waitTime > 0) {
					await this.sleep(waitTime);
					continue;
				}
				this.requestsInWindow = 0;
			}

			// Ensure minimum delay between requests
			const delayNeeded = this.minDelayMs - timeSinceLastRequest;
			if (delayNeeded > 0) {
				await this.sleep(delayNeeded);
			}

			const request = this.queue.shift();
			if (request) {
				try {
					await this.retryWithBackoff(request);
				} catch (error) {
					console.error(
						"Rate limited request failed after all retries:",
						error,
					);
				}
				this.lastRequestTime = Date.now();
				this.requestsInWindow++;
			}
		}

		this.processing = false;
	}

	async submit<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await this.retryWithBackoff(fn);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});
			void this.processQueue();
		});
	}
}

// Create a global rate limiter instance with higher initial delay
const rateLimiter = new RateLimiter(10, 500, {
	initialDelayMs: 1000, // Start with 1 second
	maxRetries: 6,
	backoffFactor: 2, // Each retry will double the delay: 1s -> 2s -> 4s -> 8s -> 16s -> 32s
});

/**
 * Type for RPC method names
 */
type RpcMethodName = keyof Connection & string;

/**
 * Type for RPC method function
 */
type RpcMethod = (...args: unknown[]) => Promise<unknown>;

/**
 * Wraps a Solana Connection to add rate limiting
 */
class RateLimitedConnection extends Connection {
	constructor(
		endpoint: string,
		commitmentOrConfig?: Commitment | ConnectionConfig,
	) {
		super(endpoint, commitmentOrConfig);

		// Wrap RPC methods with rate limiting
		const methodsToLimit = [
			"getAccountInfo",
			"getBalance",
			"getBlockHeight",
			"getBlockProduction",
			"getBlocks",
			"getBlockTime",
			"getClusterNodes",
			"getFirstAvailableBlock",
			"getGenesisHash",
			"getInflationGovernor",
			"getInflationRate",
			"getInflationReward",
			"getLargestAccounts",
			"getLatestBlockhash",
			"getLeaderSchedule",
			"getMinimumBalanceForRentExemption",
			"getProgramAccounts",
			"getRecentBlockhash",
			"getSignaturesForAddress",
			"getSlot",
			"getSlotLeader",
			"getSupply",
			"getTokenAccountBalance",
			"getTokenAccountsByOwner",
			"getTokenSupply",
			"getTransaction",
			"getTransactionCount",
			"getVersion",
			"getVoteAccounts",
		] as const;

		// Wrap each method with rate limiting
		for (const method of methodsToLimit) {
			const original = this[method] as RpcMethod;
			if (typeof original === "function") {
				const wrapped = async (...args: unknown[]) => {
					return rateLimiter.submit(() => original.apply(this, args));
				};
				Object.defineProperty(this, method, {
					value: wrapped,
					writable: true,
					configurable: true,
				});
			}
		}
	}
}

// --- Constants ---

// Known addresses
const ZERO_ADDRESS = new PublicKey("11111111111111111111111111111111");
const DEAD_ADDRESS = new PublicKey(
	"1nc1nerator11111111111111111111111111111111",
);

// --- Types ---

/**
 * Define a custom type for Solana logs with the properties we need
 */
export interface SolanaLogInfo {
	logs: string[];
	signature: string;
	timestamp?: number;
}

/**
 * Type for token burn events
 */
export interface TokenBurnEvent {
	tokenMint: PublicKey;
	amount: bigint;
	authority: PublicKey;
	timestamp: number;
}

/**
 * Type for token transfer events
 */
export interface TokenTransferEvent {
	tokenMint: PublicKey;
	from: PublicKey;
	to: PublicKey;
	amount: bigint;
	timestamp: number;
}

/**
 * Checks if an address is a burn address
 * @param address The address to check
 */
export function isBurnAddress(address: PublicKey): boolean {
	return address.equals(ZERO_ADDRESS) || address.equals(DEAD_ADDRESS);
}

/**
 * Monitors SPL token burns for a specific token
 * @param connection The Solana connection
 * @param tokenMint The token mint to monitor
 * @param callback Callback function to handle burn events
 */
export async function monitorTokenBurns(
	connection: Connection,
	tokenMint: PublicKey,
	callback: (event: TokenBurnEvent) => void,
): Promise<number> {
	console.log(`Starting burn monitor for token ${tokenMint.toString()}`);

	// Subscribe to token program logs
	const subscriptionId = connection.onLogs(
		TOKEN_PROGRAM_ID,
		async (logs: SolanaLogInfo) => {
			// Process each log
			for (const log of logs.logs) {
				try {
					// Look for burn instructions
					if (log.includes("Instruction: Burn")) {
						const tx = await connection.getTransaction(logs.signature, {
							maxSupportedTransactionVersion: 0,
						});

						if (!tx || !tx.meta) continue;

						// Find token balance changes
						const preTokenBalances = tx.meta.preTokenBalances || [];
						const postTokenBalances = tx.meta.postTokenBalances || [];

						// Look for balance changes in the token we're monitoring
						for (const pre of preTokenBalances) {
							if (pre.mint === tokenMint.toString() && pre.owner) {
								const post = postTokenBalances.find(
									(p) => p.accountIndex === pre.accountIndex,
								);

								if (post) {
									const burnAmount =
										(pre.uiTokenAmount.uiAmount || 0) -
										(post.uiTokenAmount.uiAmount || 0);

									if (burnAmount > 0) {
										// Found a burn event
										callback({
											tokenMint,
											amount: BigInt(Math.floor(burnAmount * 1e9)), // Convert to lamports
											authority: new PublicKey(pre.owner),
											timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
										});
									}
								}
							}
						}
					}
				} catch (error) {
					console.error("Error processing token burn log:", error);
				}
			}
		},
	);

	return subscriptionId;
}

/**
 * Monitors SPL token transfers for a specific token
 * @param connection The Solana connection
 * @param tokenMint The token mint to monitor
 * @param callback Callback function to handle transfer events
 */
export async function monitorTokenTransfers(
	connection: Connection,
	tokenMint: PublicKey,
	callback: (event: TokenTransferEvent) => void,
): Promise<number> {
	console.log(`Starting transfer monitor for token ${tokenMint.toString()}`);

	// Subscribe to token program logs
	const subscriptionId = connection.onLogs(
		TOKEN_PROGRAM_ID,
		async (logs: SolanaLogInfo) => {
			// Process each log
			for (const log of logs.logs) {
				try {
					// Look for transfer instructions
					if (log.includes("Instruction: Transfer")) {
						const tx = await connection.getTransaction(logs.signature, {
							maxSupportedTransactionVersion: 0,
						});

						if (!tx || !tx.meta) continue;

						// Find token balance changes
						const preTokenBalances = tx.meta.preTokenBalances || [];
						const postTokenBalances = tx.meta.postTokenBalances || [];

						// Look for balance changes in the token we're monitoring
						for (const pre of preTokenBalances) {
							if (pre.mint === tokenMint.toString() && pre.owner) {
								// Find the corresponding post balance
								const post = postTokenBalances.find(
									(p) => p.accountIndex === pre.accountIndex,
								);

								if (post) {
									const transferAmount =
										(pre.uiTokenAmount.uiAmount || 0) -
										(post.uiTokenAmount.uiAmount || 0);

									if (transferAmount > 0) {
										// Find the destination account
										const destination = postTokenBalances.find(
											(p) =>
												p.accountIndex !== pre.accountIndex &&
												p.mint === tokenMint.toString() &&
												p?.owner,
										);

										if (destination?.owner) {
											// Found a transfer event
											callback({
												tokenMint,
												from: new PublicKey(pre.owner),
												to: new PublicKey(destination.owner),
												amount: BigInt(Math.floor(transferAmount * 1e9)), // Convert to lamports
												timestamp:
													tx.blockTime || Math.floor(Date.now() / 1000),
											});
										}
									}
								}
							}
						}
					}
				} catch (error) {
					console.error("Error processing token transfer log:", error);
				}
			}
		},
	);

	return subscriptionId;
}

/**
 * Creates or gets a Solana connection
 * This is the Solana equivalent of creating a viem PublicClient
 */
export function getSolanaConnection(
	rpcUrlOverride?: string,
	launchpadName?: string,
): Connection {
	// Get RPC URL from override, environment, or use a default
	const rpcUrl = rpcUrlOverride || "https://mainnet.helius-rpc.com";

	// Create rate-limited connection with commitment level
	const connection = new RateLimitedConnection(rpcUrl, "confirmed");

	if (launchpadName) {
		console.log(`Rate-limited Solana connection created for ${launchpadName}`);
	} else {
		console.log("Rate-limited Solana connection created");
	}

	return connection;
}

/**
 * Creates an event parser for a Solana program
 * @param programId The program ID to parse events for
 * @param idl The IDL for the program
 * @returns An event parser or null if the IDL is invalid
 */
export function createSolanaEventParser(
	programId: PublicKey,
	idl: Idl | null,
): EventParser | null {
	if (!idl) {
		console.error("Cannot create event parser: IDL is null");
		return null;
	}

	try {
		return new EventParser(programId, new BorshCoder(idl));
	} catch (error) {
		console.error("Failed to create event parser:", error);
		return null;
	}
}

/**
 * Gets the SPL token metadata and supply using Metaplex
 * @param connection The Solana connection
 * @param tokenMint The token mint address
 */
export async function getSolanaTokenMetadata(
	connection: Connection,
	tokenMint: PublicKey,
): Promise<{
	name: string;
	symbol: string;
	totalSupply: bigint;
	decimals: number;
}> {
	try {
		// Get the mint info to get decimals and supply
		const mintInfo = await getMint(connection, tokenMint);

		// Initialize UMI with the connection's endpoint and plugins
		const umi = createUmi(connection.rpcEndpoint).use(mplTokenMetadata());

		// Fetch the digital asset metadata
		const asset = await fetchDigitalAsset(umi, publicKey(tokenMint.toString()));

		return {
			name: asset.metadata.name,
			symbol: asset.metadata.symbol,
			totalSupply: mintInfo.supply,
			decimals: mintInfo.decimals,
		};
	} catch (error) {
		console.error(`Error fetching token metadata for ${tokenMint}:`, error);
		// Fallback to basic info if metadata not found
		const shortAddress = tokenMint.toString().substring(0, 8);
		return {
			name: `Token ${shortAddress}`,
			symbol: `T${shortAddress.substring(0, 4)}`,
			totalSupply: 0n,
			decimals: 9, // Default for most Solana tokens
		};
	}
}

/**
 * Gets token balance for a specific owner
 * @param connection The Solana connection
 * @param tokenMint The token mint address
 * @param owner The token owner
 * @param blockNumber Optional block (slot) number at which to check the balance. If not provided, uses the latest block.
 */
export async function getSolanaTokenBalance(
	connection: Connection,
	tokenMint: PublicKey,
	owner: PublicKey,
	blockNumber?: number | bigint,
): Promise<bigint> {
	try {
		// Find the associated token account
		const accounts = await connection.getTokenAccountsByOwner(owner, {
			mint: tokenMint,
		});

		if (accounts.value.length === 0) {
			console.log(
				`No token account found for ${owner.toString()} with mint ${tokenMint.toString()}`,
			);
			return 0n;
		}

		// Get the first account (there should usually be only one per mint)
		const accountInfo = accounts.value[0];
		if (!accountInfo) {
			return 0n;
		}

		// If blockNumber is provided, get balance at that specific block
		if (blockNumber !== undefined) {
			// Convert bigint to number if needed
			const blockNum =
				typeof blockNumber === "bigint" ? Number(blockNumber) : blockNumber;

			console.log(
				`Attempting to get historical balance at block ${blockNum} for token ${tokenMint.toString()}`,
			);

			// For historical balance, we need a different approach
			// In Solana, we need to find transactions before the specified block
			// and reconstruct balances based on transfers

			try {
				// First check if the account already exists at this block
				// by using the getAccountInfo with a config specifying the block
				const accountData = await connection.getAccountInfo(
					accountInfo.pubkey,
					{
						commitment: "confirmed",
						minContextSlot: blockNum,
					},
				);

				// If account doesn't exist at this block, the balance was 0
				if (!accountData) {
					console.log(`Account did not exist at block ${blockNum}`);
					return 0n;
				}

				// If account exists, we need to query its balance
				// Use getSignaturesForAddress to find transactions up to this block
				const signatures = await connection.getSignaturesForAddress(
					accountInfo.pubkey,
					{
						limit: 100,
						before: blockNum.toString(),
					},
				);

				// Add a guard for if signatures is empty
				if (signatures.length === 0) {
					console.log(
						"No historical transactions found, using current balance",
					);
					const tokenAccount = await getAccount(connection, accountInfo.pubkey);
					return tokenAccount.amount;
				}

				// Get the earliest signature that's still before our target block
				const earliestSignature =
					signatures[signatures.length - 1]?.signature || "";
				console.log(`Found earliest signature: ${earliestSignature}`);

				// Get transaction details to check balance
				const tx = await connection.getTransaction(earliestSignature, {
					maxSupportedTransactionVersion: 0,
				});

				if (!tx || !tx.meta) {
					console.log(
						"Balance not found in transaction data, using current balance",
					);
					const tokenAccount = await getAccount(connection, accountInfo.pubkey);
					return tokenAccount.amount;
				}

				// Look for post token balances
				const postTokenBalances = tx.meta.postTokenBalances || [];

				// Find this specific account's balance in the transaction
				for (const balance of postTokenBalances) {
					// Match both the owner and mint
					if (
						balance.owner === owner.toString() &&
						balance.mint === tokenMint.toString()
					) {
						// Get raw amount using decimals
						const decimals = balance.uiTokenAmount.decimals;
						const amount = balance.uiTokenAmount.amount;
						console.log(
							`Found historical balance: ${amount} (${balance.uiTokenAmount.uiAmount} with ${decimals} decimals)`,
						);
						return BigInt(amount);
					}
				}

				// If we can't find the balance in transaction data, use current as fallback
				console.log(
					"Balance not found in transaction data, using current balance",
				);
				const tokenAccount = await getAccount(connection, accountInfo.pubkey);
				return tokenAccount.amount;
			} catch (error) {
				console.error(
					`Error getting historical balance at block ${blockNum}:`,
					error,
				);

				// Fallback to current balance if historical lookup fails
				console.log("Falling back to current balance due to error");
				const tokenAccount = await getAccount(connection, accountInfo.pubkey);
				return tokenAccount.amount;
			}
		}

		// If no blockNumber specified, get current balance
		const tokenAccount = await getAccount(connection, accountInfo.pubkey);
		return tokenAccount.amount;
	} catch (error) {
		console.error(
			`Error fetching token balance for ${owner.toString()}:`,
			error,
		);
		return 0n;
	}
}

/**
 * Updates token statistics for a given Solana token and creator address.
 * This is the equivalent of updateEvmTokenStatistics but for Solana.
 */
export async function updateSolanaTokenStatistics(
	connection: Connection,
	tokenMint: PublicKey,
	creator: PublicKey,
	creatorInitialTokens: string,
	currentBalanceLamports?: bigint,
): Promise<TokenUpdateResult> {
	console.log(
		`Updating Solana token statistics for token ${tokenMint.toString()}:`,
	);
	console.log(`- Creator address: ${creator.toString()}`);
	console.log(`- Initial tokens (rounded): ${creatorInitialTokens}`);

	// Get token metadata including decimals
	const metadata = await getSolanaTokenMetadata(connection, tokenMint);
	const decimals = metadata.decimals;

	// Get current balance from blockchain if not provided
	const currentBalanceRaw =
		currentBalanceLamports !== undefined
			? currentBalanceLamports
			: await getSolanaTokenBalance(connection, tokenMint, creator);

	console.log(
		`- Current balance from blockchain (raw): ${currentBalanceRaw.toString()}`,
	);

	// Calculate rounded current tokens held
	const divisor = 10n ** BigInt(decimals);
	const currentTokensRounded = currentBalanceRaw / divisor;
	const roundedCurrentTokensString = currentTokensRounded.toString();

	// Convert initial tokens (rounded string) to number for percentage calculation
	const initialTokensNum = Number(creatorInitialTokens);

	console.log(
		`- Current tokens held by creator (rounded): ${roundedCurrentTokensString}`,
	);
	console.log(
		`- Initial token allocation (rounded): ${Math.round(initialTokensNum)}`,
	);

	// Calculate what percentage of initial allocation is still held
	const percentageOfInitialHeld =
		initialTokensNum > 0
			? (Number(roundedCurrentTokensString) / initialTokensNum) * 100
			: 0;

	console.log(
		`- Percentage of initial allocation still held: ${percentageOfInitialHeld.toFixed(2)}%`,
	);

	// Check for token movements
	let creatorTokenMovementDetails = "";
	let sentToZeroAddress = false;

	// Get recent token transfers
	const signatures = await connection.getSignaturesForAddress(creator, {
		limit: 50,
	});

	// Process each transaction to look for token movements
	for (const signatureInfo of signatures) {
		const tx = await connection.getTransaction(signatureInfo.signature, {
			maxSupportedTransactionVersion: 0,
		});

		if (!tx || !tx.meta) continue;

		// Check pre and post balances for the specific token mint
		const preBalance = tx.meta.preTokenBalances?.find(
			(b) => b.owner === creator.toString() && b.mint === tokenMint.toString(),
		)?.uiTokenAmount.amount;
		const postBalance = tx.meta.postTokenBalances?.find(
			(b) => b.owner === creator.toString() && b.mint === tokenMint.toString(),
		)?.uiTokenAmount.amount;

		// If balances exist, calculate the difference
		if (preBalance !== undefined && postBalance !== undefined) {
			const preBalanceBigInt = BigInt(preBalance);
			const postBalanceBigInt = BigInt(postBalance);
			const differenceRaw = preBalanceBigInt - postBalanceBigInt;

			// If difference is positive, it's an outgoing transfer
			if (differenceRaw > 0n) {
				// Find the destination owner
				const destinationBalance = tx.meta.postTokenBalances?.find(
					(b) =>
						b.mint === tokenMint.toString() && // Same token
						b.owner !== creator.toString() && // Different owner
						BigInt(b.uiTokenAmount.amount) >=
							BigInt(
								tx.meta?.preTokenBalances?.find(
									(pre) => pre.accountIndex === b.accountIndex,
								)?.uiTokenAmount.amount ?? "0",
							),
				);

				const destinationOwner = destinationBalance?.owner;
				const differenceRounded = differenceRaw / divisor;
				const formattedDiff = formatTokenBalance(differenceRounded.toString());

				if (destinationOwner) {
					// Check if destination is a burn address
					if (isBurnAddress(new PublicKey(destinationOwner))) {
						sentToZeroAddress = true;
						creatorTokenMovementDetails += `\n- Burned ${formattedDiff} tokens`;
					} else {
						try {
							// Check if destination is a program (executable account)
							const destinationInfo = await connection.getAccountInfo(
								new PublicKey(destinationOwner),
							);
							if (destinationInfo?.executable) {
								creatorTokenMovementDetails += `\n- Sent ${formattedDiff} tokens to a program (${destinationOwner.substring(0, 4)}...)`;
							} else {
								// Assume sale if not a program or burn address
								creatorTokenMovementDetails += `\n- Sold ${formattedDiff} tokens`;
							}
						} catch (error) {
							console.error(
								`Error checking destination account ${destinationOwner}: ${error}`,
							);
							creatorTokenMovementDetails += `\n- Transferred ${formattedDiff} tokens to unknown destination`;
						}
					}
				} else {
					// If destination couldn't be identified (e.g., closed account)
					creatorTokenMovementDetails += `\n- Transferred out ${formattedDiff} tokens (destination unclear)`;
				}
			}
		}
	}

	// Return the result with rounded token amounts as strings
	const result: TokenUpdateResult = {
		creatorTokensHeld: roundedCurrentTokensString,
		creatorTokenHoldingPercentage: percentageOfInitialHeld.toFixed(2),
		tokenStatsUpdatedAt: new Date(),
		creatorTokenMovementDetails:
			creatorTokenMovementDetails.trim() || undefined,
		sentToZeroAddress,
	};

	return result;
}

/**
 * Checks if a Solana RPC URL is a websocket URL
 * @param url The URL to check
 * @returns Boolean indicating if the URL is a websocket URL
 */
export function isSolanaWebsocketUrl(url: string): boolean {
	return url.startsWith("ws://") || url.startsWith("wss://");
}
