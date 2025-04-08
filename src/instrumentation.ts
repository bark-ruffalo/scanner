import * as Sentry from "@sentry/nextjs";

export async function register() {
	console.log("Instrumentation register() function called");

	if (process.env.NEXT_RUNTIME === "nodejs") {
		console.log("Running in Node.js environment");

		// Import Sentry server config
		await import("../sentry.server.config");

		// Import and start Virtuals listeners
		const { startVirtualsBaseListener, debugFetchHistoricalEvents } =
			await import("./server/launchpads/virtuals-base");

		// Import Solana listeners
		const {
			startVirtualsSolanaListener,
			debugFetchHistoricalEvents: debugSolanaEvents,
		} = await import("./server/launchpads/virtuals-solana");

		// Check if the debug flag is set for VIRTUALS Protocol (Base)
		if (process.env.DEBUG_VIRTUALS_BASE === "true") {
			await debugFetchHistoricalEvents(28159722n, 28159722n);
			// 27851258n to start from $ELENA
			// 27886349n $NOODS graduated
			// 28159722n $DOOD has two links in the description
		} else {
			// Start the regular listener if not debugging
			startVirtualsBaseListener();
		}

		// Check if the debug flag is set for VIRTUALS Protocol (Solana)
		if (process.env.DEBUG_VIRTUALS_SOLANA === "true") {
			await debugSolanaEvents(321054255n);
			// 321054255n starting from $PANGOLIN
			// 330593934n AgentM still holds tokens
			// 330007631n $ONE has link in the description https://app.virtuals.io/prototypes/Hx1XZLXZKzSUHmeiDzkfFjSuYrEcYrcQpdSLjxwPvirt
			// The listener will automatically start after debugging finishes
		} else {
			// Start the regular Solana listener if not debugging
			startVirtualsSolanaListener();
		}
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
