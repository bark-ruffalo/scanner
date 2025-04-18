import "server-only";
import { Connection } from "@solana/web3.js";
import { env } from "~/env";

let connection: Connection | null = null;

const HELIUS_RPC_BASE_URL = "mainnet.helius-rpc.com";

/**
 * Returns a singleton Solana Connection instance for all RPC and WebSocket needs.
 * Constructs the URL using the HELIUS_API_KEY environment variable.
 */
export function getConnection(): Connection {
	if (!connection) {
		const rpcUrl = `https://${HELIUS_RPC_BASE_URL}/?api-key=${env.HELIUS_API_KEY}`;
		// console.log("Initializing Solana HTTPS connection:", rpcUrl);
		connection = new Connection(rpcUrl, "confirmed");
	}
	return connection;
}
