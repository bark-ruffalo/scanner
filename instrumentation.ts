// This function is called once when the server starts
// See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
	// We only want to run this setup in the Node.js environment (not edge, not client)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		// Dynamically import the listener function to ensure server-only code
		// is not bundled for the client/edge.
		const { startVirtualsBaseListener } = await import(
			"./src/server/launchpads/virtuals-base"
		);

		// Start the listener
		startVirtualsBaseListener();

		// Potentially start other listeners here in the future
		// const { startAnotherListener } = await import('./src/server/launchpads/another-launchpad');
		// startAnotherListener();
	}
}
