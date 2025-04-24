import { env } from "~/env";

/**
 * Sends a formatted message to a specific Telegram topic in a group
 * @param message The message to send (supports MarkdownV2 formatting)
 * @param groupId The Telegram group ID
 * @param topicId Optional topic ID within the group
 * @returns Promise that resolves when message is sent
 */
export async function sendTelegramMessage(
	message: string,
	groupId: string | number,
	topicId?: string,
) {
	const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

	// Format group ID to include -100 prefix if needed
	const formattedGroupId = String(groupId).startsWith("-100")
		? groupId
		: String(groupId).startsWith("-")
			? `-100${groupId.toString().substring(1)}`
			: `-100${groupId}`;

	const messageData: {
		chat_id: string | number;
		text: string;
		parse_mode: string;
		message_thread_id?: string;
	} = {
		chat_id: formattedGroupId,
		text: message,
		parse_mode: "MarkdownV2",
	};

	if (topicId) {
		messageData.message_thread_id = topicId;
	}

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(messageData),
	});

	const data = await response.json();
	if (!data.ok) {
		console.error("Failed to send Telegram message:", data);
		throw new Error(`Telegram API error: ${data.description}`);
	}

	return data.result;
}

/**
 * Formats a launch notification message for Telegram
 * Escapes special characters for MarkdownV2 format
 */
export function formatLaunchNotification(
	title: string,
	url: string,
	summary: string,
	analysis: string,
	rating: number,
) {
	// Escape special characters for MarkdownV2
	const escapeMarkdown = (text: string) =>
		text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");

	return `🚀 *New Launch Detected\\!*

*${escapeMarkdown(title)}*

🔗 [View Launch](${escapeMarkdown(url)})

📝 *Summary:*
${escapeMarkdown(summary)}

🔍 *Analysis:*
${escapeMarkdown(analysis)}

⭐ *Rating:* ${rating}/10`;
}
