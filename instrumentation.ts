// This function is called once when the server starts
// See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
	// We only want to run this setup in the Node.js environment (not edge, not client)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		// Dynamically import the listener and debug functions to ensure server-only code
		// is not bundled for the client/edge.
		const { startVirtualsBaseListener, debugFetchHistoricalEvents } =
			await import("./src/server/launchpads/virtuals-base");

		// Check if the debug flag is set for VIRTUALS Protocol (Base)
		if (process.env.DEBUG_VIRTUALS_BASE === "true") {
			await debugFetchHistoricalEvents(27964899n, 27964899n); // 27851258n to start from $ELENA
		} else {
			// Start the regular listener if not debugging
			startVirtualsBaseListener();
		}

		// Potentially start other listeners here in the future
	}
}
