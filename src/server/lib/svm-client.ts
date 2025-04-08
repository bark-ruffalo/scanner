import "server-only";
import { Connection } from "@solana/web3.js";
import { env } from "~/env";

// Cache the connection instance
let connection: Connection | null = null;

/**
 * Creates a Solana connection with retry and error handling
 * @returns Connection instance
 */
export function getConnection(): Connection {
	if (!connection) {
		const rpcUrl = env.SOLANA_RPC_URL?.replace("wss://", "https://");
		if (!rpcUrl) {
			throw new Error("SOLANA_RPC_URL environment variable is not set");
		}

		// Create connection with commitment level and timeout settings
		connection = new Connection(rpcUrl, {
			commitment: "confirmed",
			confirmTransactionInitialTimeout: 60000,
		});
	}

	return connection;
}

// Export a shared connection instance
export const publicConnection = getConnection();

// For WebSocket connections (real-time events)
export function createWebSocketConnection() {
	const rpcUrl = env.SOLANA_RPC_URL;
	if (!rpcUrl) {
		throw new Error("SOLANA_RPC_URL environment variable is not set");
	}

	try {
		// For Solana Connection:
		// 1. First parameter must be an HTTP/HTTPS URL
		// 2. wsEndpoint can be a WebSocket URL
		const httpUrl = rpcUrl.replace("wss://", "https://");
		const wsUrl = rpcUrl.startsWith("wss://")
			? rpcUrl
			: rpcUrl.replace("https://", "wss://");

		return new Connection(httpUrl, {
			commitment: "confirmed",
			wsEndpoint: wsUrl,
		});
	} catch (error) {
		console.error("Failed to create WebSocket connection:", error);
		return getConnection();
	}
}
