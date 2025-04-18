import "server-only";
import { Connection } from "@solana/web3.js";
import { env } from "~/env";

let connection: Connection | null = null;
let webSocketConnection: Connection | null = null;

const HELIUS_RPC_BASE_URL = "mainnet.helius-rpc.com";

/**
 * Returns a singleton Solana Connection instance for standard HTTPS RPC calls.
 * Constructs the URL using the HELIUS_API_KEY environment variable.
 */
export function getConnection(): Connection {
	if (!connection) {
		const rpcUrl = `https://${HELIUS_RPC_BASE_URL}/?api-key=${env.HELIUS_API_KEY}`;
		console.log("Initializing Solana HTTPS connection:", rpcUrl);
		connection = new Connection(rpcUrl, "confirmed");
	}
	return connection;
}

/**
 * Returns a singleton Solana Connection instance for WebSocket subscriptions.
 * Constructs the WSS URL using the HELIUS_API_KEY environment variable.
 *
 * Note: The Connection class doesn't expose methods to directly monitor WebSocket
 * connection status. The underlying WebSocket connection is managed internally
 * by the Connection class and will attempt to reconnect automatically if disconnected.
 */
export function createWebSocketConnection(): Connection {
	if (!webSocketConnection) {
		const wsRpcUrl = `wss://${HELIUS_RPC_BASE_URL}/?api-key=${env.HELIUS_API_KEY}`;
		console.log("Initializing Solana WebSocket connection:", wsRpcUrl);
		webSocketConnection = new Connection(wsRpcUrl, "confirmed");
	}
	return webSocketConnection;
}
