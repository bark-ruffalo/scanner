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
		const url = `${VIRTUALS_API_BASE_URL}/${launchId}?populate[0]=image&populate[1]=genesis&populate[2]=tokenomics`;
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
				// Added more detailed logging
				console.log(
					`[${LAUNCHPAD_NAME}] Fetched launchDetail for ID ${launchId}. Full parsed.data:`,
					JSON.stringify(parsed.data, null, 2),
				);
				if (parsed.data && "tokenomics" in parsed.data) {
					console.log(
						`[${LAUNCHPAD_NAME}] Fetched launchDetail for ID ${launchId}. Tokenomics from parsed.data:`,
						JSON.stringify(parsed.data.tokenomics, null, 2),
					);
				} else {
					console.log(
						`[${LAUNCHPAD_NAME}] Fetched launchDetail for ID ${launchId}. Tokenomics field NOT PRESENT in parsed.data.`,
					);
				}
				if (parsed.data && "genesis" in parsed.data) {
					console.log(
						`[${LAUNCHPAD_NAME}] Fetched launchDetail for ID ${launchId}. Genesis from parsed.data:`,
						JSON.stringify(parsed.data.genesis, null, 2),
					);
				} else {
					console.log(
						`[${LAUNCHPAD_NAME}] Fetched launchDetail for ID ${launchId}. Genesis field NOT PRESENT in parsed.data.`,
					);
				}
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

	// Consolidated token allocation logic
	let dbCreatorInitialTokensHeldRaw: string | null = null;
	let dbCreatorTokenHoldingPercentage: string | null = null;
	let dbTokensForSaleRaw: string | null = null;
	let descCreatorTokensHeld = "N/A";
	let descCreatorTokenHoldingPercentage = "N/A";

	const totalSupply = "1000000000"; // Virtuals Protocol fixed supply is 1 billion
	const totalSupplyBigInt = BigInt(totalSupply);

	// Added more detailed logging
	console.log(
		`[${LAUNCHPAD_NAME}] Processing launch ${launchDetail.id} (${launchDetail.name}). Status: ${status}. Full launchDetail object:`,
		JSON.stringify(launchDetail, null, 2),
	);
	if (launchDetail && "tokenomics" in launchDetail) {
		console.log(
			`[${LAUNCHPAD_NAME}] Processing launch ${launchDetail.id}. Tokenomics from launchDetail:`,
			JSON.stringify(launchDetail.tokenomics, null, 2),
		);
	} else {
		console.log(
			`[${LAUNCHPAD_NAME}] Processing launch ${launchDetail.id}. Tokenomics field NOT PRESENT in launchDetail.`,
		);
	}

	if (
		status === "GENESIS" &&
		Array.isArray(launchDetail.tokenomics) &&
		launchDetail.tokenomics.length > 0
	) {
		console.log(
			`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} is GENESIS with tokenomics. Count: ${launchDetail.tokenomics.length}. Tokenomics content:`,
			JSON.stringify(launchDetail.tokenomics, null, 2),
		);
		const devAllocationTerms = [
			"core",
			"team",
			"develop",
			"advisor",
			"adviser",
			"investor",
			"founder",
			"operations",
			"treasury",
			"partner",
			"builder",
			"production",
			"vault",
		];
		// First, find the allocation category based on name or isDefault flag
		const devAllocationCategory = launchDetail.tokenomics.find(
			(t) =>
				devAllocationTerms.some((term) =>
					t.name?.toLowerCase().includes(term),
				) || t.isDefault === true,
		);

		if (devAllocationCategory) {
			console.log(
				`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} (GENESIS) - Found potential dev allocation category: ${devAllocationCategory.name}`,
			);
			const firstRecipient = devAllocationCategory.recipients?.[0];

			if (firstRecipient && typeof firstRecipient.amount === "string") {
				const amountStr = firstRecipient.amount; // Now type-safe
				const creatorTokensInSmallestUnit = BigInt(amountStr);
				const decimals = chain === "SOLANA" ? SVM_DECIMALS : EVM_DECIMALS;

				const creatorTokensInWholeUnit =
					creatorTokensInSmallestUnit / BigInt(10 ** decimals);
				dbCreatorInitialTokensHeldRaw = creatorTokensInWholeUnit.toString();
				descCreatorTokensHeld = formatTokenBalance(creatorTokensInSmallestUnit);

				const percentObj = calculateBigIntPercentage(
					creatorTokensInSmallestUnit,
					totalSupplyBigInt,
				);

				if (percentObj) {
					dbCreatorTokenHoldingPercentage = percentObj.percent.toString();
					descCreatorTokenHoldingPercentage = percentObj.formatted;
				}

				const totalSupplyInSmallestUnit =
					totalSupplyBigInt * BigInt(10 ** decimals);
				const tokensForSaleInSmallestUnit =
					totalSupplyInSmallestUnit - creatorTokensInSmallestUnit;
				const tokensForSaleInWholeUnit =
					tokensForSaleInSmallestUnit < 0n
						? 0n
						: tokensForSaleInSmallestUnit / BigInt(10 ** decimals);
				dbTokensForSaleRaw = tokensForSaleInWholeUnit.toString();
				console.log(
					`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} (GENESIS) - Dev allocation processed. Creator tokens (raw whole): ${dbCreatorInitialTokensHeldRaw}, Percentage: ${descCreatorTokenHoldingPercentage}, Tokens for sale (raw whole): ${dbTokensForSaleRaw}`,
				);
			} else {
				console.log(
					`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} (GENESIS) - Dev allocation category "${devAllocationCategory.name}" found, but recipients array is missing/empty, first recipient is missing, or amount in first recipient is not a string/missing. Recipients: ${JSON.stringify(devAllocationCategory.recipients, null, 2)}`,
				);
			}
		} else {
			console.log(
				`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} (GENESIS) - No dev/team/core allocation category found matching terms: ${devAllocationTerms.join(", ")}. Checked tokenomics items: ${launchDetail.tokenomics.map((t) => `Name: ${t.name}, isDefault: ${t.isDefault}`).join(" | ")}`,
			);
		}
	} else if (status === "GENESIS") {
		console.log(
			`[${LAUNCHPAD_NAME}] Launch ${launchDetail.id} is GENESIS but tokenomics array is missing, empty, or not an array. Actual tokenomics value:`,
			JSON.stringify(launchDetail.tokenomics, null, 2),
		);
	} else if (
		creatorAddress &&
		tokenAddress &&
		(status === "UNDERGRAD" || status === "AVAILABLE")
	) {
		const holdingInfo = await getAddressTokenHolding(
			creatorAddress,
			tokenAddress,
		);

		if (holdingInfo && holdingInfo.amount != null) {
			const creatorTokensInSmallestUnit = holdingInfo.amount;
			const decimals = chain === "SOLANA" ? SVM_DECIMALS : EVM_DECIMALS;

			const creatorTokensInWholeUnit =
				creatorTokensInSmallestUnit / BigInt(10 ** decimals);
			dbCreatorInitialTokensHeldRaw = creatorTokensInWholeUnit.toString();
			descCreatorTokensHeld = formatTokenBalance(creatorTokensInSmallestUnit);

			if (holdingInfo.percentage != null) {
				dbCreatorTokenHoldingPercentage = holdingInfo.percentage.toString();
				descCreatorTokenHoldingPercentage =
					holdingInfo.formattedPercentage ??
					formatPercentage(holdingInfo.percentage);
			} else {
				const totalSupplyInSmallestUnit =
					totalSupplyBigInt * BigInt(10 ** decimals);
				if (totalSupplyInSmallestUnit > 0n) {
					const percentObjCalc = calculateBigIntPercentage(
						creatorTokensInSmallestUnit,
						totalSupplyBigInt,
					); // smallest_value, total_whole
					if (percentObjCalc) {
						dbCreatorTokenHoldingPercentage = percentObjCalc.percent.toString();
						descCreatorTokenHoldingPercentage = percentObjCalc.formatted;
					}
				}
			}

			const totalSupplyInSmallestUnit =
				totalSupplyBigInt * BigInt(10 ** decimals);
			const tokensForSaleInSmallestUnit =
				totalSupplyInSmallestUnit - creatorTokensInSmallestUnit;
			const actualTokensForSaleSmallest =
				tokensForSaleInSmallestUnit < 0n ? 0n : tokensForSaleInSmallestUnit;
			const tokensForSaleInWholeUnit =
				actualTokensForSaleSmallest / BigInt(10 ** decimals);
			dbTokensForSaleRaw = tokensForSaleInWholeUnit.toString();
		}
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
	if (descCreatorTokensHeld !== "N/A") {
		// Show if data is available, regardless of status if calculated
		creatorInitialTokensLine = `Creator initial number of tokens: ${descCreatorTokensHeld} (${descCreatorTokenHoldingPercentage} of token supply)`;
	}
	// TODO: also find out initial tokens for AVAILABLE launches (Now handled by consolidated logic if creatorAddress and tokenAddress exist)

	if (chain === "BASE") {
		fullDescription = `
# ${tokenName}
URL on launchpad: ${tokenUrl ?? "N/A"}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}
Launch status: ${status}

## Token details and tokenomics
${tokenAddress ? `Token address: ${getAddress(tokenAddress)}\n` : ""}${tokenAddress ? `Top holders: https://basescan.org/token/${getAddress(tokenAddress)}#balances\n` : ""}${liquidityContract ? `Liquidity contract: https://basescan.org/address/${liquidityContract}#asset-tokens\n` : ""}Token symbol: $${launchDetail.symbol}
Token supply: 1 billion
${creatorInitialTokensLine ? `Creator initial number of tokens: ${creatorInitialTokensLine}\n` : ""}
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
Launch status: ${status}

## Token details and tokenomics
${tokenAddress ? `Token address: ${tokenAddress}\n` : ""}${tokenAddress ? `Top holders: https://solscan.io/token/${tokenAddress}#holders\n` : ""}${liquidityContract ? `Liquidity contract: https://solscan.io/account/${liquidityContract}\n` : ""}Token symbol: $${launchDetail.symbol}
Token supply: 1 billion
${creatorInitialTokensLine ? `Creator initial number of tokens: ${creatorInitialTokensLine}\n` : ""}
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

	// Removed old token calculation block (lines 456-526) as it's now consolidated above.

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
		creatorInitialTokensHeld: dbCreatorInitialTokensHeldRaw,
		creatorTokenHoldingPercentage: dbCreatorTokenHoldingPercentage,
		tokensForSale: dbTokensForSaleRaw,
		totalTokenSupply: totalSupply, // This 'totalSupply' is from the consolidated block
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
