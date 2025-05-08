import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type {
	CompiledInstruction,
	ConfirmedSignatureInfo,
	Connection,
	LoadedAddresses,
	Message,
	MessageCompiledInstruction,
	ParsedInnerInstruction,
	ParsedInstruction,
	TransactionInstruction,
	VersionedMessage,
	// Need these types for getTransaction response
	VersionedTransactionResponse,
	TokenBalance, // Import TokenBalance type
} from "@solana/web3.js";
import { PublicKey as SolanaPublicKey } from "@solana/web3.js";
import bs58 from "bs58"; // Import bs58
import { eq } from "drizzle-orm";
import type { Helius, EnrichedTransaction } from "helius-sdk"; // Import Helius and EnrichedTransaction types
import { env } from "~/env";
import type { LaunchpadLinkGenerator } from "~/lib/content-utils";
import {
	SVM_DECIMALS,
	calculateBigIntPercentage,
	formatTokenBalance,
} from "~/lib/utils";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { fetchAdditionalContent } from "~/server/lib/common-utils";
// Import getHeliusClient and getConnection
import { getConnection, getHeliusClient } from "~/server/lib/svm-client";
import {
	type SolanaLogInfo,
	getSolanaTokenBalance,
	updateSolanaTokenStatistics,
} from "~/server/lib/svm-utils";
import {
	fetchVirtualsTokenInfo,
	formatVirtualsInfo,
} from "~/server/lib/virtuals-utils";
import { addLaunch } from "~/server/queries";
import { IDL, VIRTUALS_PROGRAM_ID } from "./needed/virtuals-solana-idl";

// Initialize the instruction coder at the top level
const instructionCoder = new BorshInstructionCoder(IDL);

// --- Types and Configuration ---

// Define the event data structure for launch events
interface LaunchEventData {
	tokenMint: string;
	name: string;
	symbol: string;
	uri: string;
}

// Define the structure returned by parseProgramLogs
interface ParsedLaunchInfo {
	launchData: LaunchEventData;
	creator: PublicKey;
	eventTimestamp: number;
	txSignature: string;
	// Removed heliusTokenBalanceChanges as the property access is unclear in SDK v1.5
}

// Define the launch instruction data structure
interface LaunchInstructionData {
	symbol: string;
	name: string;
	uri: string;
}

// Constant string identifying the launchpad for database storage and display purposes
const LAUNCHPAD_NAME = "VIRTUALS Protocol (Solana)";

// Validate IDL has launch instruction
const launchInstruction = IDL.instructions.find((ix) => ix.name === "launch");
if (!launchInstruction) {
	throw new Error("IDL is missing the 'launch' instruction");
}

// Add the custom link generator for Virtuals Protocol on Solana
const virtualsLinkGenerator: LaunchpadLinkGenerator = {
	getCustomLinks: (params) => {
		const links = [];
		if (params.creatorAddress) {
			links.push({
				url: `https://api.virtuals.io/api/profile/${params.creatorAddress}`,
				name: "Creator profile on Virtuals Protocol",
				useFirecrawl: false,
			});
		}
		if (params.tokenAddress) {
			// Add link to Virtuals app page for the token
			links.push({
				url: `https://app.virtuals.io/prototypes/${params.tokenAddress}`,
				name: "Token page on Virtuals Protocol App",
				useFirecrawl: false, // Simple fetch is enough
			});
			// Add link to Solscan token page
			links.push({
				url: `https://solscan.io/token/${params.tokenAddress}`,
				name: "Token on Solscan",
				useFirecrawl: true, // Use Firecrawl to get holder info etc.
				firecrawlOptions: { formats: ["markdown"], maxPages: 1 },
			});
		}
		return links;
	},
};

// Track the active listener to prevent duplicates
let activeListener: number | null = null;

// --- Core Helius Transaction Processing ---

/**
 * Fetches and processes a single transaction using the Helius SDK to find and handle launch events.
 * @param signature The transaction signature to process.
 * @param heliusClient An initialized Helius SDK client instance.
 * @returns Promise<boolean> indicating if a launch event was found and processed.
 */
async function fetchAndProcessLaunchTransactionViaHelius(
	signature: string,
	heliusClient: Helius,
): Promise<boolean> {
	console.log(
		`[${LAUNCHPAD_NAME}] [${signature}] Attempting to process transaction via Helius SDK...`,
	);
	try {
		const parsedTxArray = await heliusClient.parseTransactions({
			transactions: [signature],
		});
		const parsedTx = parsedTxArray?.[0];

		if (!parsedTx) {
			console.warn(
				`[${LAUNCHPAD_NAME}] [${signature}] Helius SDK returned no data for this transaction.`,
			);
			return false;
		}

		// Log raw response for debugging (only for the first few calls if needed)
		// console.log(`[${LAUNCHPAD_NAME}] [${signature}] Raw Helius Response:`, JSON.stringify(parsedTx, null, 2));

		const timestamp = parsedTx.timestamp;
		const feePayer = new PublicKey(parsedTx.feePayer);

		for (const instruction of parsedTx.instructions) {
			if (instruction.programId === VIRTUALS_PROGRAM_ID.toString()) {
				try {
					const decodedData = bs58.decode(instruction.data);
					const dataBuffer = Buffer.from(decodedData);
					const decodedIx = instructionCoder.decode(dataBuffer);

					if (decodedIx?.name === "launch") {
						const args = decodedIx.data as LaunchInstructionData;
						const tokenMintAddressString = instruction.accounts[2];
						const creatorAddressString = instruction.accounts[0];

						if (!tokenMintAddressString || !creatorAddressString) {
							console.error(
								`[${LAUNCHPAD_NAME}] [${signature}] Missing mint or creator account in Helius instruction.`,
								instruction.accounts,
							);
							continue;
						}

						const tokenMint = new PublicKey(tokenMintAddressString);
						const creator = new PublicKey(creatorAddressString);

						const launchData: LaunchEventData = {
							tokenMint: tokenMint.toString(),
							name: args.name,
							symbol: args.symbol,
							uri: args.uri,
						};

						const parsedInfo: ParsedLaunchInfo = {
							launchData,
							creator,
							eventTimestamp: timestamp,
							txSignature: signature,
							// heliusTokenBalanceChanges removed
						};

						console.log(
							`[${LAUNCHPAD_NAME}] [${signature}] Found 'launch' instruction via Helius SDK. Parsed Info:`,
							JSON.stringify(parsedInfo, null, 2),
						);

						await processLaunchEvent(parsedInfo);
						return true; // Launch found and processed
					}
				} catch (decodeError) {
					if (
						decodeError instanceof Error &&
						!decodeError.message.includes("unknown instruction")
					) {
						console.warn(
							`[${LAUNCHPAD_NAME}] [${signature}] Error decoding instruction data:`,
							decodeError.message,
						);
					}
				}
			}
		}

		console.log(
			`[${LAUNCHPAD_NAME}] [${signature}] No 'launch' instruction found in this transaction.`,
		);
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] [${signature}] Error fetching or processing transaction via Helius SDK:`,
			error instanceof Error ? error.message : String(error),
		);
	}
	return false; // No launch instruction processed
}

// --- End Core Helius Transaction Processing ---

/**
 * Processes a launch event from the Solana Virtuals Protocol.
 */
async function processLaunchEvent(parsedInfo: ParsedLaunchInfo) {
	// Removed heliusTokenBalanceChanges from destructuring
	const { launchData, creator, eventTimestamp, txSignature } = parsedInfo;

	// Basic validation for event data
	if (!launchData.tokenMint || !launchData.name || !launchData.symbol) {
		console.warn(
			`[${txSignature}] Skipping incomplete Launch event: Missing required arguments.`,
			launchData,
		);
		return;
	}

	try {
		const tokenMintPubkey = new PublicKey(launchData.tokenMint);
		let decimals = SVM_DECIMALS; // Default

		try {
			const mintInfo = await getMint(getConnection(), tokenMintPubkey);
			decimals = mintInfo.decimals;
			console.log(`[${txSignature}] Got token decimals: ${decimals}`);
		} catch (error) {
			console.warn(
				`[${txSignature}] Error getting token mint info, using default decimals (${SVM_DECIMALS}):`,
				error,
			);
		}

		const TOTAL_SUPPLY = 1_000_000_000n; // Virtuals fixed supply
		const totalSupplyWithDecimals = TOTAL_SUPPLY * 10n ** BigInt(decimals);
		const isHistoricalEvent = Date.now() / 1000 - eventTimestamp > 600;

		// --- Determine Creator Initial Balance ---
		let creatorInitialBalanceRaw: bigint | null = null;

		// Removed attempt to use heliusTokenBalanceChanges

		// Fallback: Check standard getTransaction postTokenBalances
		if (creatorInitialBalanceRaw === null) {
			console.log(
				`[${txSignature}] Falling back to getTransaction for initial balance...`,
			);
			try {
				const tx = await getConnection().getTransaction(txSignature, {
					maxSupportedTransactionVersion: 0,
				});
				if (tx?.meta?.postTokenBalances) {
					for (const balance of tx.meta.postTokenBalances) {
						if (
							balance.owner === creator.toString() &&
							balance.mint === tokenMintPubkey.toString()
						) {
							creatorInitialBalanceRaw = BigInt(balance.uiTokenAmount.amount);
							console.log(
								`[${txSignature}] Found initial balance (raw) from getTransaction postTokenBalances: ${creatorInitialBalanceRaw}`,
							);
							break;
						}
					}
				}
				if (creatorInitialBalanceRaw === null) {
					console.log(
						`[${txSignature}] Creator balance not found in getTransaction postTokenBalances for mint ${tokenMintPubkey.toString()}.`,
					);
				}
			} catch (txError) {
				console.warn(
					`[${txSignature}] Error fetching transaction details for fallback balance check:`,
					txError,
				);
			}
		}

		// Final Fallback: Get current balance (least accurate for initial)
		if (creatorInitialBalanceRaw === null) {
			console.warn(
				`[${txSignature}] Could not determine initial balance from getTransaction. Falling back to current balance (less accurate).`,
			);
			try {
				creatorInitialBalanceRaw = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
				console.log(
					`[${txSignature}] Using current balance as initial balance (raw): ${creatorInitialBalanceRaw}`,
				);
			} catch (balanceError) {
				console.error(
					`[${txSignature}] Failed to get even current balance as fallback:`,
					balanceError,
				);
				creatorInitialBalanceRaw = 0n; // Assume 0 if all methods fail
			}
		}

		// Calculate rounded initial balance
		const creatorInitialBalanceRounded =
			creatorInitialBalanceRaw / 10n ** BigInt(decimals);

		// --- Get Current Balance (only if historical) ---
		let creatorCurrentBalanceRaw = creatorInitialBalanceRaw; // Default to initial
		if (isHistoricalEvent) {
			try {
				creatorCurrentBalanceRaw = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
				console.log(
					`[${txSignature}] Fetched current balance (raw) for historical event: ${creatorCurrentBalanceRaw}`,
				);
			} catch (error) {
				console.warn(
					`[${txSignature}] Error getting creator's current token balance for historical event:`,
					error,
				);
				// Keep initial raw balance as fallback
			}
		}
		const creatorCurrentBalanceRounded =
			creatorCurrentBalanceRaw / 10n ** BigInt(decimals);

		// --- Calculations and Formatting ---
		const displayInitialBalance = formatTokenBalance(
			creatorInitialBalanceRounded,
		);
		const displayCurrentBalance = formatTokenBalance(
			creatorCurrentBalanceRounded,
		);
		const totalSupplyRounded = TOTAL_SUPPLY; // Already rounded
		const allocationResult = calculateBigIntPercentage(
			creatorInitialBalanceRounded,
			totalSupplyRounded,
		);
		const formattedAllocation = allocationResult
			? allocationResult.formatted
			: "Error calculating"; // Removed redundant check
		const tokensForSaleCalc = totalSupplyRounded - creatorInitialBalanceRounded;
		const tokensForSaleBigInt = tokensForSaleCalc > 0n ? tokensForSaleCalc : 0n;
		const tokensForSaleString = tokensForSaleBigInt.toString();
		const launchedAtDate = new Date(eventTimestamp * 1000);

		// --- Fetch Additional Info ---
		let imageUrl = null;
		let virtualsTokenInfo = null;
		let virtualsInfoContent = "";
		let pairAddress = null;
		try {
			virtualsTokenInfo = await fetchVirtualsTokenInfo(launchData.tokenMint);
			if (virtualsTokenInfo) {
				imageUrl = virtualsTokenInfo.imageUrl || null;
				pairAddress = virtualsTokenInfo.pairAddress || null;
				virtualsInfoContent = formatVirtualsInfo(virtualsTokenInfo);
			}
		} catch (error) {
			console.warn(
				`[${txSignature}] Error getting Virtuals Protocol info: ${error}`,
			);
		}

		// --- Token Stats & Description ---
		const tokenStats = await updateSolanaTokenStatistics(
			getConnection(),
			tokenMintPubkey,
			creator,
			creatorInitialBalanceRounded.toString(), // Pass rounded string
			creatorCurrentBalanceRaw, // Pass raw lamports
		);

		const tokenUrl = `https://app.virtuals.io/prototypes/${launchData.tokenMint}`;
		const additionalContent = !tokenStats.sentToZeroAddress
			? await fetchAdditionalContent(
					virtualsInfoContent,
					creator.toString(),
					virtualsLinkGenerator,
				)
			: "";

		let creatorHoldingPercent = 100;
		if (
			isHistoricalEvent &&
			creatorCurrentBalanceRounded !== creatorInitialBalanceRounded
		) {
			const holdingResult = calculateBigIntPercentage(
				creatorCurrentBalanceRounded,
				creatorInitialBalanceRounded,
			);
			if (holdingResult) {
				creatorHoldingPercent = holdingResult.percent;
			}
		}

		let recentDevelopmentsText = "";
		if (tokenStats.sentToZeroAddress) {
			recentDevelopmentsText = `\n### Recent developments\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: unknown${
				tokenStats.creatorTokenMovementDetails
					? `\n${tokenStats.creatorTokenMovementDetails}`
					: ""
			}`;
		} else if (
			creatorCurrentBalanceRounded !== creatorInitialBalanceRounded &&
			isHistoricalEvent
		) {
			recentDevelopmentsText = `\n### Recent developments\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${displayCurrentBalance} (${Number(creatorHoldingPercent).toFixed(2)}% of initial allocation)${tokenStats.creatorTokenMovementDetails ? `\n${tokenStats.creatorTokenMovementDetails}` : ""}`;
		}

		const description = `
# ${launchData.name}
URL on launchpad: ${tokenUrl}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}
Launched in transaction: https://solscan.io/tx/${txSignature}

## Token details and tokenomics
Token address: ${launchData.tokenMint}
Token symbol: $${launchData.symbol}
Token supply: 1 billion
Top holders: https://solscan.io/token/${launchData.tokenMint}#holders
Liquidity contract: https://solscan.io/account/${pairAddress ?? "N/A"}#portfolio (the token graduates when this gets 42k $VIRTUAL)
Creator initial number of tokens: ${displayInitialBalance} (${formattedAllocation} of token supply)
${recentDevelopmentsText}
## Creator info
Creator address: ${creator.toString()}
Creator on solscan.io: https://solscan.io/account/${creator.toString()}
Creator on virtuals.io: https://app.virtuals.io/profile/${creator.toString()}
Creator on birdeye.so: https://birdeye.so/profile/${creator.toString()}

${virtualsInfoContent ? `${virtualsInfoContent}` : ""}${additionalContent ? `\n\n## Additional information extracted from relevant pages\n${additionalContent}` : ""}`.trim();

		// --- Database Insertion ---
		const dbLaunchData = {
			launchpad: LAUNCHPAD_NAME,
			title: `${launchData.name} ($${launchData.symbol})`,
			url: tokenUrl,
			creatorAddress: creator.toString(),
			tokenAddress: launchData.tokenMint,
			description,
			launchedAt: launchedAtDate,
			imageUrl,
			basicInfoUpdatedAt: new Date(),
			mainSellingAddress: launchData.tokenMint,
			totalTokenSupply: TOTAL_SUPPLY.toString(),
			creatorInitialTokensHeld: creatorInitialBalanceRounded.toString(),
			tokensForSale: tokensForSaleString,
			...tokenStats,
			sentToZeroAddress: tokenStats.sentToZeroAddress ?? false,
		};

		console.log(`[${txSignature}] Prepared launch data for DB insertion.`);

		await addLaunch(dbLaunchData);
		console.log(
			`[${txSignature}] Successfully added/updated launch for token: ${launchData.symbol}`,
		);
	} catch (error) {
		console.error(`[${txSignature}] Error processing Launch event:`, error);
	}
}

// Removed findLaunchInInstruction function as it's replaced by Helius SDK parsing

/**
 * Starts the WebSocket listener for program logs from the Virtuals Protocol program.
 */
export function startVirtualsSolanaListener(retryCount = 0) {
	console.log(
		`Attempting to start listener for ${LAUNCHPAD_NAME}... (retryCount=${retryCount})`,
	);

	// Get Helius client instance
	const heliusClient = getHeliusClient();

	try {
		// Clean up any existing listener before starting a new one
		if (activeListener !== null) {
			console.log(
				`[${LAUNCHPAD_NAME}] Cleaning up existing listener before restart.`,
			);
			const connection = getConnection();
			connection.removeOnLogsListener(activeListener);
			activeListener = null;
		}

		// Use getConnection for both HTTP and WebSocket subscriptions
		const connection = getConnection();

		// Set a more aggressive initial delay for the first connection to reduce likelihood of rate limits
		const initialConnectDelay =
			retryCount === 0 ? 5000 : Math.min(60000, 5000 * retryCount);
		if (retryCount > 0) {
			console.log(
				`[${LAUNCHPAD_NAME}] Applying initial delay of ${initialConnectDelay / 1000}s before starting listener...`,
			);
		}

		// Apply initial delay only if this is a retry
		setTimeout(
			() => {
				const subscriptionId = connection.onLogs(
					VIRTUALS_PROGRAM_ID,
					async (logs: SolanaLogInfo) => {
						let signature: string | undefined = undefined;
						try {
							signature = logs.signature;
							if (!signature) {
								console.error("[SVM Listener] No signature in logs");
								return;
							}

							// Process the signature using the new Helius SDK function
							console.log(
								`[${LAUNCHPAD_NAME}] [${signature}] Received signature via onLogs. Passing to Helius processor...`,
							);
							fetchAndProcessLaunchTransactionViaHelius(
								signature,
								heliusClient,
							).catch((error) => {
								console.error(
									`[${LAUNCHPAD_NAME}] [${signature}] Unhandled error processing transaction via Helius: ${error}`,
								);
							});
						} catch (error) {
							console.error(
								`[${LAUNCHPAD_NAME}] [${signature ?? "unknown"}] Error in log handler:`,
								error,
							);
							// Don't reconnect on every error, only if it's a critical connection issue
							if (
								error instanceof Error &&
								(error.message.includes("connection") ||
									error.message.includes("network"))
							) {
								// Clean up current listener before reconnecting
								if (activeListener !== null) {
									connection.removeOnLogsListener(activeListener);
									activeListener = null;
								}

								const delay =
									retryCount === 0 ? 5000 : Math.min(60000, 10000 * retryCount);
								console.log(
									`[${LAUNCHPAD_NAME}] Critical error - reconnecting Solana listener in ${delay / 1000}s...`,
								);
								setTimeout(() => {
									startVirtualsSolanaListener(retryCount + 1);
								}, delay);
							}
						}
					},
					"confirmed",
				);

				// Store the new active listener
				activeListener = subscriptionId;

				console.log(
					`[${LAUNCHPAD_NAME}] Listener started successfully (ID: ${subscriptionId}), watching program logs. Transactions will be processed via Helius SDK.`,
				);
			},
			retryCount === 0 ? 0 : initialConnectDelay,
		);
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Critical error: Failed to start event listener:`,
			error,
		);
		if (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof (error as { message?: unknown }).message === "string" &&
			(error as { message: string }).message.includes(
				"Endpoint URL must start with `http:` or `https:`",
			)
		) {
			console.error(
				`[${LAUNCHPAD_NAME}] Detected protocol mismatch: @solana/web3.js Connection requires http(s) endpoint, not wss. Check getConnection implementation.`,
			);
		}
		// --- Reconnection logic for setup errors ---
		const delay = retryCount === 0 ? 5000 : Math.min(60000, 10000 * retryCount);
		console.log(
			`[${LAUNCHPAD_NAME}] Attempting to reconnect Solana listener in ${delay / 1000}s after critical error...`,
		);
		setTimeout(() => {
			startVirtualsSolanaListener(retryCount + 1);
		}, delay);
	}
}

/**
 * Helper function to fetch signatures with retry logic
 */
async function fetchSignaturesWithRetry(
	connection: Connection,
	programId: PublicKey,
	options: {
		before?: string;
		until?: string;
		limit?: number;
	},
	retryCount = 0,
): Promise<ConfirmedSignatureInfo[]> {
	const MAX_RETRIES = 3;
	const RETRY_DELAY = 2000; // 2 seconds base delay

	try {
		return await connection.getSignaturesForAddress(
			programId,
			options,
			"confirmed",
		);
	} catch (error) {
		if (retryCount >= MAX_RETRIES) {
			throw error;
		}

		// Check if it's a long-term storage error
		if (
			error instanceof Error &&
			error.message.includes("Failed to query long-term storage")
		) {
			console.log(
				`Long-term storage error, reducing query window and retrying in ${RETRY_DELAY * (retryCount + 1)}ms...`,
			);
			// Reduce the limit to query less data
			options.limit = Math.floor((options.limit || 1000) / 2);
		}

		await new Promise((resolve) =>
			setTimeout(resolve, RETRY_DELAY * 2 ** retryCount),
		);
		return fetchSignaturesWithRetry(
			connection,
			programId,
			options,
			retryCount + 1,
		);
	}
}

/**
 * Fetches and processes historical launch events using paginated getSignatures + Helius SDK.
 */
export async function debugFetchHistoricalEvents(
	fromSlot: bigint,
	toSlot?: bigint,
	overwriteExisting = false,
) {
	console.log(
		`--- Debugging [VIRTUALS Protocol (Solana)]: Fetching signatures for program ${VIRTUALS_PROGRAM_ID} from slot ${fromSlot} to ${toSlot ?? "latest"} ---`,
	);

	// Add delay before starting historical fetch to ensure we're not rate limited
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const connection = getConnection();
	// Get Helius client instance for processing
	const heliusClient = getHeliusClient();
	let allSignatures: ConfirmedSignatureInfo[] = [];
	let lastSignature: string | undefined;
	const CHUNK_SIZE = 100; // Reduced from 1000 to handle RPC limitations better

	try {
		// Fetch signatures in chunks
		while (true) {
			const options = {
				limit: CHUNK_SIZE,
				before: lastSignature,
			};

			const signatures = await fetchSignaturesWithRetry(
				connection,
				new SolanaPublicKey(VIRTUALS_PROGRAM_ID),
				options,
			);

			if (signatures.length === 0) break;

			// Filter signatures by slot range
			const filteredChunk = signatures.filter((sig) => {
				const slot = sig.slot;
				if (!slot) return false;
				if (toSlot) {
					return slot >= Number(fromSlot) && slot <= Number(toSlot);
				}
				return slot >= Number(fromSlot);
			});

			// If we've gone past our fromSlot, we can stop
			const lastSig = signatures[signatures.length - 1];
			if (
				filteredChunk.length === 0 &&
				lastSig?.slot &&
				lastSig.slot < Number(fromSlot)
			) {
				break;
			}

			allSignatures = [...allSignatures, ...filteredChunk];
			if (lastSig) {
				lastSignature = lastSig.signature;
			}

			// Add a small delay between chunks to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		console.log(
			`Found ${allSignatures.length} unique successful signatures within slot range [${fromSlot}, ${toSlot ?? "latest"}].`,
		);

		console.log(`Processing ${allSignatures.length} unique signatures...`);

		let launchEventsFound = 0;

		// Process each signature with a delay between calls to avoid rate limiting
		const totalSignatures = allSignatures.length;
		for (let i = 0; i < totalSignatures; i++) {
			const signatureInfo = allSignatures[i];
			console.log(
				`[${LAUNCHPAD_NAME}] Processing historical signature ${i + 1} of ${totalSignatures}: ${signatureInfo?.signature}`,
			);

			// Skip if signatureInfo is undefined
			if (!signatureInfo) {
				console.warn(`Undefined signature info at index ${i}, skipping`);
				continue;
			}

			// Add delay between processing historical transactions (e.g., 1 second)
			// This helps respect potential free-tier limits if the SDK doesn't handle it.
			if (i > 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// Check if launch already exists and skip if not overwriting
			// We need to parse the transaction first to get the token mint
			// This check might need adjustment if parsing fails early
			let shouldProcess = true;
			if (!overwriteExisting) {
				// Temporarily parse to get token mint for the check
				// This adds overhead but ensures we respect overwriteExisting
				try {
					const tempParsedTxArray = await heliusClient.parseTransactions({
						transactions: [signatureInfo.signature],
					});
					const tempTx = tempParsedTxArray?.[0];
					if (tempTx) {
						for (const instruction of tempTx.instructions) {
							if (instruction.programId === VIRTUALS_PROGRAM_ID.toString()) {
								try {
									// Fix bs58 decoding here as well
									const decodedData = bs58.decode(instruction.data);
									const dataBuffer = Buffer.from(decodedData);
									const decodedIx = instructionCoder.decode(dataBuffer);
									if (decodedIx?.name === "launch") {
										const tokenMintAddressString = instruction.accounts[2];
										if (tokenMintAddressString) {
											const existingLaunch = await db.query.launches.findFirst({
												where: eq(
													launches.tokenAddress,
													tokenMintAddressString,
												),
											});
											if (existingLaunch) {
												console.log(
													`[${LAUNCHPAD_NAME}] [${signatureInfo.signature}] Launch already exists for token ${tokenMintAddressString}, skipping (overwrite=false)`,
												);
												shouldProcess = false;
												break; // Found launch, no need to check other instructions
											}
										}
									}
								} catch (decodeError) {
									// Ignore decode errors during this pre-check
								}
							}
						}
					}
				} catch (preCheckError) {
					console.warn(
						`[${LAUNCHPAD_NAME}] [${signatureInfo.signature}] Error during pre-check for existing launch:`,
						preCheckError,
					);
					// Continue processing if pre-check fails, might process duplicates if overwriteExisting is false
				}
			}

			if (shouldProcess) {
				// Call fetchAndProcess... and check the boolean return value
				const foundLaunch = await fetchAndProcessLaunchTransactionViaHelius(
					signatureInfo.signature,
					heliusClient,
				);
				if (foundLaunch) {
					launchEventsFound++;
				}
			}
		}

		console.log(
			`--- Debugging [VIRTUALS Protocol (Solana)]: Finished processing. Processed ${allSignatures.length} unique signatures, Found ${launchEventsFound} launch events. ---`,
		);

		// Start real-time listener after debug completion, with a small delay
		console.log(
			"Starting real-time listener for VIRTUALS Protocol (Solana) after debug completion",
		);
		setTimeout(() => {
			startVirtualsSolanaListener();
		}, 3000);
	} catch (error) {
		console.error(
			"--- Debugging [VIRTUALS Protocol (Solana)]: Error processing historical events:",
			error,
		);
	}
}
// How to run: Set DEBUG_VIRTUALS_SOLANA=true and optionally DEBUG_SLOT_FROM/DEBUG_SLOT_TO
