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

		// Check if the debug flag is set for VIRTUALS Protocol (Base)
		if (process.env.DEBUG_VIRTUALS_BASE === "true") {
			await debugFetchHistoricalEvents(28395743n, 28395743n);
			// 27851258n to start from $ELENA
			// 27886349n $NOODS graduated
			// 28159722n $DOOD has two links in the description
		} else {
			// Start the regular listener if not debugging
			startVirtualsBaseListener();
		}
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
