/**
 * Finds URLs in a string and returns an array of strings and link objects.
 * @param text The input string potentially containing URLs.
 * @returns An array where strings are plain text segments and objects represent links.
 */
export function linkify(
	text: string,
): (string | { type: "link"; url: string })[] {
	// Regex to find URLs (handles http, https, ftp, file protocols and www domains)
	// It captures the URL itself and ensures it's treated as a boundary word (\b)
	const urlRegex =
		/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/gi;
	const parts: (string | { type: "link"; url: string })[] = [];
	let lastIndex = 0;

	// Define the type for regex match results
	let match: RegExpExecArray | null = urlRegex.exec(text);

	// Iterate through all matches found by the regex
	while (match !== null) {
		const url = match[0]; // The matched URL string
		const index = match.index; // Starting index of the match

		// Add the text segment *before* the current match
		if (index > lastIndex) {
			parts.push(text.substring(lastIndex, index));
		}

		// Add the link object. Ensure 'www.' URLs get a protocol for the href.
		const href = url.startsWith("www.") ? `http://${url}` : url;
		parts.push({ type: "link", url: href });

		// Update the index for the next segment
		lastIndex = index + url.length;

		// Get the next match
		match = urlRegex.exec(text);
	}

	// Add any remaining text segment *after* the last match
	if (lastIndex < text.length) {
		parts.push(text.substring(lastIndex));
	}

	return parts;
}

// Standard decimals for different chains
export const EVM_DECIMALS = 18;
export const SVM_DECIMALS = 6; // Typical for Solana SPL

/**
 * Formats a pre-rounded token amount (string or BigInt) into a human-readable string with commas.
 * Assumes the input amount already has decimals removed.
 * @param amount The pre-rounded token balance as a string or BigInt.
 * @returns A formatted string with commas as thousand separators. Returns "0" if the amount is 0 or invalid.
 */
export function formatTokenBalance(amount: string | bigint): string {
	try {
		// Convert string amount to BigInt, handle potential commas
		const amountBigInt =
			typeof amount === "string" ? BigInt(amount.replace(/,/g, "")) : amount;

		// If the value is 0, return "0"
		if (amountBigInt === 0n) {
			return "0";
		}

		// Format with commas
		return amountBigInt.toLocaleString("en-US");
	} catch (error) {
		console.error("Error formatting token balance:", error, "Input:", amount);
		// Return "0" or some error indicator if conversion fails
		return "0";
	}
}

/**
 * Calculates a percentage using BigInt values and returns it as a number with 2 decimal places.
 * @param numerator The top number in the fraction (BigInt)
 * @param denominator The bottom number in the fraction (BigInt)
 * @returns An object containing the percentage as a number and a formatted string, or null if calculation fails
 */
export function calculateBigIntPercentage(
	numerator: bigint,
	denominator: bigint,
): {
	percent: number;
	formatted: string;
} | null {
	if (denominator <= 0n) {
		return null;
	}

	try {
		// Calculate in basis points (scaled by 10000) for precision
		const percentageBasisPoints = (numerator * 10000n) / denominator;
		const percent = Number(percentageBasisPoints) / 100;
		return {
			percent,
			formatted: `${percent.toFixed(2)}%`,
		};
	} catch (error) {
		console.error("Error calculating percentage:", error);
		return null;
	}
}
