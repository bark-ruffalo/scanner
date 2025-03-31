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
 * Fetches and extracts clean content from a URL using Firecrawl API.
 * @param url The URL to scrape content from
 * @returns The cleaned markdown content
 */
export async function fetchFirecrawlContent(url: string): Promise<string> {
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

		console.log(`Fetching content via Firecrawl: ${url}`);
		const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
			},
			body: JSON.stringify({
				url,
				formats: ["markdown"],
			}),
		});

		if (!response.ok) {
			console.error(`Firecrawl API error: ${response.status}`);
			return `Firecrawl API error: ${response.status}`;
		}

		const data = await response.json();
		return data.data?.markdown || "No content extracted";
	} catch (error) {
		console.error(`Firecrawl API exception: ${error}`);
		return `Error fetching content with Firecrawl: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Formats fetched content into the required section format.
 * @param contents Array of {url, content} pairs
 * @returns Formatted string with all contents
 */
export function formatFetchedContent(
	contents: Array<{ url: string; content: string }>,
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

	const formattedContents = validContents
		.map(({ url, content }) => {
			return `""" ${url}\n${content}\n"""`;
		})
		.join("\n\n");

	return `<extracted_info>\n${formattedContents}\n</extracted_info>`;
}

/**
 * Interface for defining custom link generators for a launchpad
 */
export interface LaunchpadLinkGenerator {
	getCustomLinks: (params: Record<string, string>) => Array<{
		url: string;
		useFirecrawl?: boolean; // If true, use Firecrawl API, otherwise use simple fetch
	}>;
}
