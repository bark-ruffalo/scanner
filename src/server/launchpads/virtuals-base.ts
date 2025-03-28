import {
	type Log,
	type TransactionReceipt,
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
const VIRTUALS_FACTORY_ADDRESS = "0xF66DeA7b3e897cD44A5a231c61B6B4423d613259"; // Address from python script

// A constant string identifying the launchpad for database storage and display purposes.
const LAUNCHPAD_NAME = "Virtuals Protocol (Base)";

// Define the Application Binary Interface (ABI) fragment for the 'Launched' event.
// This tells viem how to decode the event logs from the blockchain.
const launchedEventAbi = parseAbiItem(
	"event Launched(address indexed agent_contract, address indexed token_contract, address creator, uint256 virtual_amount, uint256 agent_amount, uint256 timestamp)",
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
// This provides strong typing for the decoded arguments (`args`) of the 'Launched' event.
interface LaunchedEventLog extends Log {
	args: {
		agent_contract: `0x${string}`; // Address of the Agent NFT contract.
		token_contract: `0x${string}`; // Address of the newly launched ERC20 token.
		creator: `0x${string}`; // Address of the account that initiated the launch.
		virtual_amount: bigint; // Amount of $VIRTUAL token provided as initial liquidity.
		agent_amount: bigint; // Amount of the new agent token provided as initial liquidity.
		timestamp: bigint; // Block timestamp when the launch occurred (Unix seconds).
	};
}

// --- Listener Logic ---

/**
 * Processes a single 'Launched' event log.
 * Fetches token details, formats a description, and adds the launch to the database.
 * @param log The decoded event log matching the LaunchedEventLog interface.
 */
async function processLaunchedEvent(log: LaunchedEventLog) {
	console.log(
		`Processing Launched event from block ${log.blockNumber}, tx: ${log.transactionHash}`,
	);

	// Destructure arguments from the log for easier access.
	const {
		agent_contract,
		token_contract,
		creator,
		virtual_amount,
		agent_amount,
		timestamp,
	} = log.args;

	// Basic validation to ensure all necessary arguments are present.
	if (
		!agent_contract ||
		!token_contract ||
		!creator ||
		virtual_amount === undefined ||
		agent_amount === undefined ||
		timestamp === undefined
	) {
		console.warn(
			`[${token_contract}] Skipping incomplete Launched event log: Missing required arguments.`,
			log,
		);
		return; // Skip processing if data is incomplete.
	}

	console.log(
		`[${token_contract}] Extracted event args: agent=${agent_contract}, token=${token_contract}, creator=${creator}, time=${timestamp}`,
	);

	try {
		// Fetch token details (name, symbol, decimals) using a multicall for efficiency.
		// Multicall bundles multiple read requests into a single RPC call.
		console.log(`[${token_contract}] Fetching token details...`);
		const [tokenName, tokenSymbol, tokenDecimals] =
			await publicClient.multicall({
				contracts: [
					{
						address: token_contract,
						abi: erc20Abi,
						functionName: "name",
					},
					{
						address: token_contract,
						abi: erc20Abi,
						functionName: "symbol",
					},
					{
						address: token_contract,
						abi: erc20Abi,
						functionName: "decimals",
					},
				],
				allowFailure: false, // Ensure all calls succeed; otherwise, the promise rejects.
			});
		console.log(
			`[${token_contract}] Fetched details: Name=${tokenName}, Symbol=${tokenSymbol}, Decimals=${tokenDecimals}`,
		);

		// Convert the BigInt timestamp (Unix seconds) to a JavaScript Date object.
		const formattedTimestamp = new Date(Number(timestamp * 1000n));

		// --- Construct Comprehensive Description ---
		// Format the large BigInt liquidity amounts into human-readable strings.
		// Assumes $VIRTUAL uses 18 decimals. Uses the fetched decimals for the agent token.
		const virtualAmountFormatted = formatUnits(virtual_amount, 18); // Adjust 18 if $VIRTUAL decimals change.
		const agentAmountFormatted = formatUnits(agent_amount, tokenDecimals);
		console.log(
			`[${token_contract}] Formatted liquidity: ${virtualAmountFormatted} $VIRTUAL, ${agentAmountFormatted} ${tokenSymbol}`,
		);

		// Create a multi-line description string containing key details about the launch.
		// Uses getAddress to ensure consistent checksummed address formatting.
		const description = `
New Agent Launch on ${LAUNCHPAD_NAME}!
Token: ${tokenName} (${tokenSymbol})
Token Address: ${getAddress(token_contract)}
Creator: ${getAddress(creator)}
Agent NFT Address: ${getAddress(agent_contract)}
Launched At: ${formattedTimestamp.toISOString()}
Initial Liquidity: ${virtualAmountFormatted} $VIRTUAL / ${agentAmountFormatted} ${tokenSymbol}
            `.trim(); // .trim() removes leading/trailing whitespace.
		// Consider adding more details if available/fetchable, e.g., fetching metadata from the agent_contract URI.

		// Prepare the data object structured according to the NewLaunchData type expected by addLaunch.
		const launchData = {
			launchpad: LAUNCHPAD_NAME, // Identifies the source launchpad.
			title: `${tokenName} (${tokenSymbol}) Launch`, // Generate a descriptive title.
			url: `https://basescan.org/address/${token_contract}`, // Link to the token contract on the block explorer.
			description: description, // The detailed description created above.
			summary: `New ${tokenSymbol} token launched by ${getAddress(
				creator,
			).substring(0, 6)}...${getAddress(creator).substring(
				getAddress(creator).length - 4,
			)}. Initial liquidity: ${virtualAmountFormatted} $VIRTUAL / ${agentAmountFormatted} ${tokenSymbol}.`, // Generate a concise summary.
			// analysis and rating fields will use default values defined in the database schema or queries.
		};
		console.log(`[${token_contract}] Prepared launch data for DB insertion.`);

		// Call the database function to add the new launch record.
		// This function handles the actual insertion and triggers cache revalidation.
		await addLaunch(launchData);
		console.log(
			`[${token_contract}] Successfully processed and added launch for token: ${tokenSymbol}`,
		);
	} catch (error) {
		// Catch and log any errors during token detail fetching or database insertion.
		console.error(
			`[${token_contract}] Error processing Launched event for token ${token_contract}:`,
			error,
		);
		// Consider more specific error handling or reporting (e.g., sending alerts).
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
			address: VIRTUALS_FACTORY_ADDRESS, // The contract address to monitor.
			abi: [launchedEventAbi], // The ABI containing the event definition.
			eventName: "Launched", // The specific event name to listen for.
			// Callback function triggered when new logs are received.
			onLogs: async (logs) => {
				console.log(
					`[${LAUNCHPAD_NAME}] Received ${logs.length} new event log(s).`,
				);
				// Process each log individually using the shared logic.
				for (const log of logs) {
					// Type assertion is used here because watchContractEvent provides logs with a more generic type.
					// We are confident it matches LaunchedEventLog based on the ABI and eventName filters.
					// Consider adding runtime validation if type safety is paramount.
					await processLaunchedEvent(log as unknown as LaunchedEventLog);
				}
			},
			// Callback function triggered if an error occurs in the listener.
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

	try {
		// Use the getLogs method to fetch historical event logs.
		console.log(`[${LAUNCHPAD_NAME} Debug] Querying logs...`);
		const logs = await publicClient.getLogs({
			address: VIRTUALS_FACTORY_ADDRESS, // Contract address.
			event: launchedEventAbi, // Event ABI definition.
			fromBlock: fromBlock, // Start of the block range.
			toBlock: toBlock, // End of the block range.
		});

		console.log(
			`[${LAUNCHPAD_NAME} Debug] Found ${logs.length} historical event(s) in the specified range.`,
		);

		// Process each fetched historical log.
		for (const log of logs) {
			console.log(
				`[${LAUNCHPAD_NAME} Debug] Processing historical log from block ${log.blockNumber}, tx: ${log.transactionHash}...`,
			);
			// Reuse the same processing logic as the live listener.
			await processLaunchedEvent(log as unknown as LaunchedEventLog);
		}
	} catch (error) {
		console.error(
			`[${LAUNCHPAD_NAME} Debug] Error fetching or processing historical events:`,
			error,
		);
	} finally {
		// This block executes regardless of whether an error occurred.
		console.log(
			`--- Debugging [${LAUNCHPAD_NAME}]: Finished fetching historical events ---`,
		);
		// If running this standalone, you might need to close DB connections here.
		// await db.close(); // Example
	}
}

// --- How to run the debug function ---
// To execute the debug function:
// 1. Uncomment the line below. This will run `debugFetchHistoricalEvents`
//    when this module is imported, typically during application startup (`next dev`).
//    Remember to comment it out again after debugging.
debugFetchHistoricalEvents();
//
// 2. Alternative: Modify `instrumentation.ts` to explicitly call this function
//    after other initialization tasks. This provides more control over execution timing.
//    Example in `instrumentation.ts`:
//    import { debugFetchHistoricalEvents } from './path/to/virtuals-base';
//    export async function register() {
//      if (process.env.NEXT_RUNTIME === "nodejs") {
//        // ... start other listeners ...
//        console.log("Running debug function from instrumentation...");
//        await debugFetchHistoricalEvents(); // Call the debug function
//      }
//    }
//
// 3. Best Practice for Dedicated Debugging: Create a separate script (e.g., `scripts/debug-virtuals.ts`)
//    that imports and calls `debugFetchHistoricalEvents`. This keeps debug code separate
//    from the main application flow.
//    Example `scripts/debug-virtuals.ts`:
//    import { debugFetchHistoricalEvents } from '../src/server/launchpads/virtuals-base';
//    import { db } from '../src/server/db'; // If DB interaction needed
//    async function runDebug() {
//      await debugFetchHistoricalEvents();
//      // Ensure database connection is closed if script runs standalone
//      // await db.close(); // Check drizzle documentation for closing connections
//      process.exit(0); // Exit script cleanly
//    }
//    runDebug().catch(error => { console.error("Script failed:", error); process.exit(1); });
//    Run with `tsx scripts/debug-virtuals.ts` or similar.

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
//     console.log(`[${this.launchpadName}] Listener base class initialized.`);
//   }

//   // Abstract method that subclasses MUST implement to process specific event data
//   // It should transform the raw log data into the standardized NewLaunchData format.
//   protected abstract processEvent(log: Log): Promise<NewLaunchData | null>;

//   // Starts the common event listening logic
//   start() {
//     console.log(`[${this.launchpadName}] Starting listener via base class...`);
//     try {
//       this.unwatch = this.client.watchContractEvent({
//         address: this.contractAddress,
//         abi: this.eventAbi,
//         eventName: this.eventName,
//         onLogs: async (logs) => {
//           console.log(`[${this.launchpadName}] Received ${logs.length} event(s).`);
//           for (const log of logs) {
//             try {
//               // Call the subclass's specific processing implementation
//               const launchData = await this.processEvent(log);
//               if (launchData) {
//                 console.log(`[${this.launchpadName}] Processed event, adding launch: ${launchData.title}`);
//                 await addLaunch(launchData); // Use the shared addLaunch function
//               } else {
//                 console.log(`[${this.launchpadName}] Event processed but resulted in no launch data (skipped). Log:`, log);
//               }
//             } catch (error) {
//               console.error(`[${this.launchpadName}] Error processing individual log:`, log, error);
//             }
//           }
//         },
//         onError: (error) => {
//           console.error(`[${this.launchpadName}] Error in event watcher:`, error);
//           // Add base class error handling/reconnection logic if desired
//         },
//       });
//       console.log(`[${this.launchpadName}] Listener started successfully.`);
//     } catch (error) {
//       console.error(`[${this.launchpadName}] Failed to start listener:`, error);
//     }
//   }

//   // Method to stop the listener
//   stop() {
//       if (this.unwatch) {
//           console.log(`[${this.launchpadName}] Stopping listener.`);
//           this.unwatch();
//           this.unwatch = undefined;
//       } else {
//           console.log(`[${this.launchpadName}] Listener not currently running.`);
//       }
//   }
// }

// // Example subclass implementation using the base class
// export class VirtualsBaseListener extends EvmLaunchpadListener {
//   constructor() {
//     super({
//       chain: base,
//       rpcUrl: env.BASE_RPC_URL, // Pass RPC URL if needed
//       contractAddress: VIRTUALS_FACTORY_ADDRESS,
//       eventAbi: [launchedEventAbi],
//       eventName: "Launched",
//       launchpadName: LAUNCHPAD_NAME,
//     });
//   }

//   // Implement the specific logic for processing the 'Launched' event
//   protected async processEvent(log: Log): Promise<NewLaunchData | null> {
//       // Type assertion needed here, or ideally improve base class generics
//       const specificLog = log as unknown as LaunchedEventLog;
//       const { token_contract, creator, virtual_amount, agent_amount, timestamp } = specificLog.args;

//       // Add validation similar to the original processLaunchedEvent
//       if (!token_contract /* ... other checks ... */) {
//           console.warn(`[${this.launchpadName}] Skipping incomplete event in subclass.`);
//           return null; // Return null to indicate skipping
//       }

//       try {
//           console.log(`[${this.launchpadName} Subclass] Processing log for token ${token_contract}`);
//           // --- Fetch token details (reuse or adapt logic) ---
//           const [tokenName, tokenSymbol, tokenDecimals] = await this.client.multicall({
//               contracts: [
//                   { address: token_contract, abi: erc20Abi, functionName: 'name' },
//                   { address: token_contract, abi: erc20Abi, functionName: 'symbol' },
//                   { address: token_contract, abi: erc20Abi, functionName: 'decimals' },
//               ],
//               allowFailure: false,
//           });

//           // --- Format description (reuse or adapt logic) ---
//           const formattedTimestamp = new Date(Number(timestamp * 1000n));
//           const virtualAmountFormatted = formatUnits(virtual_amount, 18);
//           const agentAmountFormatted = formatUnits(agent_amount, tokenDecimals);
//           const description = `... formatted description ...`; // Construct as before
//           const summary = `... formatted summary ...`; // Construct as before

//           // --- Prepare data object ---
//           const launchData: NewLaunchData = {
//               launchpad: this.launchpadName, // Use name from base class
//               title: `${tokenName} (${tokenSymbol}) Launch`,
//               url: `https://basescan.org/address/${token_contract}`,
//               description: description,
//               summary: summary,
//           };
//           return launchData; // Return the structured data
//       } catch (error) {
//           console.error(`[${this.launchpadName} Subclass] Error processing event for ${token_contract}:`, error);
//           return null; // Return null on error to prevent adding faulty data
//       }
//   }
// }
