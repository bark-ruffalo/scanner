import { getMint } from "@solana/spl-token"; // For fetching mint info for total supply
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import type { LaunchpadLinkGenerator } from "~/lib/content-utils"; // type-only import
import {
	extractUrls,
	fetchFirecrawlContent,
	fetchUrlContent,
	formatFetchedContent,
} from "~/lib/content-utils";
import {
	EVM_DECIMALS,
	SVM_DECIMALS,
	calculateBigIntPercentage,
	formatPercentage,
	formatTokenBalance,
} from "~/lib/utils";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { fetchAdditionalContent as fetchContentUtil } from "~/server/lib/common-utils";
import { publicClient as evmPublicClient } from "~/server/lib/evm-client";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";
import { getConnection as getSolanaConnection } from "~/server/lib/svm-client";
import { updateSolanaTokenStatistics } from "~/server/lib/svm-utils";
import { getSolanaTokenBalance } from "~/server/lib/svm-utils"; // For fetching current balance
import { getAddressTokenHolding } from "~/server/lib/virtuals-utils";
import type { NewLaunchData } from "~/server/queries"; // type-only import
import { addLaunch } from "~/server/queries";

export const LAUNCHPAD_NAME = "Virtuals Protocol"; // Exported
const VIRTUALS_API_BASE_URL = "https://api.virtuals.io/api/virtuals";
const FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface VirtualsLaunchListItem {
	id: number;
	uid: string;
	createdAt: string;
	name: string;
	symbol: string;
	chain: "BASE" | "SOLANA" | string;
	status: "UNDERGRAD" | "GENESIS" | "AVAILABLE" | string;
	image?: {
		url: string;
		formats?: {
			thumbnail?: { url: string };
			small?: { url: string };
			medium?: { url: string };
			large?: { url: string };
		};
	};
}

interface VirtualsCreatorSocial {
	walletAddress: string;
}

interface VirtualsCreator {
	username?: string;
	email?: string;
	displayName?: string | null;
	socials?: Record<string, string | null> | null;
	socialCount?: number | null;
	id?: number;
	userSocials?: VirtualsCreatorSocial[] | null;
	avatar?: { url?: string | null } | null;
	bio?: string | null;
	walletAddress?: string;
}

interface VirtualsTokenomicRelease {
	id?: number;
	type?: string;
	duration?: number | null;
	startsAt?: string;
	bips?: number;
	durationUnit?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

interface VirtualsTokenomicProject {
	id: number;
	unlockerAddress: string;
	futureTokenAddress: string;
	trackerTokenAddress: string;
	tokenAddress: string;
	createdAt: string;
	updatedAt: string;
}

interface VirtualsTokenomicRecipient {
	id: number;
	recipientAddress: string;
	amount: string;
	actualId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface VirtualsTokenomic {
	id?: number;
	amount?: string;
	createdAt?: string;
	updatedAt?: string;
	name?: string;
	description?: string;
	isLocked?: boolean;
	linearStartTimestampRelative?: (number | null)[];
	linearBips?: (number | null)[];
	numOfUnlocksForEachLinear?: (number | null)[];
	startsAt?: string;
	bips?: number;
	linearEndTimestampRelative?: number | null;
	presetId?: string;
	depositTx?: string | null;
	isDefault?: boolean;
	releases?: VirtualsTokenomicRelease[];
	project?: VirtualsTokenomicProject | null;
	recipients?: VirtualsTokenomicRecipient[] | null;
}

interface VirtualsLaunchDetail extends VirtualsLaunchListItem {
	description: string | null;
	overview: string | null;
	walletAddress: string | null;
	tokenAddress?: string | null;
	preToken: string | null;
	preTokenPair: string | null;
	socials?: Record<string, Record<string, string>> | null;
	category?: string | null;
	role?: string | null;
	virtualId?: string | null;
	holderCount?: number | null;
	mcapInVirtual?: number | null;
	creator?: VirtualsCreator | null;
	tokenomics?: Array<VirtualsTokenomic> | null;
	genesis?: VirtualsGenesis | null;
	tbaAddress?: string | null;
	top10HolderPercentage?: number | null;
	level?: number | null;
	lpAddress?: string | null;
}

interface VirtualsGenesis {
	id: number;
	startsAt: string;
	endsAt: string;
	status: string;
	genesisId: string;
	genesisTx: string;
	genesisAddress: string;
	result: {
		totalPointsRefunded: number;
		totalVirtualsRefunded: number;
	} | null;
	processedParticipants: string;
	createdAt: string;
	updatedAt: string;
}

interface VirtualsApiResponse<T> {
	data: T;
	meta?: {
		pagination: {
			page: number;
			pageSize: number;
			pageCount: number;
			total: number;
		};
	};
}

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

		// Add other custom links here as needed
		// Example:
		// if (params.tokenAddress) {
		//   links.push({
		//     url: `https://some-api.com/token/${params.tokenAddress}`,
		//     name: "Token API Data",
		//     useFirecrawl: false,
		//   });
		// }

		return links;
	},
};

async function fetchLaunchDetails(
	launchId: number,
): Promise<VirtualsLaunchDetail | null | "NOT_FOUND"> {
	try {
		const url = `${VIRTUALS_API_BASE_URL}/${launchId}?populate[0]=image&populate[1]=genesis`;
		console.log(
			`[${LAUNCHPAD_NAME}] Fetching details for launch ID: ${launchId} from ${url}`,
		);
		try {
			const responseContent = await fetchUrlContent(url);
			// Detect 404 error from fetchUrlContent
			if (
				responseContent.includes("HTTP error! status: 404") ||
				responseContent.includes(
					"Error fetching content: HTTP error! status: 404",
				)
			) {
				// Do not log here; let the caller log a user-facing message for 404
				return "NOT_FOUND";
			}
			try {
				const parsed = JSON.parse(
					responseContent,
				) as VirtualsApiResponse<VirtualsLaunchDetail>;
				return parsed.data;
			} catch (jsonError) {
				console.error(
					`[${LAUNCHPAD_NAME}] Error parsing JSON for launch ID ${launchId}:`,
					jsonError,
					"Raw response:",
					responseContent,
				);
				return null;
			}
		} catch (error) {
			console.error(
				`[${LAUNCHPAD_NAME}] Error fetching details for launch ID ${launchId}:`,
				error,
			);
			return null;
		}
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Outer error fetching details for launch ID ${launchId}:`,
			error,
		);
		return null;
	}
}

export async function processVirtualsLaunch(
	launchDetail: VirtualsLaunchDetail,
	overwrite = false,
): Promise<{ skipped: boolean; skipReason?: string }> {
	const status = launchDetail.status?.toUpperCase();
	console.log("launchDetail.genesis.status:", launchDetail.genesis?.status);
	if (
		launchDetail.genesis &&
		status === "GENESIS" &&
		launchDetail.genesis.status !== "FINALIZED" &&
		launchDetail.genesis.status !== "STARTED" &&
		launchDetail.genesis.status !== "INITIALIZED"
	) {
		const skipMsg = `[${LAUNCHPAD_NAME}] Skipping Genesis launch ${launchDetail.id} due to status: ${launchDetail.genesis?.status}`;
		console.log(skipMsg);
		return {
			skipped: true,
			skipReason: `Skipping Genesis launch ${launchDetail.id} due to status: ${launchDetail.genesis?.status}`,
		};
	}

	console.log(
		`[${LAUNCHPAD_NAME}] Processing launch: ${launchDetail.name} (${launchDetail.id})`,
	);

	const title = `${launchDetail.name} ($${launchDetail.symbol || "N/A"})`;
	let launchUrl: string;
	if (status === "GENESIS" && launchDetail.genesis && launchDetail.genesis.id) {
		launchUrl = `https://app.virtuals.io/geneses/${launchDetail.genesis.id}`;
	} else if (status === "UNDERGRAD") {
		launchUrl = `https://app.virtuals.io/prototypes/${launchDetail.preToken}`;
	} else if (status === "AVAILABLE") {
		launchUrl = `https://app.virtuals.io/virtuals/${launchDetail.id}`;
	} else {
		launchUrl = "";
	}
	const imageUrl =
		launchDetail.image?.formats?.thumbnail?.url ||
		launchDetail.image?.url ||
		null;
	const launchedAt = new Date(launchDetail.createdAt);
	const chain = launchDetail.chain?.toUpperCase();

	let descriptionContent = launchDetail.description || "";
	if (launchDetail.overview) {
		descriptionContent += `\n\n## Overview\n${launchDetail.overview}`;
	}

	const creatorAddress = launchDetail.walletAddress;
	const tokenAddress =
		launchDetail.tokenAddress ?? launchDetail.preToken ?? null;

	// Fetch creator token holding info early for all launches
	let creatorTokensHeldRaw: bigint | null = null;
	let creatorTokensHeldForDesc: string | null = null;
	let creatorTokenHoldingPercentageForDb: number | null = null;
	let creatorTokenHoldingPercentageForDesc: string | null = null;
	if (status === "GENESIS" && Array.isArray(launchDetail.tokenomics)) {
		let totalBips = 0;
		let totalTokens = 0n;
		for (const t of launchDetail.tokenomics) {
			if (t.name?.toLowerCase().includes("dev") && typeof t.bips === "number") {
				totalBips += t.bips;
				if (Array.isArray(t.recipients)) {
					for (const r of t.recipients) {
						if (typeof r.amount === "string") {
							totalTokens += BigInt(r.amount);
						}
					}
				}
			}
		}
		creatorTokensHeldRaw = totalTokens;
		creatorTokensHeldForDesc = formatTokenBalance(totalTokens);
		const percentObj = calculateBigIntPercentage(totalTokens, 1000000000n);
		creatorTokenHoldingPercentageForDb = percentObj ? percentObj.percent : 0;
		creatorTokenHoldingPercentageForDesc = percentObj
			? percentObj.formatted
			: "N/A";
	} else if (
		creatorAddress &&
		tokenAddress &&
		(status === "UNDERGRAD" || status === "AVAILABLE")
	) {
		const holdingInfo = await getAddressTokenHolding(
			creatorAddress,
			tokenAddress,
		);
		creatorTokensHeldRaw = holdingInfo.amount;
		creatorTokensHeldForDesc = formatTokenBalance(holdingInfo.amount);
		creatorTokenHoldingPercentageForDb = holdingInfo.percentage;
		creatorTokenHoldingPercentageForDesc = holdingInfo.formattedPercentage;
	}

	const fetchedInfo = await fetchContentUtil(
		descriptionContent,
		creatorAddress || "",
		virtualsLinkGenerator,
	);

	const launchedAtDate = new Date(launchedAt);
	const tokenName = `${launchDetail.name} ($${launchDetail.symbol || "N/A"})`;
	let tokenUrl: string;

	if (status === "GENESIS") {
		if (
			launchDetail.genesis &&
			(launchDetail.genesis.status === "FINALIZED" ||
				launchDetail.genesis.status === "STARTED" ||
				launchDetail.genesis.status === "INITIALIZED")
		) {
			tokenUrl = `https://app.virtuals.io/geneses/${launchDetail.genesis.id}`;
		} else {
			console.log(
				`[${LAUNCHPAD_NAME}] Skipping Genesis launch ${launchDetail.id} due to status: ${launchDetail.genesis?.status}`,
			);
			return {
				skipped: true,
				skipReason: `Skipping Genesis launch ${launchDetail.id} due to status: ${launchDetail.genesis?.status}`,
			};
		}
	} else if (status === "UNDERGRAD") {
		tokenUrl = `https://app.virtuals.io/prototypes/${launchDetail.preToken}`;
	} else if (status === "AVAILABLE") {
		tokenUrl = `https://app.virtuals.io/virtuals/${launchDetail.id}`;
	} else {
		tokenUrl = "";
	}

	let fullDescription = "N/A";

	// --- Liquidity contract / main selling address logic ---
	const lpAddress = launchDetail.lpAddress || null;
	const preTokenPair = launchDetail.preTokenPair || null;
	let liquidityContract: string | null = null;
	if (lpAddress) {
		liquidityContract = lpAddress;
	} else if (preTokenPair) {
		liquidityContract = preTokenPair;
	} else {
		liquidityContract = null;
	}

	let creatorInitialTokensLine = "";
	if (status === "GENESIS" || status === "UNDERGRAD") {
		creatorInitialTokensLine = `Creator initial number of tokens: ${creatorTokensHeldForDesc ? `${creatorTokensHeldForDesc} (${creatorTokenHoldingPercentageForDesc} of token supply)` : "N/A"}`;
	}
	// TODO: also find out initial tokens for AVAILABLE launches

	if (chain === "BASE") {
		fullDescription = `
# ${tokenName}
URL on launchpad: ${tokenUrl ?? "N/A"}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}

## Token details and tokenomics
Token address: ${tokenAddress ? getAddress(tokenAddress) : "N/A"}
Token symbol: $${launchDetail.symbol}
Token supply: 1 billion
Top holders: ${tokenAddress ? `https://basescan.org/token/${getAddress(tokenAddress)}#balances` : "N/A"}
Liquidity contract: ${liquidityContract ? `https://basescan.org/address/${liquidityContract}#asset-tokens` : "N/A"}
${creatorInitialTokensLine ? `${creatorInitialTokensLine}\n` : ""}
## Creator info
Creator address: ${creatorAddress}
Creator on basescan.org: https://basescan.org/address/${creatorAddress}#asset-tokens
Creator on virtuals.io: https://app.virtuals.io/profile/${creatorAddress}
Creator on zerion.io: https://app.zerion.io/${creatorAddress}/overview
Creator on debank.com: https://debank.com/profile/${creatorAddress}

## Description at launch
${descriptionContent}

## Additional information extracted from relevant pages
${fetchedInfo}

<full_details>
${JSON.stringify(launchDetail, null, 2)}
</full_details>
`.trim();
	} else if (chain === "SOLANA") {
		fullDescription = `
# ${tokenName}
URL on launchpad: ${tokenUrl}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}

## Token details and tokenomics
Token address: ${tokenAddress}
Token symbol: $${launchDetail.symbol}
Token supply: 1 billion
Top holders: https://solscan.io/token/${tokenAddress}#holders
Liquidity contract: ${liquidityContract ? `https://solscan.io/account/${liquidityContract}` : "N/A"}
${creatorInitialTokensLine ? `${creatorInitialTokensLine}\n` : ""}
## Creator info
Creator address: ${creatorAddress ?? "N/A"}
Creator on solscan.io: https://solscan.io/account/${creatorAddress}
Creator on virtuals.io: https://app.virtuals.io/profile/${creatorAddress}
Creator on birdeye.so: https://birdeye.so/profile/${creatorAddress}

${descriptionContent}

## Additional information extracted from relevant pages
${fetchedInfo}

<full_details>
${JSON.stringify(launchDetail, null, 2)}
</full_details>
`.trim();
	}

	let creatorInitialTokensHeld: string | null | undefined;
	let tokensForSale: string | null | undefined;
	let creatorInitialTokensHeldRaw: string | null | undefined = null;
	let tokensForSaleRaw: string | null | undefined = null;
	const totalSupply = "1000000000"; // Virtuals Protocol fixed supply is 1 billion

	if (status === "GENESIS" && launchDetail.tokenomics) {
		const devAllocation = launchDetail.tokenomics.find(
			(t) => t.name?.toLowerCase() === "developer" || t.isDefault === true,
		);
		if (devAllocation?.amount) {
			const amountBigInt = BigInt(devAllocation.amount);
			const decimals = chain === "SOLANA" ? SVM_DECIMALS : EVM_DECIMALS; // Assuming Genesis can be on Solana too
			const rawInitialTokens = (
				amountBigInt / BigInt(10 ** decimals)
			).toString();
			creatorInitialTokensHeld = formatTokenBalance(
				amountBigInt / BigInt(10 ** decimals),
			); // for display
			const saleAmount = BigInt(totalSupply) - BigInt(rawInitialTokens);
			tokensForSale = formatTokenBalance(saleAmount > 0n ? saleAmount : 0n); // for display
			// For DB, use rawInitialTokens and saleAmount.toString()
			creatorInitialTokensHeldRaw = rawInitialTokens;
			tokensForSaleRaw = saleAmount > 0n ? saleAmount.toString() : "0";
		}
	} else if (
		chain === "SOLANA" &&
		tokenAddress &&
		(status === "UNDERGRAD" || status === "AVAILABLE")
	) {
		try {
			const solanaConnection = getSolanaConnection();
			const tokenMintPk = new PublicKey(tokenAddress);
			const mintInfo = await getMint(solanaConnection, tokenMintPk);
			const rawInitialTokens = (
				mintInfo.supply / BigInt(10 ** mintInfo.decimals)
			).toString();
			creatorInitialTokensHeld = formatTokenBalance(
				mintInfo.supply / BigInt(10 ** mintInfo.decimals),
			); // for display
			tokensForSale = creatorInitialTokensHeld;
			// For DB, use rawInitialTokens
			creatorInitialTokensHeldRaw = rawInitialTokens;
			tokensForSaleRaw = rawInitialTokens;
		} catch (e) {
			console.error(
				`[${LAUNCHPAD_NAME}] Could not fetch mint info for Solana preToken ${tokenAddress}: ${e}`,
			);
			creatorInitialTokensHeld = null;
			tokensForSale = null;
			creatorInitialTokensHeldRaw = null;
			tokensForSaleRaw = null;
		}
	}

	const launchData: NewLaunchData = {
		launchpad: LAUNCHPAD_NAME,
		launchpadSpecificId: launchDetail.id.toString(),
		title,
		url: launchUrl,
		description: fullDescription,
		launchedAt,
		imageUrl,
		creatorAddress: creatorAddress
			? chain === "BASE"
				? getAddress(creatorAddress)
				: creatorAddress
			: null,
		tokenAddress: tokenAddress
			? chain === "BASE"
				? getAddress(tokenAddress)
				: tokenAddress
			: null,
		chain,
		status,
		creatorInitialTokensHeld:
			creatorInitialTokensHeldRaw != null ? creatorInitialTokensHeldRaw : null,
		creatorTokenHoldingPercentage:
			creatorTokenHoldingPercentageForDb != null
				? creatorTokenHoldingPercentageForDb.toString()
				: null,
		tokensForSale: tokensForSaleRaw != null ? tokensForSaleRaw : null,
		totalTokenSupply: totalSupply,
		summary: "-",
		analysis: "-",
		rating: -1,
		basicInfoUpdatedAt: new Date(),
		llmAnalysisUpdatedAt: new Date(),
		tokenStatsUpdatedAt: new Date(),
		mainSellingAddress: liquidityContract || null,
	};

	const addResult = await addLaunch(launchData);

	return { skipped: false };
}

export async function fetchAndProcessVirtualsLaunches() {
	console.log(`[${LAUNCHPAD_NAME}] Fetching latest launches...`);
	try {
		const url = `${VIRTUALS_API_BASE_URL}?filters[status]=3&sort[0]=createdAt%3Adesc&populate[0]=image&pagination[page]=1&pagination[pageSize]=2&isGrouped=1`;
		const responseContent = await fetchUrlContent(url);
		const parsed = JSON.parse(responseContent) as VirtualsApiResponse<
			VirtualsLaunchListItem[]
		>;

		if (!parsed.data || parsed.data.length === 0) {
			console.log(`[${LAUNCHPAD_NAME}] No new launches found.`);
			return;
		}

		console.log(
			`[${LAUNCHPAD_NAME}] Found ${parsed.data.length} launches in the API response.`,
		);

		for (const launchItem of parsed.data) {
			const existing = await db.query.launches.findFirst({
				where: eq(launches.launchpadSpecificId, launchItem.id.toString()),
			});
			if (existing) {
				continue;
			}

			const launchDetail = await fetchLaunchDetails(launchItem.id);
			if (launchDetail && launchDetail !== "NOT_FOUND") {
				await processVirtualsLaunch(launchDetail);
			}
		}
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Error fetching or processing launches:`,
			error,
		);
	}
}

export async function debugVirtualsLaunchById(
	launchApiId: number | string,
	overwrite = false,
) {
	console.log(
		`[${LAUNCHPAD_NAME}] Debugging launch with API ID: ${launchApiId} (overwrite: ${overwrite})`,
	);
	const numericLaunchId =
		typeof launchApiId === "string"
			? Number.parseInt(launchApiId, 10)
			: launchApiId;

	if (Number.isNaN(numericLaunchId)) {
		console.error(
			`[${LAUNCHPAD_NAME}] Invalid Launch API ID provided: ${launchApiId}`,
		);
		return { success: false, message: "Invalid Launch API ID." };
	}

	try {
		const launchDetail = await fetchLaunchDetails(numericLaunchId);
		if (launchDetail === "NOT_FOUND") {
			console.warn(
				`[${LAUNCHPAD_NAME}] Launch ID ${numericLaunchId} not found (404).`,
			);
			return {
				success: false,
				message: `Launch ID: ${numericLaunchId} was not found (404).`,
			};
		}
		if (launchDetail && typeof launchDetail !== "string") {
			const existingLaunch = await db.query.launches.findFirst({
				where: eq(launches.launchpadSpecificId, numericLaunchId.toString()),
			});
			if (existingLaunch && overwrite) {
				await db
					.delete(launches)
					.where(eq(launches.launchpadSpecificId, numericLaunchId.toString()));
			}
			if (existingLaunch && !overwrite) {
				console.log(
					`[${LAUNCHPAD_NAME}] Debug: Launch ${numericLaunchId} already exists. Skipping re-processing.`,
				);
				return {
					success: true,
					message: `Launch ID: ${numericLaunchId} already exists. Skipped re-processing.`,
				};
			}

			const processResult = await processVirtualsLaunch(
				launchDetail,
				overwrite,
			);
			if (processResult.skipped) {
				return {
					success: true,
					message: processResult.skipReason || "Launch skipped.",
				};
			}

			console.log(
				`[${LAUNCHPAD_NAME}] Successfully processed debug launch ID: ${numericLaunchId}`,
			);
			return {
				success: true,
				message: `Successfully processed launch ID: ${numericLaunchId}`,
			};
		}
		console.error(
			`[${LAUNCHPAD_NAME}] Could not fetch details for debug launch ID: ${numericLaunchId}`,
		);
		return {
			success: false,
			message: `Could not fetch details for launch ID: ${numericLaunchId}`,
		};
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Error debugging launch ID ${numericLaunchId}:`,
			error,
		);
		return {
			success: false,
			message: `Error debugging launch ID ${numericLaunchId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

let intervalId: NodeJS.Timeout | null = null;

export function startVirtualsListener() {
	console.log(`[${LAUNCHPAD_NAME}] Starting listener...`);
	if (intervalId) {
		clearInterval(intervalId);
	}
	fetchAndProcessVirtualsLaunches().catch((error) => {
		console.error(`[${LAUNCHPAD_NAME}] Initial fetch failed:`, error);
	});
	intervalId = setInterval(() => {
		fetchAndProcessVirtualsLaunches().catch((error) => {
			console.error(`[${LAUNCHPAD_NAME}] Interval fetch failed:`, error);
		});
	}, FETCH_INTERVAL);
	console.log(
		`[${LAUNCHPAD_NAME}] Listener started. Will fetch every ${FETCH_INTERVAL / 1000 / 60} minutes.`,
	);
}

export function stopVirtualsListener() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
		console.log(`[${LAUNCHPAD_NAME}] Listener stopped.`);
	}
}
