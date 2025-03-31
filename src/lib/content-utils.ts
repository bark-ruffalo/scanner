import { ConsoleLogWriter } from "drizzle-orm";
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
		console.log("Fetching content with simple fetch from:", url);

		const response = await fetch(url, {
			headers: {
				Accept: "application/json, text/plain, */*",
				"User-Agent": "Scanner/1.0", // Identify our app
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
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

// Interface for Firecrawl page response structure
interface FirecrawlPage {
	url: string;
	data?: {
		markdown?: string;
		html?: string;
		[key: string]: unknown;
	};
}

// Interface for Firecrawl page response with flexible structure
interface FlexibleFirecrawlPage {
	url?: string;
	data?: {
		markdown?: string;
		html?: string;
		data?: {
			markdown?: string;
			html?: string;
		};
		formats?: {
			markdown?: string;
			html?: string;
		};
	};
	formats?: {
		markdown?: string;
		html?: string;
	};
	markdown?: string;
	html?: string;
	[key: string]: unknown;
}

// Define an interface for Firecrawl API responses
interface FirecrawlResponse {
	success: boolean;
	error?: string;
	id?: string;
	url?: string;
	status?: string;
	pages?: FlexibleFirecrawlPage[];
	data?: {
		markdown?: string;
		data?: {
			markdown?: string;
		};
		formats?: {
			markdown?: string;
		};
	};
	markdown?: string;
	formats?: {
		markdown?: string;
	};
	[key: string]: unknown;
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
 * Fetches and extracts clean content from a URL using Firecrawl API.
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
	try {
		// Skip URLs that are likely to cause issues
		if (url.includes("twitter.com") || url.includes("x.com")) {
			console.warn("Skipping social media URL: requires authentication");
			return `Skipped social media URL (${url}) - requires authentication`;
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
			// Add crawl-specific options - exactly match the Node.js example
			requestBody = {
				url,
				limit: maxPages,
				scrapeOptions: {
					formats,
				},
			};
		} else {
			// For scrape, use the formats at the top level
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

		// Use let instead of const for data since we might replace it later
		let data = await response.json();

		if (!data.success) {
			console.error(`Firecrawl API error: ${data.error || "Unknown error"}`);
			return `Firecrawl API error: ${data.error || "Unknown error"}`;
		}

		// Check if we got an asynchronous job response (contains 'id' and 'url' for results)
		if (shouldCrawl && data.id && data.url && typeof data.url === "string") {
			console.log(
				`Received crawl job ID: ${data.id}, fetching results from: ${data.url}`,
			);

			// Make up to 3 attempts to fetch the results with increasing delay
			let resultData = null;
			let attempts = 0;
			const maxAttempts = 6;

			while (attempts < maxAttempts) {
				// Wait before retrying - 2s, 4s, 8s (use ** instead of Math.pow)
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

					resultData = await resultResponse.json();

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

		// Process different response types based on endpoint
		if (shouldCrawl) {
			return handleCrawlResponse(data, url);
		}

		return handleScrapeResponse(data);
	} catch (error) {
		console.error(`Firecrawl API exception: ${error}`);
		return `Error fetching content with Firecrawl: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handles the response from a crawl request
 */
function handleCrawlResponse(
	data: FirecrawlResponse,
	originalUrl: string,
): string {
	// Dump the whole response structure for debugging
	console.log(
		`Crawl response structure: ${JSON.stringify(data).substring(0, 500)}...`,
	);

	// For crawl, we have two possibilities:
	// 1. Complete response with pages array
	if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
		console.log(`Crawl returned ${data.pages.length} pages`);

		// Dump first page structure to see what it looks like
		if (data.pages.length > 0) {
			const firstPage = data.pages[0];
			console.log(
				`First page structure: ${JSON.stringify(firstPage).substring(0, 300)}...`,
			);
		}

		// Correctly navigate the structure based on examples in the documentation
		const markdownPages = data.pages
			.filter((page: FlexibleFirecrawlPage) => {
				// We need to correctly identify where the markdown content is
				return (
					// Try all possible locations based on documentation
					page.data?.markdown ||
					page.data?.formats?.markdown ||
					page.formats?.markdown ||
					page.markdown ||
					// V0 structure where markdown is directly in the page
					page.markdown ||
					// Try to find markdown in nested data structure
					(page.data &&
						typeof page.data === "object" &&
						"markdown" in page.data)
				);
			})
			.map((page: FlexibleFirecrawlPage) => {
				const pageUrl = page.url || originalUrl;
				// Extract markdown from the correct location
				let markdown =
					page.data?.markdown ||
					page.data?.formats?.markdown ||
					page.formats?.markdown ||
					page.markdown ||
					"";

				// Handle V0 API structure if markdown is not found in above paths
				if (!markdown && page.data && typeof page.data === "object") {
					// Handle case where data is an array (V0 API)
					if (Array.isArray(page.data)) {
						// Look for markdown in each array item
						for (const item of page.data) {
							if (item && typeof item === "object" && "markdown" in item) {
								markdown = item.markdown as string;
								break;
							}
						}
					} else if ("markdown" in page.data) {
						// Direct property in data object
						markdown = page.data.markdown as string;
					}
				}

				return `## ${pageUrl}\n\n${markdown}`;
			});

		if (markdownPages.length > 0) {
			return markdownPages.join("\n\n");
		}

		// Check for V0 API structure where data is an array at the top level
		if (data.data && Array.isArray(data.data)) {
			const markdownFromDataArray = data.data
				.filter(
					(item) => item && typeof item === "object" && "markdown" in item,
				)
				.map((item) => {
					const pageUrl = (item.metadata?.sourceURL as string) || originalUrl;
					return `## ${pageUrl}\n\n${item.markdown as string}`;
				});

			if (markdownFromDataArray.length > 0) {
				return markdownFromDataArray.join("\n\n");
			}
		}

		// If we got pages but couldn't extract markdown, try an alternative structure
		// For some API versions, the content might be directly in the response
		if (data.markdown) {
			return data.markdown;
		}

		// Last resort, try to extract content from raw HTML if available
		const pagesWithHtml = data.pages
			.filter(
				(page: FlexibleFirecrawlPage) =>
					page.data?.html ||
					page.data?.formats?.html ||
					page.formats?.html ||
					page.html,
			)
			.map((page: FlexibleFirecrawlPage) => {
				const pageUrl = page.url || originalUrl;
				const html =
					page.data?.html ||
					page.data?.formats?.html ||
					page.formats?.html ||
					page.html ||
					"";

				// Basic HTML to markdown conversion
				const markdown = html
					.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
					.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
					.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
					.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
					.replace(/<br\s*\/?>/gi, "\n")
					.replace(/<(?:.|\n)*?>/gm, "") // Remove remaining HTML tags
					.replace(/&nbsp;/gi, " ")
					.replace(/\n{3,}/g, "\n\n"); // Replace multiple newlines with double newlines

				return `## ${pageUrl}\n\n${markdown}`;
			});

		if (pagesWithHtml.length > 0) {
			return pagesWithHtml.join("\n\n");
		}
	}

	// 2. If pages array is empty or non-existent, check for top-level data
	if (data.data && typeof data.data === "object") {
		console.log(
			`Checking top-level data structure: ${JSON.stringify(data.data).substring(0, 300)}...`,
		);

		// Check if data is an array (V0 API structure)
		if (Array.isArray(data.data)) {
			const markdownFromDataArray = data.data
				.filter(
					(item) => item && typeof item === "object" && "markdown" in item,
				)
				.map((item) => {
					const pageUrl = (item.metadata?.sourceURL as string) || originalUrl;
					return `## ${pageUrl}\n\n${item.markdown as string}`;
				});

			if (markdownFromDataArray.length > 0) {
				return markdownFromDataArray.join("\n\n");
			}
		}

		// Try to extract from top level data
		const topLevelMarkdown =
			data.data?.markdown ||
			data.data?.formats?.markdown ||
			(data.data.data &&
				typeof data.data.data === "object" &&
				data.data.data.markdown);

		if (topLevelMarkdown) {
			return topLevelMarkdown;
		}
	}

	// Last resort, dump the entire response as text
	console.error(
		"Failed to extract markdown from crawl response. Response structure:",
		data,
	);
	return `No markdown found in crawl response. Raw data received from API:\n${JSON.stringify(data, null, 2).substring(0, 1000)}...`;
}

/**
 * Handles the response from a scrape request
 */
function handleScrapeResponse(data: FirecrawlResponse): string {
	// First try the V1 structure
	if (data.data?.markdown) {
		return data.data.markdown;
	}

	// Then try alternative structures
	const markdown =
		data.data?.data?.markdown ||
		data.data?.formats?.markdown ||
		data.formats?.markdown ||
		data.markdown;

	if (markdown) {
		return markdown;
	}

	// If we got here, we couldn't extract markdown - output the response structure
	console.error(
		"Failed to extract markdown from response. Response structure:",
		`${JSON.stringify(data).substring(0, 500)}...`,
	);

	return `No markdown content found in API response. Raw data received:\n${JSON.stringify(data, null, 2).substring(0, 1000)}...`;
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
 * @param contents Array of {url, content} pairs
 * @param options Optional formatting options
 * @returns Formatted string with all contents
 */
export function formatFetchedContent(
	contents: Array<{ url: string; content: string }>,
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
	const processedContents = validContents.map(({ url, content }) => {
		let processedContent = content;
		if (maxLength && content.length > maxLength) {
			processedContent = `${content.substring(0, maxLength)}... (truncated)`;
		}
		return { url, content: processedContent };
	});

	// Format based on options
	let formattedContent: string;

	if (combineContent) {
		// Combine all content into a single string
		formattedContent = processedContents
			.map(({ url, content }) =>
				includeUrls ? `## ${url}\n\n${content}` : content,
			)
			.join("\n\n");
	} else {
		// Use triple quote format for each content item
		const formattedContents = processedContents
			.map(
				({ url, content }) =>
					`""" ${includeUrls ? `${url}\n` : ""}${content}\n"""`,
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
		useFirecrawl?: boolean; // If true, use Firecrawl API, otherwise use simple fetch
		firecrawlOptions?: FirecrawlOptions; // Options for Firecrawl if useFirecrawl is true
		formatOptions?: FormatOptions; // Options for formatting the content
	}>;
}
