import "server-only";
import { Connection } from "@solana/web3.js";
import { Helius } from "helius-sdk";
import { env } from "~/env";

let connection: Connection | null = null;
let heliusClient: Helius | null = null;

const HELIUS_HTTP_BASE_URL = "https://mainnet.helius-rpc.com";
const HELIUS_WSS_BASE_URL = "wss://mainnet.helius-rpc.com";

/**
 * Returns a singleton Solana Connection instance for all RPC and WebSocket needs.
 * Always uses HTTPS endpoint for @solana/web3.js Connection (required).
 * Logs the endpoint for debugging.
 */
export function getConnection(): Connection {
	if (!connection) {
		const rpcUrl = `${HELIUS_HTTP_BASE_URL}/?api-key=${env.HELIUS_API_KEY}`;
		connection = new Connection(rpcUrl, "confirmed");
		console.log("Solana Connection initialized with Helius RPC URL:", rpcUrl);
	}
	return connection;
}

/**
 * Returns a singleton Helius SDK client instance.
 */
export function getHeliusClient(): Helius {
	if (!heliusClient) {
		heliusClient = new Helius(env.HELIUS_API_KEY);
		console.log("Helius SDK client initialized successfully.");
	}
	return heliusClient;
}

/**
 * Returns the correct WebSocket URL for Helius (for use in custom WS clients, not @solana/web3.js Connection).
 */
export function getHeliusWebSocketUrl(): string {
	const wsUrl = `${HELIUS_WSS_BASE_URL}/?api-key=${env.HELIUS_API_KEY}`;
	console.log("Helius WebSocket URL:", wsUrl);
	return wsUrl;
}
