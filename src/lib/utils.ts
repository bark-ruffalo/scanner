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
	let match;

	// Iterate through all matches found by the regex
	while ((match = urlRegex.exec(text)) !== null) {
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
	}

	// Add any remaining text segment *after* the last match
	if (lastIndex < text.length) {
		parts.push(text.substring(lastIndex));
	}

	return parts;
}
