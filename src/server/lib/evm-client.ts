import "server-only";
import {
	http,
	type Chain,
	type PublicClient,
	type Transport,
	createPublicClient,
	webSocket,
} from "viem";
import { base } from "viem/chains";
import { env } from "~/env";

/**
 * Creates a web socket transport for the specified URL
 * Falls back to HTTP transport if web socket is not available
 */
export function createTransport(wsUrl?: string) {
	// Use the provided URL or get it from env
	const rpcUrl = wsUrl || env.BASE_RPC_URL;

	if (rpcUrl?.startsWith("wss://")) {
		try {
			return webSocket(rpcUrl);
		} catch (error) {
			console.warn(`Failed to create WebSocket transport: ${error}`);
			// Fall back to HTTP if WebSocket fails
			return http(rpcUrl.replace("wss://", "https://"));
		}
	}

	// Default to HTTP
	return http(
		rpcUrl?.replace("wss://", "https://") ||
			"https://base-mainnet.g.alchemy.com",
	);
}

// Create HTTP transport
const httpTransport = createTransport(
	env.BASE_RPC_URL?.replace("wss://", "https://"),
);

// Create a shared public client for Base network
export const publicClient: PublicClient = createPublicClient<Transport, Chain>({
	chain: base,
	transport: httpTransport,
});

// For WebSocket connections (real-time events)
export function createWebSocketClient() {
	// Only create WebSocket client if a valid WebSocket URL is available
	if (env.BASE_RPC_URL?.startsWith("wss://")) {
		try {
			const wsTransport = webSocket(env.BASE_RPC_URL);
			return createPublicClient<Transport, Chain>({
				chain: base,
				transport: wsTransport,
			});
		} catch (error) {
			console.error("Failed to create WebSocket client:", error);
			return publicClient; // Fall back to HTTP client
		}
	}
	return publicClient; // Fall back to HTTP client
}
