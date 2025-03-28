import {
	type Log,
	createPublicClient,
	formatUnits,
	getAddress,
	parseAbi,
	parseAbiItem,
	webSocket,
} from "viem";
import { base } from "viem/chains";
import { env } from "~/env";
import { addLaunch } from "~/server/queries";

// --- Configuration ---

// The on-chain address of the Virtuals Protocol factory contract on the Base network.
// This contract emits the 'Launched' event we are interested in.
const VIRTUALS_FACTORY_ADDRESS: `0x${string}` =
	"0xF66DeA7b3e897cD44A5a231c61B6B4423d613259";

// A constant string identifying the launchpad for database storage and display purposes.
const LAUNCHPAD_NAME = "VIRTUALS Protocol (Base)";

// Define the ABI fragment for the 'Launched' event.
// Signature: Launched(address indexed token, address indexed pair, uint256 n)
const launchedEventAbi = parseAbiItem(
	"event Launched(address indexed token, address indexed pair, uint256 n)",
);

// Define the ABI for the tokenInfo function on the factory contract
// Using parseAbi for complex structure - Corrected: Removed outer wrapping tuple ()
const factoryAbi = parseAbi([
	"function tokenInfo(address tokenAddress) view returns (address creator, address token, address pair, address agentToken, (address token, string name, string _name, string ticker, uint256 supply, uint256 price, uint256 marketCap, uint256 liquidity, uint256 volume, uint256 volume24H, uint256 prevPrice, uint256 lastUpdated) data, string description, string image, string twitter, string telegram, string youtube, string website, bool trading, bool tradingOnUniswap)",
]);

// Define ABI for standard ERC20 balanceOf function
const balanceOfAbi = parseAbiItem(
	"function balanceOf(address account) view returns (uint256)",
);

// --- Client Setup ---

// Create a WebSocket transport for the viem client.
// WebSockets are preferred for listening to real-time events.
// It reads the RPC URL from the environment variables. Ensure it starts with 'wss://'.
// Provides an untested fallback if the env var is not set (taken from https://chainlist.org/chain/8453).
const wsTransport = webSocket(
	env.BASE_RPC_URL || "wss://base-rpc.publicnode.com",
);
if (!env.BASE_RPC_URL) {
	console.log(
		"Note: Using an untested Base WebSocket endpoint taken from https://chainlist.org/chain/8453.",
	);
	console.log(
		"For better reliability, consider setting BASE_RPC_URL in your environment variables (Alchemy, Infura, etc.)! It must start with 'wss://'.",
	);
}

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
		n: bigint; // Not useful for anything. It represents tokenInfos.length.
	};
}

// Define a type for the structure returned by the tokenInfo function
// Corrected: It returns a tuple (array) of values, not a single object
type TokenInfoResult = readonly [
	creator: `0x${string}`,
	token: `0x${string}`,
	pair: `0x${string}`,
	agentToken: `0x${string}`,
	data: {
		token: `0x${string}`;
		name: string;
		_name: string;
		ticker: string;
		supply: bigint;
		price: bigint;
		marketCap: bigint;
		liquidity: bigint;
		volume: bigint;
		volume24H: bigint;
		prevPrice: bigint;
		lastUpdated: bigint;
	},
	description: string,
	image: string,
	twitter: string,
	telegram: string,
	youtube: string,
	website: string,
	trading: boolean,
	tradingOnUniswap: boolean,
];

// --- Listener Logic ---

/**
 * Processes a single 'Launched' event log.
 * Fetches token details using tokenInfo, block timestamp, creator balance,
 * calculates creator allocation, formats a description, and adds the launch to the database.
 * @param log The decoded event log matching the LaunchedEventLog interface.
 */
async function processLaunchedEvent(log: LaunchedEventLog) {
	console.log(
		`Processing ${log.eventName} event from block ${log.blockNumber}, tx: ${log.transactionHash}`,
	);

	// Destructure arguments from the corrected log structure.
	const { token, pair } = log.args;
	const { blockNumber, transactionHash } = log;

	// Basic validation for event arguments.
	if (!token || !pair) {
		console.warn(
			`[${transactionHash}] Skipping incomplete ${log.eventName} event log: Missing required arguments (token or pair).`,
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

	try {
		// Fetch token info from factory and block info (for timestamp) concurrently
		console.log(`[${token}] Fetching tokenInfo and block info...`); // Updated log message
		const [
			tokenInfoResult, // Result from tokenInfo call (now a tuple)
			block, // Block data including timestamp
		] = await Promise.all([
			publicClient.readContract({
				address: VIRTUALS_FACTORY_ADDRESS,
				abi: factoryAbi,
				functionName: "tokenInfo",
				args: [token], // Pass the token address from the event
			}) as Promise<TokenInfoResult>, // Cast result to our defined tuple type
			publicClient.getBlock({ blockNumber: blockNumber }),
		]).catch((error) => {
			// Handle errors during Promise.all (e.g., tokenInfo call fails)
			console.error(
				`[${token}] Error during initial data fetching (tokenInfo, block):`,
				error,
			);
			throw error; // Re-throw to stop further processing in this event
		});

		// Build token URL
		const tokenUrl = `https://app.virtuals.io/prototypes/${token}`;

		// Now access elements from the tokenInfoResult tuple and fetch creator balance
		const creator = tokenInfoResult[0];
		const dataTuple = tokenInfoResult[4];
		const platformDescription = tokenInfoResult[5];
		const image = tokenInfoResult[6];
		const twitter = tokenInfoResult[7];
		const telegram = tokenInfoResult[8];
		const youtube = tokenInfoResult[9];
		const website = tokenInfoResult[10];

		const tokenName = dataTuple._name;
		const tokenSymbol = dataTuple.ticker; // Use ticker as symbol
		const totalSupply = dataTuple.supply;

		console.log(`[${token}] Fetching creator's initial balance...`); // Added log
		const creatorInitialBalance = await publicClient
			.readContract({
				address: token, // The launched token address
				abi: [balanceOfAbi], // Use the balanceOf ABI
				functionName: "balanceOf",
				args: [creator], // The creator's address from tokenInfo
				blockNumber: blockNumber, // Fetch balance at the specific block of the launch
			})
			.catch((error) => {
				console.error(
					`[${token}] Error fetching creator's initial balance:`,
					error,
				);
				return 0n; // Default to 0 if balance check fails
			});

		const timestamp = block.timestamp;

		console.log(
			`[${token}] Fetched details via tokenInfo: Name=${tokenName}, Symbol=${tokenSymbol}, Creator=${creator}, Supply=${totalSupply}, Timestamp=${timestamp}`,
		);

		// Calculate creator allocation percentage
		let creatorAllocationPercent = 0;
		let formattedAllocation = "N/A";
		if (totalSupply > 0n) {
			try {
				// Use BigInt math for precision before converting to number
				const percentageBasisPoints =
					(creatorInitialBalance * 10000n) / totalSupply; // Calculate in basis points (scaled by 10000)
				creatorAllocationPercent = Number(percentageBasisPoints) / 100; // Convert back to percentage
				formattedAllocation = `${creatorAllocationPercent.toFixed(2)}%`;
			} catch (calcError) {
				console.error(
					`[${token}] Error calculating creator allocation:`,
					calcError,
				);
				formattedAllocation = "Error calculating";
			}
		} else {
			formattedAllocation = "0.00% (Total supply is 0)";
		}

		// Convert the BigInt timestamp (Unix seconds) to a JavaScript Date object.
		const launchedAtDate = new Date(Number(timestamp * 1000n));

		// Extract image URL
		const imageUrl = image || null; // Use null if image string is empty

		// --- Construct Comprehensive Description ---
		// Access tuple elements by index for description
		const description = `
# ${tokenName}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}
URL on launchpad: ${tokenUrl}

## Token details and tokenomics
Token symbol: $${tokenSymbol}
Token address: ${getAddress(token)}
Top holders: https://basescan.org/token/${getAddress(token)}#balances
Liquidity contract: https://basescan.org/address/${getAddress(pair)}#code (the token graduates when this gets 42k $VIRTUAL)
Launched in transaction: https://basescan.org/tx/${transactionHash}
Token supply: 1 billion
Creator initial allocation: ${formattedAllocation}

## Creator info
Creator on basescan.org: https://basescan.org/address/${getAddress(creator)}
Creator on virtuals.io: https://app.virtuals.io/profile/${getAddress(creator)}
Creator on zerion.io: https://app.zerion.io/${getAddress(creator)}/overview
Creator on debank.com: https://debank.com/profile/${getAddress(creator)}

## Description at launch
${platformDescription}

## Additional links
These fields aren't used anymore when launching on Virtuals Protocol, therefore they're likely to be empty:
Website: ${website || "N/A"}
Twitter: ${twitter || "N/A"}
Telegram: ${telegram || "N/A"}
YouTube: ${youtube || "N/A"}
            `.trim();

		// Prepare the data object structured according to the NewLaunchData type expected by addLaunch.
		const launchData = {
			launchpad: LAUNCHPAD_NAME,
			title: `${tokenName} ($${tokenSymbol})`, // Use name and ticker
			url: tokenUrl, // Keep Virtuals specific link
			description: description, // Use the comprehensive description
			launchedAt: launchedAtDate,
			imageUrl: imageUrl, // Add the image URL
			// summary/analysis are left for potential future LLM processing
		};
		console.log(
			`[${token}] Prepared launch data for DB insertion:`,
			launchData,
		);

		// Call the database function to add the new launch record.
		await addLaunch(launchData);
		console.log(`[${token}] Called addLaunch for token: ${tokenSymbol}`);
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

/**
 * Fetches and processes historical 'Launched' events within a specific block range.
 * Useful for testing the event processing logic or backfilling missed events.
 * This function is intended for debugging and should be run conditionally, e.g., via instrumentation.ts.
 */
export async function debugFetchHistoricalEvents() {
	// Define the block range to query. Use BigInt literals (e.g., 12345n).
	const fromBlock = 25684212n; // Example start block
	const toBlock = 25684212n; // Example end block
	// another example: 28057272 for KIDDO
	// $MAR: 25684212 https://basescan.org/tx/0x3b5e48b9748ac83ff98949b0d579298314ff20e71abadf5b743f9661a5d2ef64
	// $DFY: 23639253 https://basescan.org/address/0xf66dea7b3e897cd44a5a231c61b6b4423d613259#readProxyContract
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
// 1. Set the DEBUG_VIRTUALS_HISTORICAL environment variable to "true".
// 2. The instrumentation.ts file will conditionally call debugFetchHistoricalEvents.
// (another option would be to uncomment the line below)
// debugFetchHistoricalEvents();
