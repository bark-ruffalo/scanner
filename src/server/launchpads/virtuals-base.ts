import {
	http,
	type Chain,
	type Log,
	type PublicClient,
	type Transport,
	createPublicClient,
	formatUnits,
	getAddress,
	parseAbi,
	parseAbiItem,
	webSocket,
} from "viem";
import { base } from "viem/chains";
import { env } from "~/env";
import { calculateBigIntPercentage, formatTokenBalance } from "~/lib/utils";
import {
	addKnownEvmSellingAddress,
	getEvmErc20BalanceAtBlock,
	updateEvmTokenStatistics,
} from "~/server/lib/evm-utils";
import { addLaunch } from "~/server/queries";

// --- Types ---

interface LaunchData {
	launchpad: string;
	title: string;
	url: string;
	description: string;
	launchedAt: Date;
	imageUrl: string | null;
	totalTokenSupply: string;
	creatorTokensHeld: string;
	creatorTokenHoldingPercentage: string;
	basicInfoUpdatedAt: Date;
	tokenStatsUpdatedAt: Date;
}

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
// Using parseAbi for complex structure
const factoryAbi = parseAbi([
	"function tokenInfo(address tokenAddress) view returns (address creator, address token, address pair, address agentToken, (address token, string name, string _name, string ticker, uint256 supply, uint256 price, uint256 marketCap, uint256 liquidity, uint256 volume, uint256 volume24H, uint256 prevPrice, uint256 lastUpdated) data, string description, string image, string twitter, string telegram, string youtube, string website, bool trading, bool tradingOnUniswap)",
]);

// --- Client Setup ---

// Create a WebSocket transport for the viem client.
// WebSockets are preferred for listening to real-time events.
// It reads the RPC URL from the environment variables. Ensure it starts with 'wss://'.
// Provides an untested fallback if the env var is not set (taken from https://chainlist.org/chain/8453).
const wsTransport = webSocket(
	env.BASE_RPC_URL || "wss://base-rpc.publicnode.com",
);

// Create an HTTP transport from the WebSocket URL
// This is used for historical queries like getLogs
const httpTransport = http(
	env.BASE_RPC_URL
		? env.BASE_RPC_URL.replace("wss://", "https://")
		: "https://base-mainnet.g.alchemy.com", // Provide a safe fallback
);

if (!env.BASE_RPC_URL) {
	console.log(
		"Note: Using an untested Base WebSocket endpoint taken from https://chainlist.org/chain/8453.",
	);
	console.log(
		"For better reliability, consider setting BASE_RPC_URL in your environment variables (Alchemy, Infura, etc.)! It must start with 'wss://'.",
	);
}

// Create a public client for Base network with explicit typing
const publicClient = createPublicClient<Transport, Chain>({
	chain: base,
	transport: httpTransport, // Use HTTP transport for general queries like getLogs
});

// Create a real-time client for event watching
const watchClient = createPublicClient<Transport, Chain>({
	chain: base,
	transport: wsTransport, // Use WebSocket transport for real-time event watching
});

console.log(`Public client created for ${LAUNCHPAD_NAME} on Base.`);

// --- Types ---

// Define a TypeScript interface extending viem's Log type.
interface LaunchedEventLog extends Log {
	eventName: "Launched"; // Explicitly set event name
	args: {
		token: `0x${string}`; // Address of the newly launched ERC20 token (indexed).
		pair: `0x${string}`; // Address of the associated liquidity pair contract (indexed).
		n: bigint; // Not useful for anything. It represents tokenInfos.length.
	};
}

// Define a type for the structure returned by the tokenInfo function
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

	// Register the pair address as a known selling address so that transfers to it are detected as rug pulls
	addKnownEvmSellingAddress(pair, "the Virtuals Protocol bonding curve");

	try {
		// Fetch token info from factory and block info (for timestamp) concurrently
		console.log(`[${token}] Fetching tokenInfo and block info...`);
		const [
			tokenInfoResult, // Result from tokenInfo call (now a tuple)
			block, // Block data including timestamp
			latestBlock, // Get latest block number for historical check
		] = await Promise.all([
			publicClient.readContract({
				address: VIRTUALS_FACTORY_ADDRESS,
				abi: factoryAbi,
				functionName: "tokenInfo",
				args: [token], // Pass the token address from the event
			}) as Promise<TokenInfoResult>, // Cast result to our defined tuple type
			publicClient.getBlock({ blockNumber: blockNumber }),
			publicClient.getBlockNumber(),
		]).catch((error) => {
			// Handle errors during Promise.all (e.g., tokenInfo call fails)
			console.error(
				`[${token}] Error during initial data fetching (tokenInfo, block, latestBlock):`,
				error,
			);
			throw error; // Re-throw to stop further processing in this event
		});

		// Build launchpad URL for the launch
		const tokenUrl = `https://app.virtuals.io/prototypes/${token}`;

		// Now access elements from the tokenInfoResult tuple
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

		// Determine if this is a historical event by checking if we're in debug mode
		// We consider it historical if the block number is more than 10 blocks old
		const isHistoricalEvent = latestBlock - blockNumber > 10n;

		// First get initial balance
		const creatorInitialBalance = await getEvmErc20BalanceAtBlock(
			publicClient as PublicClient,
			token,
			creator,
			blockNumber, // The block number from the event log
		);

		// Then get current balance if needed
		const creatorCurrentBalance = isHistoricalEvent
			? await getEvmErc20BalanceAtBlock(
					publicClient as PublicClient,
					token,
					creator,
				)
			: creatorInitialBalance;

		// For new launches, current = initial
		const finalCurrentBalance = isHistoricalEvent
			? creatorCurrentBalance
			: creatorInitialBalance;

		const timestamp = block.timestamp;

		console.log(
			`[${token}] Fetched details via tokenInfo: Name=${tokenName}, Symbol=${tokenSymbol}, Creator=${creator}, Supply=${totalSupply}, Timestamp=${timestamp}${
				isHistoricalEvent ? " (Historical Event)" : " (New Launch)"
			}`,
		);

		// Format token balances for display using the utility function
		const displayInitialBalance = formatTokenBalance(creatorInitialBalance);
		const displayCurrentBalance = formatTokenBalance(finalCurrentBalance);

		// Calculate initial creator allocation percentage out of the total supply
		let creatorAllocationPercent = 0;
		let formattedAllocation = "N/A";
		const allocationResult = calculateBigIntPercentage(
			creatorInitialBalance,
			totalSupply,
		);
		if (allocationResult) {
			creatorAllocationPercent = allocationResult.percent;
			formattedAllocation = allocationResult.formatted;
		} else if (totalSupply === 0n) {
			formattedAllocation = "0.00% (Total supply is 0)";
		} else {
			formattedAllocation = "Error calculating";
		}

		// Calculate what percentage of their initial balance the creator still holds
		// Only calculate for historical events where current balance differs from initial
		let creatorHoldingPercent = 0;
		if (isHistoricalEvent && finalCurrentBalance !== creatorInitialBalance) {
			const holdingResult = calculateBigIntPercentage(
				finalCurrentBalance,
				creatorInitialBalance,
			);
			if (holdingResult) {
				creatorHoldingPercent = holdingResult.percent;
			}
		}

		// Convert the BigInt timestamp (Unix seconds) to a JavaScript Date object.
		const launchedAtDate = new Date(Number(timestamp * 1000n));

		// Extract image URL
		const imageUrl = image || null; // Use null if image string is empty

		// Calculate the formatted initial balance for token statistics
		const formattedInitialBalance = Math.round(
			Number(formatUnits(creatorInitialBalance, 18)),
		).toString();

		// Get token statistics from updateEvmTokenStatistics
		const tokenStats = await updateEvmTokenStatistics(
			publicClient,
			token,
			creator,
			formattedInitialBalance,
			finalCurrentBalance, // Pass the current balance we already fetched
			pair, // Pass the pair address as the launch-specific selling address
		);

		// --- Construct Comprehensive Description ---
		// Access tuple elements by index for description
		const description = `
# ${tokenName}
URL on launchpad: ${tokenUrl}
Launched at: ${launchedAtDate.toUTCString()}
Launched through the launchpad: ${LAUNCHPAD_NAME}
Launched in transaction: https://basescan.org/tx/${transactionHash}

## Token details and tokenomics
Token address: ${getAddress(token)}
Token symbol: $${tokenSymbol}
Token supply: 1 billion
Top holders: https://basescan.org/token/${getAddress(token)}#balances
Liquidity contract: https://basescan.org/address/${getAddress(pair)}#code (the token graduates when this gets 42k $VIRTUAL)
Creator initial number of tokens: ${displayInitialBalance} (${formattedAllocation} of token supply)${
			finalCurrentBalance !== creatorInitialBalance
				? `\nNumber of tokens held as of ${new Date().toUTCString().replace(/:\d\d GMT/, " GMT")}: ${displayCurrentBalance} (${Number(creatorHoldingPercent.toFixed(2)).toString()}% of initial allocation)${
						tokenStats.creatorTokenMovementDetails
							? `\nToken movement details: ${tokenStats.creatorTokenMovementDetails}`
							: ""
					}`
				: ""
		}

## Creator info
Creator address: ${getAddress(creator)}
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
			basicInfoUpdatedAt: new Date(), // Set basic info timestamp for initial creation
			// Store the pair address for future token movement detection
			mainSellingAddress: getAddress(pair),
			// Use the token stats we already have
			...tokenStats,
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
		// Use the watchClient with WebSocket transport to watch for events
		const unwatch = watchClient.watchContractEvent({
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
				);
				// Potential implementation for reconnection logic:
				// setTimeout(() => {
				//   console.log(`[${LAUNCHPAD_NAME}] Attempting to reconnect listener...`);
				//   unwatch(); // Stop the current watcher
				//   startVirtualsBaseListener(); // Restart listener
				// }, 5000);
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
 * @param fromBlock - Optional starting block number (defaults to 27843805n if not provided)
 * @param toBlock - Optional ending block number (defaults to latest block if not provided)
 */
export async function debugFetchHistoricalEvents(
	fromBlock?: bigint,
	toBlock?: bigint,
) {
	console.log(`Attempting to debug ${LAUNCHPAD_NAME} historical events...`);

	// Check if the HTTP transport was successfully created.
	if (!httpTransport) {
		console.error(
			`[${LAUNCHPAD_NAME}] Failed to create HTTP transport. Debug cannot start. Ensure BASE_RPC_URL is set or check network configuration.`,
		);
		return; // Stop execution if transport is not available.
	}

	try {
		// Define the block range to query. Use BigInt literals (e.g., 12345n).
		const startBlock = fromBlock || 27843805n; // Default start block if not provided; it starts from $ACP.
		// other good examples for startBlock:
		// $MAR: 25684212 https://basescan.org/tx/0x3b5e48b9748ac83ff98949b0d579298314ff20e71abadf5b743f9661a5d2ef64
		// $DFY: 23639253 https://basescan.org/address/0xf66dea7b3e897cd44a5a231c61b6b4423d613259#readProxyContract

		// Fetch the latest block if toBlock is not provided
		const endBlock = toBlock || (await publicClient.getBlockNumber());
		console.log(`Using block range: ${startBlock} to ${endBlock}`);

		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Fetching historical events from block ${startBlock} to ${endBlock} ---`,
		);

		const getLogsParams = {
			address: VIRTUALS_FACTORY_ADDRESS,
			event: launchedEventAbi,
			fromBlock: startBlock,
			toBlock: endBlock,
		};

		// Fetch logs using an event filter.
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

		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Finished fetching historical events ---`,
		);
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME} Debug] Error fetching or processing historical events:`,
			error,
		);
		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Failed to fetch historical events ---`,
		);
	}
}

// --- How to run the debug function ---
// 1. Set the DEBUG_VIRTUALS_HISTORICAL environment variable to "true".
// 2. The instrumentation.ts file will conditionally call debugFetchHistoricalEvents.
// (another option would be to uncomment the line below)
// debugFetchHistoricalEvents();
