import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type {
	CompiledInstruction,
	LoadedAddresses,
	Message,
	MessageCompiledInstruction,
	VersionedMessage,
	// Need these types for getTransaction response
	VersionedTransactionResponse,
} from "@solana/web3.js";
import { env } from "~/env";
import type { LaunchpadLinkGenerator } from "~/lib/content-utils";
import { calculateBigIntPercentage, formatTokenBalance } from "~/lib/utils";
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

// --- Logging IDL during import ---
console.log(
	"--- virtuals-solana.ts: Checking IDL import ---",
	typeof IDL === "object" && IDL !== null
		? "IDL object loaded"
		: "IDL is NOT loaded correctly",
	IDL?.version ? `Version: ${IDL.version}` : "",
);
// --- End Logging ---

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

// Create the instruction coder using the imported IDL
const instructionCoder = new BorshInstructionCoder(IDL);

// --- Logging instructionCoder after initialization ---
console.log(
	"--- virtuals-solana.ts: Checking instructionCoder init ---",
	typeof instructionCoder === "object" && instructionCoder !== null
		? "instructionCoder initialized"
		: "instructionCoder FAILED initialization",
	instructionCoder?.constructor?.name ?? "N/A", // Log constructor name
);
// --- End Logging ---

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
		let decimals = 9; // Default decimals for Solana SPL tokens

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
						creatorInitialBalance = BigInt(rawAmount);
						console.log(
							`Found initial balance directly in transaction: ${rawAmount} (${balance.uiTokenAmount.uiAmount} ${balance.uiTokenAmount.uiAmountString})`,
						);
						break;
					}
				}
			}

			// If we still don't have a balance, try getting current balance as last resort
			if (creatorInitialBalance === 0n) {
				console.log("No balance found in transaction, using current balance");
				creatorInitialBalance = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
			}

			console.log(
				`Creator initial balance: ${creatorInitialBalance.toString()}`,
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
		let creatorCurrentBalance = creatorInitialBalance; // Default to initial for new launches
		if (isHistoricalEvent) {
			try {
				// For historical events, get the current balance
				creatorCurrentBalance = await getSolanaTokenBalance(
					getConnection(),
					tokenMintPubkey,
					creator,
				);
				console.log(
					`Creator current balance: ${creatorCurrentBalance.toString()}`,
				);
			} catch (error) {
				console.warn("Error getting creator's current token balance:", error);
				// Keep initial balance as fallback
			}
		}

		// Format token balances for display
		const displayInitialBalance = formatTokenBalance(
			creatorInitialBalance,
			decimals,
		);
		const displayCurrentBalance = formatTokenBalance(
			creatorCurrentBalance,
			decimals,
		);

		console.log(`Display initial balance: ${displayInitialBalance}`);

		// Calculate initial creator allocation percentage
		const allocationResult = calculateBigIntPercentage(
			creatorInitialBalance,
			totalSupplyWithDecimals,
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

		// Calculate tokens for sale (Total Supply - Creator Initial Balance)
		const tokensForSaleCalc = totalSupplyWithDecimals - creatorInitialBalance;
		const tokensForSaleBigInt = tokensForSaleCalc > 0n ? tokensForSaleCalc : 0n;
		const tokensForSaleString = tokensForSaleBigInt.toString();
		console.log(`Tokens for sale: ${tokensForSaleString}`);

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
		const formattedInitialBalance = formatTokenBalance(
			creatorInitialBalance,
			decimals,
		).replace(/,/g, "");

		// Calculate what percentage of their initial balance the creator still holds
		// Only calculate for historical events where current balance differs from initial
		let creatorHoldingPercent = 0;
		if (isHistoricalEvent && creatorCurrentBalance !== creatorInitialBalance) {
			const holdingResult = calculateBigIntPercentage(
				creatorCurrentBalance,
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
			formattedInitialBalance,
			creatorCurrentBalance,
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
			creatorCurrentBalance !== creatorInitialBalance &&
			isHistoricalEvent
		) {
			recentDevelopmentsText = `\n### Recent developments\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${displayCurrentBalance} (${Number(creatorHoldingPercent).toFixed(2)}% of initial allocation)${
				tokenStats.creatorTokenMovementDetails
					? `\n${tokenStats.creatorTokenMovementDetails}`
					: ""
			}`;
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
			totalTokenSupply: TOTAL_SUPPLY.toString(),
			creatorInitialTokensHeld: creatorInitialBalance.toString(),
			tokensForSale: tokensForSaleString,
			...tokenStats, // Include token stats like holding percentage
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
					totalTokenSupply: dbLaunchData.totalTokenSupply,
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
	// Type instruction more generically, let caller handle specifics
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

	// --- Add check inside function ---
	if (!instructionCoder) {
		console.error(
			`[${signature}] FATAL: instructionCoder is undefined inside findLaunchInInstruction! (Slot: ${slot ?? "N/A"})`,
		);
		return null; // Cannot proceed
	}
	// --- End check ---

	const programIdIndex = instruction.programIdIndex;
	// Add check for index validity
	if (
		typeof programIdIndex !== "number" ||
		programIdIndex < 0 ||
		programIdIndex >= accountKeys.length
	) {
		console.error(
			`[${signature}] Invalid programIdIndex ${programIdIndex} in instruction.`,
		);
		return null;
	}
	const programId = accountKeys.get(programIdIndex);

	if (programId?.equals(VIRTUALS_PROGRAM_ID)) {
		try {
			const dataBuffer = Buffer.from(instruction.data as Uint8Array);
			// Now decode using the checked instructionCoder
			const decodedIx = instructionCoder.decode(dataBuffer);

			if (decodedIx?.name === "launch") {
				const args = decodedIx.data as {
					symbol: string;
					name: string;
					uri: string;
				};

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
					console.error(
						`[${signature}] Could not find account indexes for 'launch' instruction.`,
					);
					return null;
				}

				const tokenMintAccIndex = accountsIndexes[2];
				if (
					typeof tokenMintAccIndex !== "number" ||
					tokenMintAccIndex < 0 ||
					tokenMintAccIndex >= accountKeys.length
				) {
					console.error(
						`[${signature}] Invalid token mint account index ${tokenMintAccIndex} for 'launch' instruction.`,
					);
					return null;
				}
				const tokenMintAddress = accountKeys.get(tokenMintAccIndex);

				if (!tokenMintAddress) {
					console.error(
						`[${signature}] Could not get token mint PublicKey using index ${tokenMintAccIndex}.`,
					);
					return null;
				}

				const creator = accountKeys.get(0);
				if (!creator) {
					console.error(`[${signature}] Could not get creator (fee payer).`);
					return null;
				}

				const launchData: LaunchEventData = {
					tokenMint: tokenMintAddress.toString(),
					name: args.name,
					symbol: args.symbol,
					uri: args.uri,
				};

				console.log(
					`[${signature}] Found 'launch' via Instruction Parsing in Slot ${slot ?? "N/A"}: ${args.name} (${args.symbol}) Token: ${tokenMintAddress.toString()}`,
				);

				return {
					launchData,
					creator,
					eventTimestamp: 0,
					txSignature: signature,
				};
			}
		} catch (error) {
			if (error instanceof Error && !error.message.includes("unknown")) {
				console.warn(
					`[${signature}] Error decoding instruction data (Slot: ${slot ?? "N/A"}): ${error.message}`,
				);
			}
		}
	}
	return null;
}

/**
 * Starts the WebSocket listener for Launch events from the Virtuals Protocol program.
 */
export function startVirtualsSolanaListener(retryCount = 0) {
	console.log(`Attempting to start listener for ${LAUNCHPAD_NAME}...`);

	try {
		// Use getConnection for both HTTP and WebSocket subscriptions
		const connection = getConnection();

		connection.onLogs(
			VIRTUALS_PROGRAM_ID,
			async (logs: SolanaLogInfo) => {
				let signature: string | undefined = undefined;
				try {
					signature = logs.signature;
					if (!signature) {
						console.error("[SVM Listener] No signature in logs");
						return;
					}

					// Use Helius for real-time parsing as well for consistency
					const HELIUS_API_KEY = env.HELIUS_API_KEY;
					if (!HELIUS_API_KEY) {
						console.error(
							`[${signature}] HELIUS_API_KEY not set, cannot parse real-time event via Helius.`,
						);
						return; // Cannot parse without API key
					}

					const url = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;
					console.log(
						`[${signature}] Processing real-time event using Helius single tx endpoint...`,
					);

					const response = await fetch(url, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ transactions: [signature] }),
					});

					if (!response.ok) {
						throw new Error(
							`Helius single tx API request failed: ${response.status} ${response.statusText} - ${await response.text()}`,
						);
					}

					const txDetails: HeliusParsedTransaction[] = await response.json();
					const tx = txDetails[0]; // Get the first (and only) transaction

					if (!tx) {
						console.warn(
							`[${signature}] Helius did not return details for this transaction.`,
						);
						return;
					}

					// --- Inline Parsing Logic for Real-time Events ---
					let parsedInfo: ParsedLaunchInfo | null = null;
					try {
						const creator = new PublicKey(tx.feePayer);
						const eventTimestamp = tx.timestamp;

						for (const instruction of tx.instructions) {
							if (instruction.programId === VIRTUALS_PROGRAM_ID.toString()) {
								try {
									const dataBuffer = Buffer.from(instruction.data, "base64");
									const decodedIx = instructionCoder.decode(dataBuffer);

									if (decodedIx?.name === "launch") {
										const args = decodedIx.data as {
											symbol: string;
											name: string;
											uri: string;
										};
										const tokenMintAddress = instruction.accounts[2];
										if (!tokenMintAddress) {
											console.error(
												`[${tx.signature}] Could not find token mint account in Helius instruction (real-time)`,
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
											`[${tx.signature}] Found real-time launch via Helius: ${args.name} (${args.symbol})`,
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
											`[${tx.signature}] Error decoding instruction (real-time):`,
											decodeError.message,
										);
									}
								}
							}
						}
					} catch (parseError) {
						console.error(
							`[${tx.signature}] Error parsing Helius transaction (real-time):`,
							parseError,
						);
					}

					if (parsedInfo) {
						await processLaunchEvent(parsedInfo);
					} else {
						// console.log(`[${signature}] No relevant launch instruction found in real-time event.`);
					}
				} catch (error) {
					console.error(
						`[${signature ?? "unknown"}] Error processing real-time event via Helius:`,
						error,
					);
					// --- Reconnection logic for handler errors ---
					const delay = Math.min(30000, 5000 * (retryCount + 1));
					console.log(
						`[${LAUNCHPAD_NAME}] Attempting to reconnect Solana listener in ${delay / 1000}s after handler error...`,
					);
					setTimeout(() => {
						startVirtualsSolanaListener(retryCount + 1);
					}, delay);
				}
			},
			"confirmed",
		);

		console.log(
			`[${LAUNCHPAD_NAME}] Listener started successfully, watching program logs and using Helius for parsing.`,
		);
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Critical error: Failed to start event listener:`,
			error,
		);
		// --- Reconnection logic for setup errors ---
		const delay = Math.min(30000, 5000 * (retryCount + 1));
		console.log(
			`[${LAUNCHPAD_NAME}] Attempting to reconnect Solana listener in ${delay / 1000}s after critical error...`,
		);
		setTimeout(() => {
			startVirtualsSolanaListener(retryCount + 1);
		}, delay);
	}
}

/**
 * Fetches and processes historical launch events using paginated getSignatures + getTransaction + inner ix parsing.
 */
export async function debugFetchHistoricalEvents(
	fromSlot?: bigint,
	toSlot?: bigint,
) {
	console.log(
		`Attempting to debug ${LAUNCHPAD_NAME} historical events using paginated getSignatures + getTransaction...`,
	);

	const connection = getConnection();
	let startSlotNum: number;
	let endSlotNum: number;

	try {
		startSlotNum = Number(fromSlot || 0n);
		if (toSlot) {
			endSlotNum = Number(toSlot);
		} else {
			endSlotNum = await connection.getSlot("finalized");
		}
		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Fetching signatures for program ${VIRTUALS_PROGRAM_ID.toString()} from slot ${startSlotNum} to ${endSlotNum} ---`,
		);
	} catch (e) {
		console.error("Error determining slot range:", e);
		return;
	}

	const allSignaturesInRange: string[] = [];
	let lastSignatureFetched: string | undefined = undefined;
	let fetchMoreSignatures = true;
	const signaturesLimit = 1000;
	let totalSignaturesFetched = 0;

	console.log("Starting signature pagination...");
	while (fetchMoreSignatures) {
		try {
			const signaturesInfo = await connection.getSignaturesForAddress(
				VIRTUALS_PROGRAM_ID,
				{ limit: signaturesLimit, before: lastSignatureFetched },
				"confirmed",
			);
			totalSignaturesFetched += signaturesInfo.length;

			if (signaturesInfo.length === 0) {
				fetchMoreSignatures = false;
				break;
			}
			lastSignatureFetched =
				signaturesInfo[signaturesInfo.length - 1]?.signature;

			let oldestSlotInBatch: number | null = null;
			for (const sigInfo of signaturesInfo) {
				if (
					!sigInfo.err &&
					sigInfo.slot !== null &&
					sigInfo.slot >= startSlotNum &&
					sigInfo.slot <= endSlotNum
				) {
					allSignaturesInRange.push(sigInfo.signature);
				}
				if (sigInfo.slot !== null) {
					oldestSlotInBatch = Math.min(
						oldestSlotInBatch ?? Number.POSITIVE_INFINITY,
						sigInfo.slot,
					);
				}
			}
			console.log(
				`Fetched batch of ${signaturesInfo.length}. Oldest: ${oldestSlotInBatch ?? "N/A"}. In range so far: ${allSignaturesInRange.length}`,
			);

			if (oldestSlotInBatch !== null && oldestSlotInBatch < startSlotNum) {
				fetchMoreSignatures = false;
			}
			if (signaturesInfo.length < signaturesLimit) {
				fetchMoreSignatures = false;
			}
			if (fetchMoreSignatures)
				await new Promise((resolve) => setTimeout(resolve, 50));
		} catch (error) {
			console.error(
				`Error fetching signature batch before ${lastSignatureFetched}:`,
				error,
			);
			fetchMoreSignatures = false;
		}
	} // End while loop for signature fetching

	console.log(
		`Finished fetching signatures. Total fetched: ${totalSignaturesFetched}. Found ${allSignaturesInRange.length} unique successful signatures within slot range [${startSlotNum}, ${endSlotNum}].`,
	);

	const processedSignatures = new Set<string>();
	let launchEventsFound = 0;

	if (allSignaturesInRange.length === 0) {
		console.log("No signatures to process.");
	} else {
		// Remove potential duplicates from pagination overlaps before processing
		const uniqueSignaturesToProcess = [...new Set(allSignaturesInRange)];
		console.log(
			`Processing ${uniqueSignaturesToProcess.length} unique signatures...`,
		);

		for (const signature of uniqueSignaturesToProcess) {
			if (processedSignatures.has(signature)) continue; // Should not happen with Set, but safety check

			let slot: number | null = null; // Store slot for logging context

			try {
				const txResponse = await connection.getTransaction(signature, {
					maxSupportedTransactionVersion: 0,
					commitment: "confirmed",
				});

				if (!txResponse) {
					console.warn(`[${signature}] Failed to fetch transaction details.`);
					processedSignatures.add(signature); // Mark as processed even if failed
					continue;
				}
				slot = txResponse.slot; // Get slot from response
				processedSignatures.add(signature); // Mark as processed

				const { transaction, blockTime, meta } = txResponse;
				const message = transaction.message as VersionedMessage;
				const loadedAddresses = meta?.loadedAddresses ?? null;
				const accountKeys = message.getAccountKeys({
					accountKeysFromLookups: loadedAddresses,
				});

				if (!accountKeys) {
					console.error(
						`[${signature}] Failed to resolve account keys (Slot: ${slot}).`,
					);
					continue;
				}

				const eventTimestamp = blockTime ?? Math.floor(Date.now() / 1000);
				let launchInfo: ParsedLaunchInfo | null = null;

				// 1. Check top-level instructions
				for (const instruction of message.compiledInstructions) {
					launchInfo = findLaunchInInstruction(
						instruction,
						message,
						accountKeys,
						signature,
						slot,
					);
					if (launchInfo) break;
				}

				// 2. Check inner instructions if not found in top-level
				if (!launchInfo && meta?.innerInstructions) {
					for (const innerIxSet of meta.innerInstructions) {
						// console.log(`[${signature}] Checking inner instructions for index ${innerIxSet.index}`);
						// Let TypeScript infer the type of 'instruction' here
						for (const instruction of innerIxSet.instructions) {
							// Inner instructions might not have 'accounts', only 'accountKeyIndexes'
							// findLaunchInInstruction is designed to handle this union type now
							launchInfo = findLaunchInInstruction(
								instruction,
								message,
								accountKeys,
								signature,
								slot,
							);
							if (launchInfo) break;
						}
						if (launchInfo) break;
					}
				}

				if (launchInfo) {
					// Fill in the correct timestamp
					launchInfo.eventTimestamp = eventTimestamp;
					await processLaunchEvent(launchInfo);
					launchEventsFound++;
				}
			} catch (error) {
				console.error(
					`[${signature}] Error processing transaction (Slot: ${slot ?? "N/A"}):`,
					error,
				);
				// Ensure signature is marked processed even on error
				if (!processedSignatures.has(signature)) {
					processedSignatures.add(signature);
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 50)); // Delay between transactions
		} // End loop through signatures
	}

	console.log(
		`--- Debugging [${LAUNCHPAD_NAME}]: Finished processing. Processed ${processedSignatures.size} unique signatures, Found ${launchEventsFound} launch events. ---`,
	);

	// Start the real-time listener after debugging is complete
	console.log(
		`Starting real-time listener for ${LAUNCHPAD_NAME} after debug completion`,
	);
	startVirtualsSolanaListener(); // This still uses Helius for real-time parsing, which might be fine.
}
// How to run: Set DEBUG_VIRTUALS_SOLANA=true and optionally DEBUG_SLOT_FROM/DEBUG_SLOT_TO
