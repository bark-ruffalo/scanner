import "server-only";
import { fetchUrlContent } from "~/lib/content-utils";
import { calculateBigIntPercentage } from "~/lib/utils";

/**
 * API response structure for Virtuals Protocol token information
 */
interface VirtualsTokenResponse {
	data: Array<{
		id: number;
		uid: string;
		createdAt: string;
		walletAddress: string;
		name: string;
		description: string;
		symbol: string;
		preToken: string;
		preTokenPair: string;
		chain: string;
		image?: {
			url: string;
		};
		socials?: {
			USER_LINKS?: Record<string, string>;
			VERIFIED_LINKS?: Record<string, string>;
		};
		creator?: {
			username: string;
			email: string;
			displayName: string | null;
			socials: {
				VERIFIED_LINKS?: Record<string, string>;
			};
			socialCount: number;
			id: number;
			userSocials: Array<{
				walletAddress: string;
			}>;
		};
	}>;
	meta: {
		pagination: {
			page: number;
			pageSize: number;
			pageCount: number;
			total: number;
		};
	};
}

/**
 * Structure for the extracted Virtuals token information
 */
export interface VirtualsTokenInfo {
	description: string;
	imageUrl: string | null;
	name: string;
	symbol: string;
	socials: string;
	creator: string;
	pairAddress: string | null;
	chain: string;
}

/**
 * Fetches the list of holders for a Virtuals Protocol token using the API endpoint.
 * @param tokenAddress The token address (Base or Solana)
 * @returns Array of [address, amount] tuples
 */
export async function getVirtualsTokenHolders(
	tokenAddress: string,
): Promise<Array<[string, number]>> {
	const apiUrl = `https://api.virtuals.io/api/tokens/${tokenAddress}/holders`;
	try {
		const responseContent = await fetchUrlContent(apiUrl);
		const parsed = JSON.parse(responseContent);
		if (Array.isArray(parsed.data)) {
			return parsed.data as Array<[string, number]>;
		}
		return [];
	} catch (error) {
		console.error(`Error fetching holders for token ${tokenAddress}:`, error);
		return [];
	}
}

/**
 * Returns the number of tokens held by a specific address and the percentage of total supply (1B tokens).
 * @param address The address to check
 * @param tokenAddress The token address
 * @returns { amount: bigint, percentage: number }
 */
export async function getAddressTokenHolding(
	address: string,
	tokenAddress: string,
): Promise<{
	amount: bigint;
	percentage: number;
	formattedPercentage: string;
}> {
	const holders = await getVirtualsTokenHolders(tokenAddress);
	const entry = holders.find(
		([addr]) => addr.toLowerCase() === address.toLowerCase(),
	);
	const amount = entry ? BigInt(Math.ceil(entry[1])) : 0n;
	const percentObj = calculateBigIntPercentage(amount, 1000000000n);
	return {
		amount,
		percentage: percentObj ? percentObj.percent : 0,
		formattedPercentage: percentObj ? percentObj.formatted : "N/A",
	};
}

// /**
//  * Extracts information for a Virtuals Protocol token using its address
//  * @param tokenAddress The token address to look up
//  * @returns An object containing the extracted token information or null if not found
//  */
// export async function fetchVirtualsTokenInfo(
// 	tokenAddress: string,
// ): Promise<VirtualsTokenInfo | null> {
// 	try {
// 		// Construct the API URL with the token address
// 		const apiUrl = `https://api.virtuals.io/api/virtuals?filters[preToken]=${tokenAddress}&pagination[page]=1&pagination[pageSize]=1`;
//
// 		console.log(`Fetching Virtuals Protocol info for token: ${tokenAddress}`);
//
// 		// Fetch the content using the simple fetch utility
// 		const responseContent = await fetchUrlContent(apiUrl);
//
// 		// Parse the JSON response
// 		const responseData = JSON.parse(responseContent) as VirtualsTokenResponse;
//
// 		// Check if we have any results
// 		if (!responseData.data || responseData.data.length === 0) {
// 			console.log(`No Virtuals Protocol data found for token: ${tokenAddress}`);
// 			return null;
// 		}
//
// 		// Extract the first (and should be only) result
// 		const tokenInfo = responseData.data[0];
//
// 		// Ensure tokenInfo is defined
// 		if (!tokenInfo) {
// 			console.log(`Token info is undefined for token: ${tokenAddress}`);
// 			return null;
// 		}
//
// 		// Format socials as JSON string
// 		const socialsJson = JSON.stringify(tokenInfo.socials || {}, null, 2);
//
// 		// Format creator as JSON string
// 		const creatorJson = JSON.stringify(tokenInfo.creator || {}, null, 2);
//
// 		return {
// 			description: tokenInfo.description || "No description available",
// 			imageUrl: tokenInfo.image?.url || null,
// 			name: tokenInfo.name || "Unknown",
// 			symbol: tokenInfo.symbol || "UNKNOWN",
// 			socials: socialsJson,
// 			creator: creatorJson,
// 			pairAddress: tokenInfo.preTokenPair || null,
// 			chain: tokenInfo.chain || "UNKNOWN",
// 		};
// 	} catch (error) {
// 		console.error(
// 			`Error fetching Virtuals Protocol info for ${tokenAddress}:`,
// 			error,
// 		);
// 		return null;
// 	}
// }
//
// /**
//  * Formats Virtuals Protocol information for inclusion in the launch description
//  * @param tokenInfo The token information object returned by fetchVirtualsTokenInfo
//  * @returns A formatted string ready to be included in the launch description
//  */
// export function formatVirtualsInfo(tokenInfo: VirtualsTokenInfo): string {
// 	try {
// 		// Destructure the values to ensure we're safely accessing properties
// 		const { description, socials, creator } = tokenInfo;
//
// 		return `## Description at launch
// ${description}
//
// ## Social Links
// ${socials}
//
// ## Creator Information
// ${creator}
// `.trim();
// 	} catch (error) {
// 		console.error("Error formatting Virtuals Protocol information:", error);
// 		return "Error formatting Virtuals Protocol information";
// 	}
// }
