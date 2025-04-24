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
} from "@solana/web3.js";
import { PublicKey as SolanaPublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
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
import { getConnection } from "~/server/lib/svm-client";
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
}

// Define the launch instruction data structure
interface LaunchInstructionData {
	symbol: string;
	name: string;
	uri: string;
}

// Define types for the expected Helius API response structure
interface HeliusInstruction {
	accounts: string[]; // Array of Pubkey strings
	data: string; // Base64 encoded data
	programId: string; // Pubkey string
}

interface HeliusParsedTransaction {
	signature: string;
	timestamp: number; // Unix timestamp
	fee: number;
	feePayer: string; // Pubkey string
	slot?: number;
	instructions: HeliusInstruction[];
	// We only care about these fields for our purpose
}

// Constant string identifying the launchpad for database storage and display purposes
const LAUNCHPAD_NAME = "VIRTUALS Protocol (Solana)";

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
	// Initial delay between API calls in milliseconds (5 seconds)
	initialDelay: 5000,
	// Maximum delay between API calls (30 seconds)
	maxDelay: 30000,
	// Backoff factor for exponential backoff
	backoffFactor: 1.5,
	// Number of retries before giving up
	maxRetries: 5,
	// In-memory transaction queue to process
	pendingTransactions: new Map<
		string,
		{ signature: string; attempts: number; nextRetryTime: number }
	>(),
	// Last API call timestamp
	lastApiCallTime: 0,
};

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

/**
 * Processes a launch event from the Solana Virtuals Protocol.
 */
async function processLaunchEvent(parsedInfo: ParsedLaunchInfo) {
	const { launchData, creator, eventTimestamp, txSignature } = parsedInfo;

	// console.log(`Processing Launch event from signature ${txSignature}`);
	// console.log("Parsed launch data:", JSON.stringify(launchData, null, 2));

	// Basic validation for event data
	if (!launchData.tokenMint || !launchData.name || !launchData.symbol) {
		console.warn(
			`[${txSignature}] Skipping incomplete Launch event: Missing required arguments.`,
			launchData,
		);
		return;
	}

	try {
		// Set up token monitoring
		const tokenMintPubkey = new PublicKey(launchData.tokenMint);
		// console.log(`Token mint address: ${tokenMintPubkey.toString()}`);
		// console.log(`Creator address: ${creator.toString()}`);

		// For Virtuals Protocol, the token supply is fixed at 1 billion
		const TOTAL_SUPPLY = 1_000_000_000n;
		let decimals = SVM_DECIMALS; // Use constant as default

		// Try to get token decimals from mint info
		try {
			const mintInfo = await getMint(getConnection(), tokenMintPubkey);
			decimals = mintInfo.decimals;
			console.log(`Got token decimals: ${decimals}`);
		} catch (error) {
			console.warn("Error getting token mint info:", error);
			console.log("Using default decimals value: 9");
		}

		// The total supply is fixed at 1 billion on this launchpad
		const totalSupplyWithDecimals = TOTAL_SUPPLY * 10n ** BigInt(decimals);

		// Determine if this is a historical event by checking block timestamps
		// We consider it historical if the event timestamp is more than 10 minutes old
		const isHistoricalEvent = Date.now() / 1000 - eventTimestamp > 600;
		console.log(`Is historical event: ${isHistoricalEvent}`);

		// First get initial balance at event time
		let creatorInitialBalance = 0n;
		try {
			// Get transaction details to examine token balances
			const tx = await getConnection().getTransaction(txSignature, {
				maxSupportedTransactionVersion: 0,
			});

			// Check post-transaction token balances
			if (tx?.meta?.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
				// Look for the creator's balance in postTokenBalances
				for (const balance of tx.meta.postTokenBalances) {
					if (
						balance.owner === creator.toString() &&
						balance.mint === tokenMintPubkey.toString()
					) {
						// Found the creator's token balance right after the transaction
						const rawAmount = balance.uiTokenAmount.amount;
						const preBalanceBigInt = BigInt(rawAmount);
						const divisor = 10n ** BigInt(decimals);
						const preBalanceRounded = preBalanceBigInt / divisor;
						const postBalanceRounded = preBalanceBigInt / divisor;
						creatorInitialBalance = preBalanceRounded; // Store rounded initial balance
						console.log(
							`Found initial balance (rounded) directly in transaction: ${preBalanceRounded}`,
						);
						break;
					}
				}
			}

			// If we still don't have a balance, try getting current balance as last resort
			if (creatorInitialBalance === 0n) {
				console.log(
					"No balance found in transaction, getting current balance and rounding...",
				);
				const rawCurrentBalance = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
				// Round the fetched balance
				creatorInitialBalance = rawCurrentBalance / 10n ** BigInt(decimals);
			}

			console.log(
				`Creator initial balance (rounded): ${creatorInitialBalance.toString()}`,
			);
		} catch (error) {
			console.warn("Error getting creator's initial token balance:", error);
			// Still try to get current balance
			creatorInitialBalance = await getSolanaTokenBalance(
				getConnection(),
				tokenMintPubkey,
				creator,
			);
		}

		// Then get current balance for historical events
		let creatorCurrentBalanceRaw =
			creatorInitialBalance * 10n ** BigInt(decimals); // Default to initial raw balance
		if (isHistoricalEvent) {
			try {
				// For historical events, get the current raw balance
				creatorCurrentBalanceRaw = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
				console.log(
					`Creator current balance (raw): ${creatorCurrentBalanceRaw.toString()}`,
				);
			} catch (error) {
				console.warn("Error getting creator's current token balance:", error);
				// Keep initial raw balance as fallback
			}
		}

		// Calculate rounded current balance
		const creatorCurrentBalanceRounded =
			creatorCurrentBalanceRaw / 10n ** BigInt(decimals);

		// Format token balances for display using the rounded values
		const displayInitialBalance = formatTokenBalance(creatorInitialBalance);
		const displayCurrentBalance = formatTokenBalance(
			creatorCurrentBalanceRounded,
		);

		console.log(`Display initial balance: ${displayInitialBalance}`);

		// Calculate initial creator allocation percentage using rounded initial balance
		const totalSupplyRounded = TOTAL_SUPPLY; // Already rounded
		const allocationResult = calculateBigIntPercentage(
			creatorInitialBalance,
			totalSupplyRounded,
		);

		let formattedAllocation = "N/A";
		if (allocationResult) {
			formattedAllocation = allocationResult.formatted;
			console.log(`Creator allocation: ${formattedAllocation}`);
		} else if (totalSupplyWithDecimals === 0n) {
			formattedAllocation = "0.00%";
		} else {
			formattedAllocation = "Error calculating";
		}

		// Calculate tokens for sale (Total Supply - Creator Initial Balance, both rounded)
		const tokensForSaleCalc = totalSupplyRounded - creatorInitialBalance;
		const tokensForSaleBigInt = tokensForSaleCalc > 0n ? tokensForSaleCalc : 0n;
		const tokensForSaleString = tokensForSaleBigInt.toString();
		console.log(`Tokens for sale (rounded): ${tokensForSaleString}`);

		// Convert the timestamp to a JavaScript Date object
		const launchedAtDate = new Date(eventTimestamp * 1000);
		console.log(`Launched at: ${launchedAtDate.toISOString()}`);

		// Try to get image URL from the token URI
		let imageUrl = null;

		// Try to fetch additional information from the Virtuals Protocol API
		let virtualsTokenInfo = null;
		let virtualsInfoContent = "";
		let pairAddress = null;

		try {
			// Attempt to fetch Virtuals Protocol info using the token mint address
			virtualsTokenInfo = await fetchVirtualsTokenInfo(launchData.tokenMint);

			if (virtualsTokenInfo) {
				console.log(
					`Found Virtuals Protocol info for token: ${launchData.tokenMint}`,
				);

				// If we didn't get an image URL from the token URI, use the one from Virtuals API
				if (!imageUrl && virtualsTokenInfo.imageUrl) {
					imageUrl = virtualsTokenInfo.imageUrl;
					console.log(`Using image URL from Virtuals API: ${imageUrl}`);
				}

				// Store pair address for use in description
				if (virtualsTokenInfo.pairAddress) {
					pairAddress = virtualsTokenInfo.pairAddress;
					console.log(`Found pair address: ${pairAddress}`);
				}

				// Format the Virtuals Protocol information
				virtualsInfoContent = formatVirtualsInfo({
					description: virtualsTokenInfo.description,
					socials: virtualsTokenInfo.socials,
					creator: virtualsTokenInfo.creator,
					name: virtualsTokenInfo.name,
					symbol: virtualsTokenInfo.symbol,
					imageUrl: virtualsTokenInfo.imageUrl,
					pairAddress: virtualsTokenInfo.pairAddress,
					chain: virtualsTokenInfo.chain,
				});
			}
		} catch (error) {
			console.warn(`Error getting Virtuals Protocol info: ${error}`);
		}

		// Get token statistics
		const formattedInitialBalanceString = creatorInitialBalance.toString();

		// Calculate what percentage of their initial balance the creator still holds
		// Only calculate for historical events where current balance differs from initial
		let creatorHoldingPercent = 100;
		if (
			isHistoricalEvent &&
			creatorCurrentBalanceRounded !== creatorInitialBalance
		) {
			// Use rounded values for percentage calculation
			const holdingResult = calculateBigIntPercentage(
				creatorCurrentBalanceRounded,
				creatorInitialBalance,
			);
			if (holdingResult) {
				creatorHoldingPercent = holdingResult.percent;
			}
		}

		const tokenStats = await updateSolanaTokenStatistics(
			getConnection(),
			tokenMintPubkey,
			creator,
			formattedInitialBalanceString, // Pass rounded string
			creatorCurrentBalanceRaw, // Pass raw lamports
		);

		// Build launchpad URL
		const tokenUrl = `https://app.virtuals.io/prototypes/${launchData.tokenMint}`;
		console.log(`Token URL: ${tokenUrl}`);

		// Fetch additional content if no token sales detected
		const hasSoldTokens =
			tokenStats.creatorTokenMovementDetails?.includes("Sold ");
		const additionalContent = !tokenStats.sentToZeroAddress
			? await fetchAdditionalContent(
					virtualsInfoContent,
					creator.toString(),
					virtualsLinkGenerator,
				)
			: "";

		// Determine the display text for recent developments
		let recentDevelopmentsText = "";
		if (tokenStats.sentToZeroAddress) {
			recentDevelopmentsText = `\n### Recent developments\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: unknown${
				tokenStats.creatorTokenMovementDetails
					? `\n${tokenStats.creatorTokenMovementDetails}`
					: ""
			}`;
		} else if (
			creatorCurrentBalanceRounded !== creatorInitialBalance &&
			isHistoricalEvent
		) {
			// Use the rounded current balance from tokenStats for display
			const displayRoundedCurrent = formatTokenBalance(
				tokenStats.creatorTokensHeld,
			);
			recentDevelopmentsText = `\n### Recent developments\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${displayRoundedCurrent} (${Number(creatorHoldingPercent).toFixed(2)}% of initial allocation)${tokenStats.creatorTokenMovementDetails ? `\n${tokenStats.creatorTokenMovementDetails}` : ""}`;
		}

		// --- Construct Comprehensive Description ---
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
Liquidity contract: https://solscan.io/account/${pairAddress}#portfolio (the token graduates when this gets 42k $VIRTUAL)
Creator initial number of tokens: ${displayInitialBalance} (${formattedAllocation} of token supply)
${recentDevelopmentsText}
## Creator info
Creator address: ${creator.toString()}
Creator on solscan.io: https://solscan.io/account/${creator.toString()}
Creator on virtuals.io: https://app.virtuals.io/profile/${creator.toString()}
Creator on birdeye.so: https://birdeye.so/profile/${creator.toString()}

${virtualsInfoContent ? `${virtualsInfoContent}` : ""}${additionalContent ? `\n\n## Additional information extracted from relevant pages\n${additionalContent}` : ""}`.trim();

		// Prepare the data object for database insertion
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
			mainSellingAddress: launchData.tokenMint, // Use token mint as the selling address equivalent
			totalTokenSupply: TOTAL_SUPPLY.toString(), // Store rounded total supply
			creatorInitialTokensHeld: formattedInitialBalanceString, // Store rounded initial balance
			tokensForSale: tokensForSaleString, // Store rounded tokens for sale
			...tokenStats, // Include token stats (already rounded strings)
			sentToZeroAddress: tokenStats.sentToZeroAddress ?? false,
		};

		console.log(
			`[${launchData.tokenMint}] Prepared launch data for DB insertion:`,
			JSON.stringify(
				{
					launchpad: dbLaunchData.launchpad,
					title: dbLaunchData.title,
					url: dbLaunchData.url,
					tokenAddress: dbLaunchData.tokenAddress,
					totalTokenSupply: dbLaunchData.totalTokenSupply, // Log rounded
					creatorInitialTokensHeld: dbLaunchData.creatorInitialTokensHeld, // Log rounded
					tokensForSale: dbLaunchData.tokensForSale, // Log rounded
				},
				null,
				2,
			),
		);

		// Add the launch to the database
		await addLaunch(dbLaunchData);
		console.log(
			`[${launchData.tokenMint}] Called addLaunch for token: ${launchData.symbol}`,
		);
	} catch (error) {
		console.error(
			`[${launchData.tokenMint}] Error processing Launch event in tx ${txSignature}:`,
			error,
		);
	}
}

/**
 * Parses a single instruction to find a 'launch' event.
 */
function findLaunchInInstruction(
	instruction: Readonly<{
		programIdIndex: number;
		accounts?: readonly number[];
		accountKeyIndexes?: readonly number[];
		data: string | Uint8Array;
	}>,
	message: Message | VersionedMessage,
	accountKeys: ReturnType<VersionedMessage["getAccountKeys"]>,
	signature: string,
	slot: number | null,
): ParsedLaunchInfo | null {
	// Ensure accountKeys is resolved
	if (!accountKeys) return null;

	const programIdIndex = instruction.programIdIndex;
	// Add check for index validity
	if (
		typeof programIdIndex !== "number" ||
		programIdIndex < 0 ||
		programIdIndex >= accountKeys.length
	) {
		console.warn(`Invalid programIdIndex ${programIdIndex} in instruction.`);
		return null;
	}
	const programId = accountKeys.get(programIdIndex);

	if (programId?.equals(VIRTUALS_PROGRAM_ID)) {
		try {
			const dataBuffer = Buffer.from(instruction.data as Uint8Array);
			const decodedIx = instructionCoder.decode(dataBuffer);

			if (decodedIx?.name === "launch") {
				const args = decodedIx.data as LaunchInstructionData;

				// Safely get account indexes
				let accountsIndexes: readonly number[] | undefined;
				if ("accounts" in instruction && instruction.accounts) {
					accountsIndexes = instruction.accounts as number[];
				} else if (
					"accountKeyIndexes" in instruction &&
					instruction.accountKeyIndexes
				) {
					accountsIndexes = instruction.accountKeyIndexes;
				}

				if (!accountsIndexes) {
					console.warn(
						"Could not find account indexes for 'launch' instruction.",
					);
					return null;
				}

				const tokenMintAccIndex = accountsIndexes[2];
				if (
					typeof tokenMintAccIndex !== "number" ||
					tokenMintAccIndex < 0 ||
					tokenMintAccIndex >= accountKeys.length
				) {
					console.warn(
						"Invalid token mint account index for 'launch' instruction.",
					);
					return null;
				}
				const tokenMintAddress = accountKeys.get(tokenMintAccIndex);

				if (!tokenMintAddress) {
					console.warn("Could not get token mint PublicKey.");
					return null;
				}

				const creator = accountKeys.get(0);
				if (!creator) {
					console.warn("Could not get creator (fee payer).");
					return null;
				}

				const launchData: LaunchEventData = {
					tokenMint: tokenMintAddress.toString(),
					name: args.name,
					symbol: args.symbol,
					uri: args.uri,
				};

				// Get current timestamp if this is a historical event
				const currentTimestamp = Math.floor(Date.now() / 1000);

				return {
					launchData,
					creator,
					eventTimestamp: currentTimestamp,
					txSignature: signature,
				};
			}
		} catch (error) {
			console.warn("Error decoding instruction:", error);
		}
	}
	return null;
}

/**
 * Helper function to fetch transaction details from Helius with rate limiting and retries
 */
async function fetchTransactionFromHelius(
	signature: string,
	retryCount = 0,
): Promise<HeliusParsedTransaction | null> {
	const now = Date.now();
	const timeSinceLastCall = now - RATE_LIMIT_CONFIG.lastApiCallTime;

	// Ensure we're respecting rate limits
	if (
		timeSinceLastCall < RATE_LIMIT_CONFIG.initialDelay &&
		RATE_LIMIT_CONFIG.lastApiCallTime > 0
	) {
		const waitTime = RATE_LIMIT_CONFIG.initialDelay - timeSinceLastCall;
		console.log(
			`[${signature}] Rate limiting - waiting ${waitTime}ms before next Helius API call`,
		);
		await new Promise((resolve) => setTimeout(resolve, waitTime));
	}

	RATE_LIMIT_CONFIG.lastApiCallTime = Date.now();

	const HELIUS_API_KEY = env.HELIUS_API_KEY;
	if (!HELIUS_API_KEY) {
		console.error(
			`[${signature}] HELIUS_API_KEY not set, cannot parse event via Helius.`,
		);
		return null;
	}

	const url = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;
	console.log(
		`[${signature}] Processing event using Helius single tx endpoint...`,
	);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ transactions: [signature] }),
		});

		if (!response.ok) {
			// Handle rate limiting specifically
			if (response.status === 429) {
				if (retryCount >= RATE_LIMIT_CONFIG.maxRetries) {
					console.error(
						`[${signature}] Exceeded maximum retries (${RATE_LIMIT_CONFIG.maxRetries}) for Helius API call.`,
					);
					return null;
				}

				// Calculate exponential backoff delay
				const delay = Math.min(
					RATE_LIMIT_CONFIG.maxDelay,
					RATE_LIMIT_CONFIG.initialDelay *
						RATE_LIMIT_CONFIG.backoffFactor ** retryCount,
				);

				console.log(
					`[${signature}] Helius API rate limited (429). Retrying after ${delay}ms delay (attempt ${retryCount + 1}/${RATE_LIMIT_CONFIG.maxRetries})...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));

				// Try again with increased retry count
				return fetchTransactionFromHelius(signature, retryCount + 1);
			}

			// Handle other errors
			const errorText = await response.text();
			throw new Error(
				`Helius API request failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		const txDetails: HeliusParsedTransaction[] = await response.json();
		return txDetails[0] || null;
	} catch (error) {
		if (retryCount < RATE_LIMIT_CONFIG.maxRetries) {
			const delay = Math.min(
				RATE_LIMIT_CONFIG.maxDelay,
				RATE_LIMIT_CONFIG.initialDelay *
					RATE_LIMIT_CONFIG.backoffFactor ** retryCount,
			);

			console.log(
				`[${signature}] Error fetching from Helius: ${error instanceof Error ? error.message : String(error)}. Retrying after ${delay}ms delay (attempt ${retryCount + 1}/${RATE_LIMIT_CONFIG.maxRetries})...`,
			);
			await new Promise((resolve) => setTimeout(resolve, delay));

			return fetchTransactionFromHelius(signature, retryCount + 1);
		}

		console.error(
			`[${signature}] Failed to fetch transaction after ${RATE_LIMIT_CONFIG.maxRetries} attempts:`,
			error,
		);
		return null;
	}
}

/**
 * Process a single transaction signature by checking the pending queue
 */
async function processTransactionSignature(signature: string) {
	try {
		// Fetch transaction details with retries and rate limiting
		const tx = await fetchTransactionFromHelius(signature);

		if (!tx) {
			console.warn(
				`[${signature}] Helius did not return details for this transaction.`,
			);
			return;
		}

		// Parse the transaction for launch events
		let parsedInfo: ParsedLaunchInfo | null = null;
		try {
			const creator = new PublicKey(tx.feePayer);
			const eventTimestamp = tx.timestamp;

			for (const instruction of tx.instructions) {
				if (instruction.programId === VIRTUALS_PROGRAM_ID.toString()) {
					try {
						const dataBuffer = Buffer.from(instruction.data, "base64");
						// Add detailed logging
						console.log(
							`[${tx.signature}] Attempting to decode Helius instruction:`,
							"\nBuffer length:",
							dataBuffer.length,
							"\nInstructionCoder type:",
							typeof instructionCoder,
							"\nInstructionCoder methods:",
							Object.getOwnPropertyNames(
								Object.getPrototypeOf(instructionCoder),
							),
							"\nIDL instructions:",
							IDL.instructions.map((ix) => ix.name),
						);

						const decodedIx = instructionCoder.decode(dataBuffer);

						// Log successful decode
						console.log(
							`[${tx.signature}] Successfully decoded Helius instruction:`,
							"\nName:",
							decodedIx?.name,
							"\nData:",
							decodedIx?.data,
						);

						if (decodedIx?.name === "launch") {
							const args = decodedIx.data as {
								symbol: string;
								name: string;
								uri: string;
							};
							const tokenMintAddress = instruction.accounts[2];
							if (!tokenMintAddress) {
								console.error(
									`[${tx.signature}] Could not find token mint account in Helius instruction`,
								);
								continue;
							}

							const launchData: LaunchEventData = {
								tokenMint: tokenMintAddress,
								name: args.name,
								symbol: args.symbol,
								uri: args.uri,
							};
							console.log(
								`[${tx.signature}] Found launch via Helius: ${args.name} (${args.symbol})`,
							);
							parsedInfo = {
								launchData,
								creator,
								eventTimestamp,
								txSignature: signature,
							};
							break;
						}
					} catch (decodeError) {
						if (
							decodeError instanceof Error &&
							!decodeError.message.includes("unknown instruction")
						) {
							console.warn(
								`[${tx.signature}] Error decoding instruction:`,
								decodeError.message,
							);
						}
					}
				}
			}
		} catch (parseError) {
			console.error(
				`[${tx.signature}] Error parsing Helius transaction:`,
				parseError,
			);
		}

		if (parsedInfo) {
			await processLaunchEvent(parsedInfo);
		}
	} catch (error) {
		console.error(`[${signature}] Error processing transaction:`, error);
	}
}

/**
 * Starts the WebSocket listener for program logs from the Virtuals Protocol program.
 */
export function startVirtualsSolanaListener(retryCount = 0) {
	console.log(
		`Attempting to start listener for ${LAUNCHPAD_NAME}... (retryCount=${retryCount})`,
	);

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

							// Add to processing queue rather than processing immediately
							processTransactionSignature(signature).catch((error) => {
								console.error(
									`[${signature}] Unhandled error processing transaction: ${error}`,
								);
							});
						} catch (error) {
							console.error(
								`[${signature ?? "unknown"}] Error in log handler:`,
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
					`[${LAUNCHPAD_NAME}] Listener started successfully (ID: ${subscriptionId}), watching program logs and using Helius for parsing.`,
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
 * Fetches and processes historical launch events using paginated getSignatures + getTransaction + inner ix parsing.
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
		for (let i = 0; i < allSignatures.length; i++) {
			const signatureInfo = allSignatures[i];

			// Skip if signatureInfo is undefined
			if (!signatureInfo) {
				console.warn(`Undefined signature info at index ${i}, skipping`);
				continue;
			}

			// Add delay between transactions to avoid rate limiting
			if (i > 0) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			try {
				const tx = await connection.getTransaction(signatureInfo.signature, {
					maxSupportedTransactionVersion: 0,
				});

				if (!tx) {
					console.log(
						`[${signatureInfo.signature}] Transaction not found (Slot: ${signatureInfo.slot})`,
					);
					continue;
				}

				// Process the transaction
				const message = tx.transaction.message;
				const accountKeys = message.getAccountKeys({
					accountKeysFromLookups: tx.meta?.loadedAddresses,
				});

				if (!accountKeys) {
					console.error(
						`[${signatureInfo.signature}] Failed to resolve account keys (Slot: ${signatureInfo.slot}).`,
					);
					continue;
				}

				let launchInfo: ParsedLaunchInfo | null = null;

				// 1. Check top-level instructions
				for (const instruction of message.compiledInstructions) {
					launchInfo = findLaunchInInstruction(
						instruction,
						message,
						accountKeys,
						signatureInfo.signature,
						signatureInfo.slot,
					);
					if (launchInfo) break;
				}

				// 2. Check inner instructions if not found in top-level
				if (!launchInfo && tx.meta?.innerInstructions) {
					for (const innerIxSet of tx.meta.innerInstructions) {
						for (const instruction of innerIxSet.instructions) {
							launchInfo = findLaunchInInstruction(
								instruction,
								message,
								accountKeys,
								signatureInfo.signature,
								signatureInfo.slot,
							);
							if (launchInfo) break;
						}
						if (launchInfo) break;
					}
				}

				if (!launchInfo) {
					console.log(
						`[${signatureInfo.signature}] No launch instruction found (Slot: ${signatureInfo.slot})`,
					);
					continue;
				}

				// Get the actual timestamp from the transaction if available
				if (tx.blockTime) {
					// BlockTime is in seconds, which is what we want
					launchInfo.eventTimestamp = tx.blockTime;
					console.log(
						`Using actual blockTime for historical event: ${new Date(tx.blockTime * 1000).toISOString()}`,
					);
				}

				// Check if launch already exists and we're not overwriting
				if (!overwriteExisting) {
					const existingLaunch = await db.query.launches.findFirst({
						where: eq(launches.tokenAddress, launchInfo.launchData.tokenMint),
					});

					if (existingLaunch) {
						console.log(
							`[${signatureInfo.signature}] Launch already exists for token ${launchInfo.launchData.tokenMint}, skipping (overwrite=false)`,
						);
						continue;
					}
				}

				// Process the launch event
				await processLaunchEvent(launchInfo);
				launchEventsFound++;
			} catch (error) {
				console.log(
					`[${signatureInfo.signature}] Error decoding instruction data (Slot: ${signatureInfo.slot}): ${error instanceof Error ? error.message : String(error)}`,
				);
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
