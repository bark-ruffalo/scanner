import * as Sentry from "@sentry/nextjs";

export async function register() {
	console.log("Instrumentation register() function called");

	if (process.env.NEXT_RUNTIME === "nodejs") {
		console.log("Running in Node.js environment");

		// Import Sentry server config
		await import("../sentry.server.config");

		// Import and start Virtuals listener
		const { startVirtualsListener } = await import(
			"./server/launchpads/virtuals"
		);

		// Always start the regular consolidated listener
		console.log(
			"[Instrumentation] Starting consolidated Virtuals Protocol listener.",
		);
		startVirtualsListener();
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
