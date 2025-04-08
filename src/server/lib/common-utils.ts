import {
	type LaunchpadLinkGenerator,
	extractUrls,
	fetchFirecrawlContent,
	fetchUrlContent,
	formatFetchedContent,
} from "~/lib/content-utils";

/**
 * Fetches additional content from relevant links for a launchpad
 * @param platformDescription The platform description to extract links from
 * @param creatorAddress The creator's address for custom links
 * @param linkGenerator The launchpad-specific link generator
 */
export async function fetchAdditionalContent(
	platformDescription: string,
	creatorAddress: string,
	linkGenerator: LaunchpadLinkGenerator,
): Promise<string> {
	const contents: Array<{ url: string; content: string; name?: string }> = [];

	// Get URLs from platform description
	const descriptionUrls = extractUrls(platformDescription);

	// Get custom links for this launchpad
	const customLinks = linkGenerator.getCustomLinks({
		creatorAddress,
	});

	// Log what we're going to fetch
	console.log(
		`Fetching ${descriptionUrls.length} URLs from description and ${customLinks.length} custom links`,
	);

	// Fetch content from all URLs
	const fetchPromises = [
		...descriptionUrls.map(async (url) => {
			// For description URLs, use auto-detection (crawl for websites, scrape for specific pages)
			const content = await fetchFirecrawlContent(url, {
				// Auto-detect mode based on URL
				maxPages: 12, // Limit to 12 pages max for website crawls
				formats: ["markdown"],
			});
			contents.push({ url, content });
		}),
		...customLinks.map(
			async ({ url, name, useFirecrawl, firecrawlOptions, formatOptions }) => {
				const content = useFirecrawl
					? await fetchFirecrawlContent(
							url,
							firecrawlOptions || {
								// Default options if none specified
								maxPages: 11,
								formats: ["markdown"],
							},
						)
					: await fetchUrlContent(url);
				contents.push({ url, content, name });
			},
		),
	];

	await Promise.all(fetchPromises);

	// Format the fetched content with default options
	return formatFetchedContent(contents, {
		includeUrls: true,
		combineContent: false,
		maxContentLength: 50000,
	});
}
