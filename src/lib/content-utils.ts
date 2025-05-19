import "server-only";
import { env } from "~/env";

/**
 * Extracts all URLs from a text string.
 * @param text The text to extract URLs from
 * @returns Array of unique URLs found in the text
 */
export function extractUrls(text: string): string[] {
	// Regex to find URLs (handles http, https, ftp, file protocols and www domains)
	const urlRegex =
		/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/gi;

	// Find all matches and ensure URLs are unique
	const matches = [...new Set(text.match(urlRegex) || [])];

	// Ensure www. URLs have a protocol
	return matches.map((url) => (url.startsWith("www.") ? `http://${url}` : url));
}

/**
 * Simple utility to fetch content from a URL.
 * @param url The URL to fetch content from
 * @returns The text content of the response
 */
export async function fetchUrlContent(url: string): Promise<string> {
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json, text/plain, */*",
				"User-Agent": "Scanner/1.0", // Identify our app
			},
		});

		if (!response.ok) {
			// Do not log errors for expected HTTP errors (like 404); let the caller handle them
			return `Error fetching content: HTTP error! status: ${response.status}`;
		}

		// Try to parse as JSON first
		try {
			const jsonData = await response.json();
			return JSON.stringify(jsonData, null, 2); // Pretty print JSON
		} catch {
			// If not JSON, return text content
			return await response.text();
		}
	} catch (error) {
		// Only log unexpected errors (network, etc.)
		console.error(`Error fetching ${url}:`, error);
		return `Error fetching content: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Options for fetching content with Firecrawl
 */
export interface FirecrawlOptions {
	forceMode?: "scrape" | "crawl"; // Force a specific mode
	maxPages?: number; // Maximum pages to crawl (default: 15)
	formats?: string[]; // Output formats (default: ["markdown"])
}

// Interface for Firecrawl V1 API response structure
interface FirecrawlResponse {
	success: boolean;
	error?: string;
	id?: string;
	url?: string;
	status?: string;
	pages?: Array<{
		url?: string;
		data?: {
			markdown?: string;
		};
	}>;
	data?: {
		markdown?: string;
	};
}

/**
 * Determines if a URL is likely a website homepage that should be crawled
 * rather than a specific page that should be scraped.
 */
function isWebsiteHomepage(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		// Check if the path is empty or just "/"
		const hasNoPath = parsedUrl.pathname === "/" || parsedUrl.pathname === "";
		// Check if there are no query parameters
		const hasNoQuery = parsedUrl.search === "";

		return hasNoPath && hasNoQuery;
	} catch {
		return false;
	}
}

/**
 * Fetches and extracts clean content from a URL using Firecrawl API V1.
 * Automatically decides between scraping a single URL or crawling a website.
 *
 * @param url The URL to scrape/crawl content from
 * @param options Optional configuration for the request
 * @returns The cleaned markdown content
 */
export async function fetchFirecrawlContent(
	url: string,
	options?: FirecrawlOptions,
): Promise<string> {
	console.warn(`fetchFirecrawlContent: ${url}`);
	try {
		const lowerUrl = url.toLowerCase();
		// Skip URLs that are likely to cause issues
		if (lowerUrl.includes("twitter.com") || lowerUrl.includes("x.com")) {
			console.warn("Skipping social media URL: requires authentication");
			return `Skipped social media URL (${url}) - requires authentication`;
		}

		// Skip images and other binary content
		if (
			lowerUrl.includes(".jpg") ||
			lowerUrl.includes(".jpeg") ||
			lowerUrl.includes(".png") ||
			lowerUrl.includes(".gif") ||
			lowerUrl.includes(".bmp") ||
			lowerUrl.includes(".pdf") ||
			lowerUrl.includes(".doc") ||
			lowerUrl.includes(".docx") ||
			lowerUrl.includes(".xls") ||
			lowerUrl.includes(".xlsx") ||
			lowerUrl.includes(".zip") ||
			lowerUrl.includes(".rar")
		) {
			console.warn("Skipping image/binary URL: likely not text content");
			return `Skipped image/binary URL (${url}) - likely not text content`;
		}

		// Skip Firecrawl API calls in development mode to save on API costs
		if (env.NODE_ENV === "development") {
			return `Skipped Firecrawl fetch in development mode for URL: ${url}`;
		}

		// Validate URL
		try {
			new URL(url);
		} catch {
			console.error("Invalid URL format");
			return `Invalid URL: ${url}`;
		}

		// Set defaults
		const maxPages = options?.maxPages ?? 15;
		const formats = options?.formats ?? ["markdown"];

		// Log the options object for debugging
		console.log("Firecrawl options:", JSON.stringify(options || {}, null, 2));

		// Determine if we should crawl or scrape
		let shouldCrawl = false;

		if (options?.forceMode) {
			// If mode is forced, use that
			shouldCrawl = options.forceMode === "crawl";
		} else {
			// Otherwise, crawl if it's a website homepage
			shouldCrawl = isWebsiteHomepage(url);
		}

		const endpoint = shouldCrawl ? "crawl" : "scrape";
		console.log(`Fetching content via Firecrawl ${endpoint}: ${url}`);

		// Build the request body based on whether we're crawling or scraping
		let requestBody: Record<string, unknown>;

		if (shouldCrawl) {
			requestBody = {
				url,
				limit: maxPages,
				scrapeOptions: {
					formats,
				},
			};
		} else {
			requestBody = {
				url,
				formats,
			};
		}

		const response = await fetch(`https://api.firecrawl.dev/v1/${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			console.error(`Firecrawl API error: ${response.status}`);
			return `Firecrawl API error: ${response.status}`;
		}

		let data = (await response.json()) as FirecrawlResponse;

		if (!data.success) {
			console.error(`Firecrawl API error: ${data.error || "Unknown error"}`);
			return `Firecrawl API error: ${data.error || "Unknown error"}`;
		}

		// Check if we got an asynchronous job response (contains 'id' and 'url' for results)
		if (shouldCrawl && data.id && data.url && typeof data.url === "string") {
			console.log(
				`Received crawl job ID: ${data.id}, fetching results from: ${data.url}`,
			);

			// Make attempts to fetch the results with exponential backoff
			let resultData = null;
			let attempts = 0;
			const maxAttempts = 6;

			while (attempts < maxAttempts) {
				// Wait before retrying - 2s, 4s, 8s, 16s, 32s, 64s
				const delay = attempts === 0 ? 2000 : 2 ** (attempts + 1) * 1000;
				console.log(
					`Waiting ${delay}ms before fetching crawl results (attempt ${attempts + 1}/${maxAttempts})...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));

				try {
					// Fetch the results from the provided URL
					const resultResponse = await fetch(data.url, {
						method: "GET",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
						},
					});

					if (!resultResponse.ok) {
						console.warn(
							`Crawl results not ready (status: ${resultResponse.status}), retrying...`,
						);
						attempts++;
						continue;
					}

					resultData = (await resultResponse.json()) as FirecrawlResponse;

					if (
						resultData.success &&
						(resultData.status === "complete" ||
							resultData.status === "completed")
					) {
						console.log(
							`Crawl job completed with ${resultData.pages?.length || 0} pages`,
						);
						break; // Success! Exit the loop
					}

					if (
						resultData.status === "pending" ||
						resultData.status === "processing" ||
						resultData.status === "scraping"
					) {
						console.log(
							`Crawl job still processing (status: ${resultData.status}), retrying...`,
						);
					} else {
						console.error(`Crawl job failed with status: ${resultData.status}`);
						return `Firecrawl crawl job failed: ${resultData.status}`;
					}
				} catch (error) {
					console.error(`Error fetching crawl results: ${error}`);
				}

				attempts++;
			}

			// Replace the original data with the result data if we got it
			if (resultData) {
				data = resultData;
				console.log(
					`Successfully fetched crawl results with status: ${data.status}`,
				);
			} else {
				return `Failed to fetch crawl results after ${maxAttempts} attempts`;
			}
		}

		// Process response based on endpoint
		if (shouldCrawl) {
			return handleCrawlResponse(data);
		}

		return handleScrapeResponse(data);
	} catch (error) {
		console.error(`Firecrawl API exception: ${error}`);
		return `Error fetching content with Firecrawl: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handles the response from a crawl request - simplified for V1 API
 */
function handleCrawlResponse(data: FirecrawlResponse): string {
	// Log structure for debugging
	console.log(
		`Crawl response structure: ${JSON.stringify(data).substring(0, 500)}...`,
	);

	// For crawl, we expect pages array with markdown content
	if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
		console.log(`Crawl returned ${data.pages.length} pages`);

		// Log first page structure
		if (data.pages.length > 0) {
			console.log(
				`First page structure: ${JSON.stringify(data.pages[0]).substring(0, 300)}...`,
			);
		}

		// Extract markdown from each page
		const markdownPages = data.pages
			.filter((page) => page.data?.markdown)
			.map((page) => {
				const pageUrl = page.url || "Unknown URL";
				const markdown = page.data?.markdown || "";
				return `## ${pageUrl}\n\n${markdown}`;
			});

		if (markdownPages.length > 0) {
			return markdownPages.join("\n\n");
		}
	}

	// Handle V1 API structure where data is an array
	if (data.data && Array.isArray(data.data) && data.data.length > 0) {
		console.log(`Crawl returned data array with ${data.data.length} items`);

		const markdownTexts = data.data
			.filter((item) => typeof item === "object" && item && "markdown" in item)
			.map((item) => {
				// Some implementations put URL in metadata.sourceURL
				const url = (item.metadata?.sourceURL as string) || "Unknown URL";
				return `## ${url}\n\n${item.markdown as string}`;
			});

		if (markdownTexts.length > 0) {
			return markdownTexts.join("\n\n");
		}
	}

	console.error("Failed to extract markdown from crawl response");
	return "No markdown content found in crawl response";
}

/**
 * Handles the response from a scrape request - simplified for V1 API
 */
function handleScrapeResponse(data: FirecrawlResponse): string {
	// For scrape, we expect markdown in data
	if (data.data?.markdown) {
		return data.data.markdown;
	}

	console.error("Failed to extract markdown from scrape response");
	return "No markdown content found in scrape response";
}

/**
 * Format options for fetched content
 */
export interface FormatOptions {
	includeUrls?: boolean; // Include URLs in the output (default: true)
	combineContent?: boolean; // Combine all content into a single string (default: false)
	maxContentLength?: number; // Maximum length for each content item (default: no limit)
}

/**
 * Formats fetched content into the required section format.
 * @param contents Array of {url, content, name?} pairs
 * @param options Optional formatting options
 * @returns Formatted string with all contents
 */
export function formatFetchedContent(
	contents: Array<{ url: string; content: string; name?: string }>,
	options?: FormatOptions,
): string {
	// Filter out empty or error-only contents
	const validContents = contents.filter(({ content }) => {
		const isError = content.startsWith("Error fetching content:");
		const isEmpty = content.trim() === "" || content === "No content extracted";
		return !isError && !isEmpty;
	});

	if (validContents.length === 0) {
		return ""; // Return empty string if no valid content
	}

	// Apply options
	const includeUrls = options?.includeUrls !== false; // Default to true
	const combineContent = options?.combineContent || false;
	const maxLength = options?.maxContentLength;

	// Apply max length if specified
	const processedContents = validContents.map(({ url, content, name }) => {
		let processedContent = content;
		if (maxLength && content.length > maxLength) {
			processedContent = `${content.substring(0, maxLength)}... (truncated)`;
		}
		return { url, content: processedContent, name };
	});

	// Format based on options
	let formattedContent: string;

	if (combineContent) {
		// Combine all content into a single string
		formattedContent = processedContents
			.map(({ url, content, name }) =>
				includeUrls
					? `## ${name ? `[${name}](${url})` : url}\n\n${content}`
					: content,
			)
			.join("\n\n");
	} else {
		// Use triple quote format for each content item
		const formattedContents = processedContents
			.map(
				({ url, content, name }) =>
					`""" ${includeUrls ? `${name ? `[${name}](${url})` : url}\n` : ""}${content}\n"""`,
			)
			.join("\n\n");

		formattedContent = `<fetched_info>\n${formattedContents}\n</fetched_info>`;
	}

	return formattedContent;
}

/**
 * Interface for defining custom link generators for a launchpad
 */
export interface LaunchpadLinkGenerator {
	getCustomLinks: (params: Record<string, string>) => Array<{
		url: string;
		name?: string; // Optional name for the URL to be displayed in the link
		useFirecrawl?: boolean; // If true, use Firecrawl API, otherwise use simple fetch
		firecrawlOptions?: FirecrawlOptions; // Options for Firecrawl if useFirecrawl is true
		formatOptions?: FormatOptions; // Options for formatting the content
	}>;
}
