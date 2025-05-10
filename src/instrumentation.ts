import * as Sentry from "@sentry/nextjs";

export async function register() {
	console.log("Instrumentation register() function called");

	if (process.env.NEXT_RUNTIME === "nodejs") {
		console.log("Running in Node.js environment");

		// Import Sentry server config
		await import("../sentry.server.config");

		// Import and start Virtuals listener
		const { startVirtualsListener, debugVirtualsLaunchById } = await import(
			"./server/launchpads/virtuals"
		);

		// Check if a specific Virtuals launch ID is set for debugging
		const debugLaunchId = process.env.DEBUG_VIRTUALS_ID;
		if (debugLaunchId) {
			console.log(
				`[Instrumentation] Debugging Virtuals Protocol launch ID: ${debugLaunchId}`,
			);
			// Example: DEBUG_VIRTUALS_ID=22653 (Genesis on Base)
			// Example: DEBUG_VIRTUALS_ID=21809 (Undergrad on Solana)
			// Example: DEBUG_VIRTUALS_ID=12398 (Available on Base)
			await debugVirtualsLaunchById(debugLaunchId);
			// The debug function in virtuals.ts should handle whether to start the main listener afterwards if needed.
		} else {
			// Start the regular consolidated listener if not debugging a specific ID
			console.log(
				"[Instrumentation] Starting consolidated Virtuals Protocol listener.",
			);
			startVirtualsListener();
		}
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
