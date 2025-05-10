import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import type { NewLaunchData } from "~/server/queries"; // type-only import
import { addLaunch } from "~/server/queries";
import type { LaunchpadLinkGenerator } from "~/lib/content-utils"; // type-only import
import {
	fetchUrlContent,
	extractUrls,
	fetchFirecrawlContent,
	formatFetchedContent,
} from "~/lib/content-utils";
import {
	EVM_DECIMALS,
	SVM_DECIMALS,
	calculateBigIntPercentage,
	formatTokenBalance,
} from "~/lib/utils";
import { getAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import { publicClient as evmPublicClient } from "~/server/lib/evm-client";
import { getConnection as getSolanaConnection } from "~/server/lib/svm-client";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";
import { updateSolanaTokenStatistics } from "~/server/lib/svm-utils";
import { fetchAdditionalContent as fetchContentUtil } from "~/server/lib/common-utils";
import { getMint } from "@solana/spl-token"; // For fetching mint info for total supply
import { getSolanaTokenBalance } from "~/server/lib/svm-utils"; // For fetching current balance

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
}

interface VirtualsLaunchDetail extends VirtualsLaunchListItem {
	description: string | null;
	overview: string | null;
	walletAddress: string | null;
	preToken: string | null;
	preTokenPair: string | null;
	socials?: Record<string, Record<string, string>> | null;
	creator?: VirtualsCreator | null;
	tokenomics?: Array<VirtualsTokenomic> | null;
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
		if (params.uid) {
			links.push({
				url: `https://app.virtuals.io/virtual/${params.uid}`,
				name: "Launch on Virtuals Protocol App",
				useFirecrawl: true,
			});
		} else if (params.launchpadSpecificId) {
			links.push({
				url: `https://app.virtuals.io/virtual/${params.launchpadSpecificId}`,
				name: "Launch on Virtuals Protocol App (by ID)",
				useFirecrawl: true,
			});
		}

		if (params.tokenAddress && params.chain) {
			if (params.chain.toUpperCase() === "SOLANA") {
				links.push({
					url: `https://solscan.io/token/${params.tokenAddress}`,
					name: "Token on Solscan",
					useFirecrawl: true,
					firecrawlOptions: { formats: ["markdown"], maxPages: 1 },
				});
			} else if (params.chain.toUpperCase() === "BASE") {
				links.push({
					url: `https://basescan.org/token/${params.tokenAddress}`,
					name: "Token on Basescan",
					useFirecrawl: true,
					firecrawlOptions: { formats: ["markdown"], maxPages: 1 },
				});
			}
		}
		return links;
	},
};

async function fetchLaunchDetails(
	launchId: number,
): Promise<VirtualsLaunchDetail | null> {
	try {
		const url = `${VIRTUALS_API_BASE_URL}/${launchId}?populate[0]=image&populate[1]=tokenomics&populate[2]=creator.userSocials&populate[3]=socials`;
		console.log(
			`[${LAUNCHPAD_NAME}] Fetching details for launch ID: ${launchId} from ${url}`,
		);
		const responseContent = await fetchUrlContent(url);
		const parsed = JSON.parse(
			responseContent,
		) as VirtualsApiResponse<VirtualsLaunchDetail>;
		return parsed.data;
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME}] Error fetching details for launch ID ${launchId}:`,
			error,
		);
		return null;
	}
}

async function processVirtualsLaunch(
	launchDetail: VirtualsLaunchDetail,
): Promise<void> {
	console.log(
		`[${LAUNCHPAD_NAME}] Processing launch: ${launchDetail.name} (${launchDetail.id})`,
	);

	const launchpadSpecificId = launchDetail.id.toString();

	const existingLaunch = await db.query.launches.findFirst({
		where: eq(launches.launchpadSpecificId, launchpadSpecificId),
	});

	if (existingLaunch) {
		// console.log(`[${LAUNCHPAD_NAME}] Launch ${launchDetail.name} (${launchpadSpecificId}) already exists. Skipping.`);
		return;
	}

	const title = `${launchDetail.name} ($${launchDetail.symbol || "N/A"})`;
	const launchUrl = `https://app.virtuals.io/virtual/${launchDetail.uid || launchDetail.id}`;
	const imageUrl =
		launchDetail.image?.formats?.thumbnail?.url ||
		launchDetail.image?.url ||
		null;
	const launchedAt = new Date(launchDetail.createdAt);
	const chain = launchDetail.chain?.toUpperCase();
	const status = launchDetail.status?.toUpperCase();

	let descriptionContent = launchDetail.description || "";
	if (launchDetail.overview) {
		descriptionContent += `\n\n## Overview\n${launchDetail.overview}`;
	}

	const creatorAddress = launchDetail.walletAddress;
	const tokenAddress =
		status === "UNDERGRAD" || status === "AVAILABLE"
			? launchDetail.preToken
			: null;

	// Parameters for the link generator are now implicitly passed via the generator's `params` argument
	// when `fetchContentUtil` calls `linkGenerator.getCustomLinks(params)`
	// The `fetchContentUtil` itself only takes 3 arguments.
	const fetchedInfo = await fetchContentUtil(
		descriptionContent,
		creatorAddress || "",
		virtualsLinkGenerator,
	);

	const fullDescription = `
${descriptionContent}

<socials_info>
${JSON.stringify(launchDetail.socials || {}, null, 2)}
</socials_info>

<creator_info>
${JSON.stringify(launchDetail.creator || {}, null, 2)}
</creator_info>

${fetchedInfo}

<full_details>
${JSON.stringify(launchDetail, null, 2)}
</full_details>
    `.trim();

	let creatorInitialTokensHeld: string | null = null;
	let tokensForSale: string | null = null;
	const totalSupply = "1000000000"; // Virtuals Protocol fixed supply is 1 billion

	if (status === "GENESIS" && launchDetail.tokenomics) {
		const devAllocation = launchDetail.tokenomics.find(
			(t) => t.name?.toLowerCase() === "developer" || t.isDefault === true,
		);
		if (devAllocation?.amount) {
			const amountBigInt = BigInt(devAllocation.amount);
			const decimals = chain === "SOLANA" ? SVM_DECIMALS : EVM_DECIMALS; // Assuming Genesis can be on Solana too
			creatorInitialTokensHeld = (
				amountBigInt / BigInt(10 ** decimals)
			).toString();
			const saleAmount = BigInt(totalSupply) - BigInt(creatorInitialTokensHeld);
			tokensForSale = saleAmount > 0n ? saleAmount.toString() : "0";
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
			creatorInitialTokensHeld = (
				mintInfo.supply / BigInt(10 ** mintInfo.decimals)
			).toString();
			tokensForSale = creatorInitialTokensHeld;
		} catch (e) {
			console.error(
				`[${LAUNCHPAD_NAME}] Could not fetch mint info for Solana preToken ${tokenAddress}: ${e}`,
			);
			creatorInitialTokensHeld = null;
			tokensForSale = null;
		}
	}

	const launchData: NewLaunchData = {
		launchpad: LAUNCHPAD_NAME,
		launchpadSpecificId,
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
			status === "GENESIS" || (chain === "BASE" && creatorInitialTokensHeld)
				? creatorInitialTokensHeld
				: null,
		tokensForSale,
		totalTokenSupply: totalSupply,
		summary: "-",
		analysis: "-",
		rating: -1,
		basicInfoUpdatedAt: new Date(),
		llmAnalysisUpdatedAt: new Date(),
		tokenStatsUpdatedAt: new Date(),
	};

	const addResult = await addLaunch(launchData);

	if (addResult === "inserted" || addResult === "updated") {
		if (
			tokenAddress &&
			creatorAddress &&
			(status === "UNDERGRAD" || status === "AVAILABLE")
		) {
			try {
				console.log(`[${LAUNCHPAD_NAME}] Updating token stats for ${title}...`);
				if (chain === "BASE") {
					let baseInitialTokens = launchData.creatorInitialTokensHeld;
					if (!baseInitialTokens) {
						console.warn(
							`[${LAUNCHPAD_NAME}] Initial token holding for Base non-Genesis ${title} is unknown. Stats may be incomplete.`,
						);
						baseInitialTokens = "0";
					}

					const stats = await updateEvmTokenStatistics(
						evmPublicClient,
						tokenAddress as `0x${string}`,
						creatorAddress as `0x${string}`,
						baseInitialTokens,
						undefined,
						(launchDetail.preTokenPair as `0x${string}`) || undefined,
					);
					await db
						.update(launches)
						.set({
							creatorTokensHeld: stats.creatorTokensHeld,
							creatorTokenHoldingPercentage:
								stats.creatorTokenHoldingPercentage,
							creatorTokenMovementDetails: stats.creatorTokenMovementDetails,
							sentToZeroAddress: stats.sentToZeroAddress ?? false,
							tokenStatsUpdatedAt: new Date(),
						})
						.where(eq(launches.launchpadSpecificId, launchpadSpecificId));
				} else if (chain === "SOLANA") {
					const solanaConnection = getSolanaConnection();
					const tokenMintPk = new PublicKey(tokenAddress);
					const creatorPk = new PublicKey(creatorAddress);

					let solInitialBalanceForStats = "0";
					let solCurrentBalanceRaw = 0n;

					try {
						const mintInfo = await getMint(solanaConnection, tokenMintPk);
						solInitialBalanceForStats = (
							mintInfo.supply / BigInt(10 ** mintInfo.decimals)
						).toString();

						solCurrentBalanceRaw = await getSolanaTokenBalance(
							solanaConnection,
							tokenMintPk,
							creatorPk,
						);
					} catch (balanceFetchError) {
						console.error(
							`[${LAUNCHPAD_NAME}] Error fetching balance/mint info for Solana stats ${title}:`,
							balanceFetchError,
						);
					}

					if (solInitialBalanceForStats !== "0" || solCurrentBalanceRaw > 0n) {
						const stats = await updateSolanaTokenStatistics(
							solanaConnection,
							tokenMintPk,
							creatorPk,
							solInitialBalanceForStats,
							solCurrentBalanceRaw,
						);
						await db
							.update(launches)
							.set({
								creatorTokensHeld: stats.creatorTokensHeld,
								creatorTokenHoldingPercentage:
									stats.creatorTokenHoldingPercentage,
								creatorTokenMovementDetails: stats.creatorTokenMovementDetails,
								sentToZeroAddress: stats.sentToZeroAddress ?? false,
								tokenStatsUpdatedAt: new Date(),
							})
							.where(eq(launches.launchpadSpecificId, launchpadSpecificId));
					} else {
						console.warn(
							`[${LAUNCHPAD_NAME}] Skipping Solana stats update for ${title} due to missing balance/mint info.`,
						);
					}
				}
			} catch (statsError) {
				console.error(
					`[${LAUNCHPAD_NAME}] Error updating token stats for ${title}:`,
					statsError,
				);
			}
		}
	}
}

export async function fetchAndProcessVirtualsLaunches() {
	console.log(`[${LAUNCHPAD_NAME}] Fetching latest launches...`);
	try {
		const url = `${VIRTUALS_API_BASE_URL}?filters[status]=3&sort[0]=createdAt%3Adesc&populate[0]=image&pagination[page]=1&pagination[pageSize]=20&isGrouped=1`;
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
			if (launchDetail) {
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

export async function debugVirtualsLaunchById(launchApiId: number | string) {
	console.log(
		`[${LAUNCHPAD_NAME}] Debugging launch with API ID: ${launchApiId}`,
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
		if (launchDetail) {
			const existingLaunch = await db.query.launches.findFirst({
				where: eq(launches.launchpadSpecificId, numericLaunchId.toString()),
			});
			if (existingLaunch) {
				console.log(
					`[${LAUNCHPAD_NAME}] Debug: Launch ${numericLaunchId} already exists. Consider deleting if re-processing is intended.`,
				);
				// Optionally delete for re-processing during debug:
				// await db.delete(launches).where(eq(launches.launchpadSpecificId, numericLaunchId.toString()));
				// console.log(`[${LAUNCHPAD_NAME}] Debug: Deleted existing launch ${numericLaunchId} for re-processing.`);
			}
			await processVirtualsLaunch(launchDetail);
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
