import { env } from "~/env";

// Debug mode Telegram group ID
const DEBUG_GROUP_ID = "-1002485551643";

/**
 * Sends a formatted message to a specific Telegram topic in a group
 * @param message The message to send (supports MarkdownV2 formatting)
 * @param groupId The Telegram group ID (overridden in debug mode)
 * @param topicId Optional topic ID within the group (ignored in debug mode)
 * @returns Promise that resolves when message is sent
 */
export async function sendTelegramMessage(
	message: string,
	groupId: string | number,
	topicId?: string,
) {
	const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

	// In debug/development mode, use the debug group and ignore topic
	const isDebug = env.NODE_ENV === "development";
	const targetGroupId = isDebug ? DEBUG_GROUP_ID : groupId;

	// Format group ID to include -100 prefix if needed
	const formattedGroupId = String(targetGroupId).startsWith("-100")
		? targetGroupId
		: String(targetGroupId).startsWith("-")
			? `-100${targetGroupId.toString().substring(1)}`
			: `-100${targetGroupId}`;

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

	// Only add topic_id in production mode
	if (!isDebug && topicId) {
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

	// Log where the message was sent
	console.log(
		`Sent Telegram notification to ${isDebug ? "debug" : "production"} group (${formattedGroupId})${isDebug ? "" : ` topic ${topicId ?? "N/A"}`}`,
	);

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
