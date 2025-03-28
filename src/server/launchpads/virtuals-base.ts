import {
	type GetBlockReturnType, // Import type for getBlock
	type GetTransactionReturnType, // Import type for getTransaction
	type Log,
	// type TransactionReceipt, // No longer needed directly
	createPublicClient,
	formatUnits,
	getAddress,
	parseAbiItem,
	webSocket,
} from "viem";
import { base } from "viem/chains";
import { env } from "~/env";
import { addLaunch } from "~/server/queries"; // Import the function to add launch

// --- Configuration ---

// The on-chain address of the Virtuals Protocol factory contract on the Base network.
// This contract emits the 'Launched' event we are interested in.
const VIRTUALS_FACTORY_ADDRESS: `0x${string}` =
	"0xF66DeA7b3e897cD44A5a231c61B6B4423d613259"; // Address from python script

// A constant string identifying the launchpad for database storage and display purposes.
const LAUNCHPAD_NAME = "VIRTUALS Protocol (Base)";

// Define the Application Binary Interface (ABI) fragment for the 'Launched' event.
// Updated based on Basescan log 0x714aa39317ad9a7a7a99db52b44490da5d068a0b2710fffb1a1282ad3cadae1f
// Signature: Launched(address indexed token, address indexed pair, uint256 amount)
// Note: The name 'amount' for the uint256 is inferred; confirm if contract ABI is available.
const launchedEventAbi = parseAbiItem(
	"event Launched(address indexed token, address indexed pair, uint256 amount)", // Corrected ABI Signature
);

// Define ABI fragments for standard ERC20 token functions (name, symbol, decimals).
// These are used to fetch details about the newly launched token.
const erc20Abi = [
	parseAbiItem("function name() view returns (string)"),
	parseAbiItem("function symbol() view returns (string)"),
	parseAbiItem("function decimals() view returns (uint8)"),
] as const; // Use 'as const' for stricter type inference with viem

// --- Client Setup ---

// Create a WebSocket transport for the viem client.
// WebSockets are preferred for listening to real-time events.
// It reads the RPC URL from the environment variables. Ensure it starts with 'wss://'.
// Provides a fallback to the default Base mainnet WebSocket URL if the env var is not set.
const wsTransport = webSocket(env.BASE_RPC_URL || "wss://mainnet.base.org");
console.log(
	`Using WebSocket transport: ${
		env.BASE_RPC_URL ? "From BASE_RPC_URL" : "Default Base Mainnet"
	}`,
);

// Create the viem public client instance.
// This client interacts with the Base blockchain via the WebSocket transport.
// It's used for watching events and making read-only calls (like fetching token details).
const publicClient = createPublicClient({
	chain: base, // Specifies the Base network configuration.
	transport: wsTransport, // Uses the WebSocket transport created above.
});
console.log(`Public client created for ${LAUNCHPAD_NAME} on Base.`);

// --- Types ---

// Define a TypeScript interface extending viem's Log type.
// Updated to match the corrected 'Launched' event ABI.
interface LaunchedEventLog extends Log {
	eventName: "Launched"; // Explicitly set event name
	args: {
		token: `0x${string}`; // Address of the newly launched ERC20 token (indexed).
		pair: `0x${string}`; // Address of the associated liquidity pair contract (indexed).
		amount: bigint; // Amount associated with the launch (e.g., initial liquidity amount of the token?).
	};
}

// --- Listener Logic ---

/**
 * Processes a single 'Launched' event log.
 * Fetches token details, block timestamp, transaction sender (creator),
 * formats a description, and adds the launch to the database.
 * @param log The decoded event log matching the LaunchedEventLog interface.
 */
async function processLaunchedEvent(log: LaunchedEventLog) {
	console.log(
		`Processing ${log.eventName} event from block ${log.blockNumber}, tx: ${log.transactionHash}`,
	);

	// Destructure arguments from the corrected log structure.
	const { token, pair, amount } = log.args;
	const { blockNumber, transactionHash } = log;

	// Basic validation for event arguments.
	if (!token || !pair || amount === undefined) {
		console.warn(
			`[${transactionHash}] Skipping incomplete ${log.eventName} event log: Missing required arguments (token, pair, or amount).`,
			log.args,
		);
		return; // Skip processing if data is incomplete.
	}
	// Basic validation for log metadata needed for extra fetches.
	if (!blockNumber || !transactionHash) {
		console.warn(
			`[${token}] Skipping incomplete ${log.eventName} event log: Missing blockNumber or transactionHash.`,
			log,
		);
		return; // Skip processing if essential metadata is missing.
	}

	console.log(
		`[${token}] Extracted event args: token=${token}, pair=${pair}, amount=${amount.toString()}`,
	);

	try {
		// Fetch additional details concurrently: token info, block timestamp, and transaction sender (creator)
		console.log(
			`[${token}] Fetching token details, block info (for timestamp), and transaction info (for creator)...`,
		);
		const [
			tokenDetails, // Array: [tokenName, tokenSymbol, tokenDecimals]
			block, // Block data including timestamp
			transaction, // Transaction data including sender ('from' address)
		] = await Promise.all([
			publicClient.multicall({
				contracts: [
					{ address: token, abi: erc20Abi, functionName: "name" },
					{ address: token, abi: erc20Abi, functionName: "symbol" },
					{ address: token, abi: erc20Abi, functionName: "decimals" },
				],
				allowFailure: false,
			}),
			publicClient.getBlock({ blockNumber: blockNumber }),
			publicClient.getTransaction({ hash: transactionHash }),
		]);

		const [tokenName, tokenSymbol, tokenDecimals] = tokenDetails;
		const timestamp = block.timestamp; // Get timestamp from block data
		const creator = transaction.from; // Get sender ('from') address from transaction data

		console.log(
			`[${token}] Fetched details: Name=${tokenName}, Symbol=${tokenSymbol}, Decimals=${tokenDecimals}, Creator=${creator}, Timestamp=${timestamp}`,
		);

		// Convert the BigInt timestamp (Unix seconds) to a JavaScript Date object.
		// This represents the actual time the launch happened (block timestamp).
		const launchedAtDate = new Date(Number(timestamp * 1000n));

		// --- Construct Comprehensive Description ---
		// Format the 'amount'. Assuming it represents the newly launched token's amount.
		// The meaning of 'amount' might need verification based on contract logic.
		const amountFormatted = formatUnits(amount, tokenDecimals);
		console.log(
			`[${token}] Formatted amount: ${amountFormatted} ${tokenSymbol}`,
		);

		// Create a multi-line description string containing key details about the launch.
		const description = `
Token: ${tokenSymbol}
Token Address: https://basescan.org/token/${getAddress(token)}#balances
Liquidity Contract: https://basescan.org/address/${getAddress(pair)}#asset-tokens
Creator address: https://basescan.org/address/${getAddress(creator)}
Creator Virtuals profile: https://app.virtuals.io/profile/${getAddress(creator)}
Launched At: ${launchedAtDate.toUTCString()}
Amount (${tokenSymbol}): ${amountFormatted}  ${
			" " /* Placeholder: Add $VIRTUAL amount if available elsewhere */
		}
Transaction: https://basescan.org/tx/${transactionHash}
            `.trim();

		// Prepare the data object structured according to the NewLaunchData type expected by addLaunch.
		const launchData = {
			launchpad: LAUNCHPAD_NAME,
			title: `${tokenName} (${tokenSymbol}) Launch`,
			url: `https://app.virtuals.io/prototypes/${token}`, // Link to the token contract on the block explorer. Use pair address?
			description: description,
			launchedAt: launchedAtDate, // Pass the actual launch timestamp from the block
			// summary: Omitted - Will be populated later by LLM analysis (defaults to NULL in DB)
			// analysis: Omitted - Will be populated later by LLM analysis (defaults to NULL in DB)
		};
		console.log(`[${token}] Prepared launch data for DB insertion.`);
		console.log(
			`[${token}] Prepared launch data for DB insertion:`,
			launchData,
		); // Added log for launchData

		// Call the database function to add the new launch record.
		await addLaunch(launchData);
		// The log message below might be slightly inaccurate if the launch was skipped due to duplication,
		// but the addLaunch function logs the skipping action itself.
		console.log(
			`[${token}] Called addLaunch for token: ${tokenSymbol}`, // Adjusted log message slightly
		);
	} catch (error) {
		// Catch and log any errors during fetching details or database insertion.
		console.error(
			`[${token}] Error processing ${log.eventName} event for token ${token} in tx ${transactionHash}:`,
			error,
		);
	}
}

/**
 * Starts the WebSocket listener for 'Launched' events from the Virtuals Factory contract.
 */
export function startVirtualsBaseListener() {
	console.log(`Attempting to start listener for ${LAUNCHPAD_NAME}...`);

	// Check if the WebSocket transport was successfully created.
	if (!wsTransport) {
		console.error(
			`[${LAUNCHPAD_NAME}] Failed to create WebSocket transport. Listener cannot start. Ensure BASE_RPC_URL (wss://) is set or check network configuration.`,
		);
		return; // Stop execution if transport is not available.
	}

	try {
		// Use the viem client to watch for specific contract events.
		const unwatch = publicClient.watchContractEvent({
			address: VIRTUALS_FACTORY_ADDRESS,
			abi: [launchedEventAbi], // Use the corrected ABI definition
			eventName: "Launched", // Match the event name in the corrected ABI
			onLogs: async (logs) => {
				console.log(
					`[${LAUNCHPAD_NAME}] Received ${logs.length} new event log(s).`,
				);
				for (const log of logs) {
					// Type assertion is needed, ensure LaunchedEventLog interface matches ABI
					await processLaunchedEvent(log as unknown as LaunchedEventLog);
				}
			},
			onError: (error) => {
				console.error(
					`[${LAUNCHPAD_NAME}] Error in WebSocket event watcher:`,
					error.message,
					// Optionally log the full error object for more details
					// error
				);
				// Potential enhancements:
				// - Implement retry logic with backoff for temporary connection issues.
				// - Check error type/message to decide if reconnection is feasible.
				// - Use a more robust monitoring/alerting system for persistent errors.
				// const shouldReconnect = checkIfReconnectableError(error);
				// if (shouldReconnect) {
				//   console.log(`[${LAUNCHPAD_NAME}] Attempting to reconnect listener...`);
				//   unwatch(); // Stop the current watcher
				//   setTimeout(startVirtualsBaseListener, 5000); // Retry after delay
				// }
			},
			// strict: true // Consider adding strict: true for stricter ABI parsing/matching
		});

		console.log(
			`[${LAUNCHPAD_NAME}] Listener started successfully, watching for 'Launched' events at ${VIRTUALS_FACTORY_ADDRESS}.`,
		);
	} catch (error) {
		// Catch errors during the initial setup of the listener (e.g., invalid ABI, network issues).
		console.error(
			`[${LAUNCHPAD_NAME}] Critical error: Failed to start event listener:`,
			error,
		);
	}
}

// --- Debugging Function ---

/**
 * Fetches and processes historical 'Launched' events within a specific block range.
 * Useful for testing the event processing logic or backfilling missed events.
 */
async function debugFetchHistoricalEvents() {
	// Define the block range to query. Use BigInt literals (e.g., 12345n).
	const fromBlock = 28057270n; // Example start block
	const toBlock = 28057274n; // Example end block
	console.log(
		`--- Debugging [${LAUNCHPAD_NAME}]: Fetching historical events from block ${fromBlock} to ${toBlock} ---`,
	);

	const getLogsParams = {
		address: VIRTUALS_FACTORY_ADDRESS,
		event: launchedEventAbi, // Use the corrected ABI definition
		fromBlock: fromBlock,
		toBlock: toBlock,
	};
	console.log(
		`[${LAUNCHPAD_NAME} Debug] Querying logs with corrected ABI:`, // Updated log message
		JSON.stringify(
			getLogsParams,
			(key, value) => (typeof value === "bigint" ? value.toString() : value),
			2,
		),
	);

	try {
		// Fetch logs using the corrected event filter.
		const logs = await publicClient.getLogs(getLogsParams);

		console.log(
			`[${LAUNCHPAD_NAME} Debug] Found ${logs.length} '${
				getLogsParams.event.name ?? "Launched" // Safely access event name
			}' event(s) in the specified range (using event filter).`,
		);

		// Process each fetched historical log.
		for (const log of logs) {
			console.log(
				`[${LAUNCHPAD_NAME} Debug] Processing matched historical log from block ${log.blockNumber}, tx: ${log.transactionHash}...`,
			);
			await processLaunchedEvent(log as unknown as LaunchedEventLog);
		}

		// --- Secondary Debug Step: Fetch ALL logs (Now likely unnecessary) ---
		// This section can probably be removed or kept commented out
		/*
        console.log(`[${LAUNCHPAD_NAME} Debug] --- Fetching ALL logs from contract ${VIRTUALS_FACTORY_ADDRESS} in range ${fromBlock}-${toBlock}... ---`);
        const allLogsParams = { address: VIRTUALS_FACTORY_ADDRESS, fromBlock: fromBlock, toBlock: toBlock };
        const allLogs = await publicClient.getLogs(allLogsParams);
        console.log(`[${LAUNCHPAD_NAME} Debug] Found ${allLogs.length} total logs from the contract in the range (no event filter).`);
        // ... rest of secondary debug logging ...
        console.log(`[${LAUNCHPAD_NAME} Debug] --- Finished fetching ALL logs ---`);
        */
		// --- End Secondary Debug Step ---
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME} Debug] Error fetching or processing historical events:`,
			error,
		);
	} finally {
		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Finished fetching historical events ---`,
		);
	}
}

// --- How to run the debug function ---
// 1. Uncomment the line below to run it when this module is loaded.
//    Remember to comment it out again after debugging is complete.
debugFetchHistoricalEvents(); // <-- Do not uncomment this line!

// --- Conceptual Base Class (Future Refactoring Idea) ---
// The commented-out code below outlines a potential structure for an abstract base class.
// This could be used if you need to listen to similar events from multiple EVM launchpads.
// It promotes code reuse by centralizing the common logic (client setup, event watching)
// while allowing subclasses to define specific details (contract address, ABI, processing logic).

// export abstract class EvmLaunchpadListener {
//   protected client: ReturnType<typeof createPublicClient>;
//   protected launchpadName: string;
//   protected contractAddress: `0x${string}`;
//   // Consider using a more specific type like AbiItem from viem
//   protected eventAbi: readonly AbiItem[]; // Use readonly AbiItem array
//   protected eventName: string;
//   protected chain: Chain; // Add chain configuration
//   private unwatch?: () => void; // To store the unwatch function

//   constructor(config: {
//     chain: Chain;
//     rpcUrl?: string; // Allow providing specific RPC URL
//     contractAddress: `0x${string}`;
//     eventAbi: readonly AbiItem[];
//     eventName: string;
//     launchpadName: string;
//   }) {
//     this.chain = config.chain;
//     // More robust transport creation, handling WebSocket/HTTP based on URL
//     const transport = config.rpcUrl
//       ? config.rpcUrl.startsWith("wss")
//         ? webSocket(config.rpcUrl)
//         : http(config.rpcUrl)
//       : webSocket(); // Or get default from chain
//     this.client = createPublicClient({ chain: this.chain, transport });
//     this.contractAddress = config.contractAddress;
//     this.eventAbi = config.eventAbi;
//     this.eventName = config.eventName;
//     this.launchpadName = config.launchpadName;
//     console.log(`
