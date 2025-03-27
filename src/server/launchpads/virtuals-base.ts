import {
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
const VIRTUALS_FACTORY_ADDRESS = "0xF66DeA7b3e897cD44A5a231c61B6B4423d613259"; // Address from python script
const LAUNCHPAD_NAME = "Virtuals Protocol (Base)";

// Define ABI fragments needed
const launchedEventAbi = parseAbiItem(
	"event Launched(address indexed agent_contract, address indexed token_contract, address creator, uint256 virtual_amount, uint256 agent_amount, uint256 timestamp)",
);
const erc20Abi = [
	parseAbiItem("function name() view returns (string)"),
	parseAbiItem("function symbol() view returns (string)"),
	parseAbiItem("function decimals() view returns (uint8)"),
] as const; // Use 'as const' for better type inference with viem

// Create viem client for Base network using WebSocket
// Ensure BASE_RPC_URL in .env starts with wss://
// Fallback to a public WSS endpoint if available, otherwise error might occur if env var not set
const wsTransport = webSocket(
	env.BASE_RPC_URL || base.rpcUrls.default.webSocket?.[0],
);

// Note: For robustness, consider handling potential transport creation errors
const publicClient = createPublicClient({
	chain: base,
	transport: wsTransport,
});

// --- Listener Logic ---

export function startVirtualsBaseListener() {
	console.log(`Starting listener for ${LAUNCHPAD_NAME}...`);

	// Check if transport was successfully created (especially if fallback might be undefined)
	if (!wsTransport) {
		console.error(
			`Failed to create WebSocket transport for ${LAUNCHPAD_NAME}. Ensure BASE_RPC_URL (wss://) is set or the chain definition has a default WebSocket URL.`,
		);
		return;
	}

	try {
		publicClient.watchContractEvent({
			address: VIRTUALS_FACTORY_ADDRESS,
			abi: [launchedEventAbi],
			eventName: "Launched",
			onLogs: async (logs) => {
				for (const log of logs) {
					const {
						agent_contract,
						token_contract,
						creator,
						virtual_amount,
						agent_amount,
						timestamp,
					} = log.args;

					if (
						!agent_contract ||
						!token_contract ||
						!creator ||
						virtual_amount === undefined ||
						agent_amount === undefined ||
						timestamp === undefined
					) {
						console.warn("Received incomplete Launched event log:", log);
						continue; // Skip incomplete logs
					}

					try {
						// Fetch token details using the same client (WebSocket handles requests too)
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
								allowFailure: false, // Ensure all calls succeed
							});

						const formattedTimestamp = new Date(Number(timestamp * 1000n)); // Convert BigInt timestamp to Date

						// --- Construct Comprehensive Description ---
						// Assuming $VIRTUAL has 18 decimals. Agent token decimals fetched above.
						const virtualAmountFormatted = formatUnits(virtual_amount, 18); // Adjust decimals if needed
						const agentAmountFormatted = formatUnits(
							agent_amount,
							tokenDecimals,
						);

						const description = `
New Agent Launch on ${LAUNCHPAD_NAME}!
Token: ${tokenName} (${tokenSymbol})
Token Address: ${getAddress(token_contract)}
Creator: ${getAddress(creator)}
Agent NFT Address: ${getAddress(agent_contract)}
Launched At: ${formattedTimestamp.toISOString()}
Initial Liquidity: ${virtualAmountFormatted} $VIRTUAL / ${agentAmountFormatted} ${tokenSymbol}
            `.trim();
						// Add more details if available/fetchable, e.g., from agent_contract metadata

						// Prepare data for database insertion
						const launchData = {
							launchpad: LAUNCHPAD_NAME,
							title: `${tokenName} (${tokenSymbol}) Launch`, // Generate a title
							url: `https://basescan.org/address/${token_contract}`, // Link to token on explorer
							description: description, // The comprehensive description
							summary: `New ${tokenSymbol} token launched by ${getAddress(
								creator,
							).substring(0, 6)}...${getAddress(creator).substring(
								getAddress(creator).length - 4,
							)}.`, // Generate a short summary
							// analysis and rating are defaulted in schema/queries
						};

						// Add launch to database (which also triggers revalidation)
						await addLaunch(launchData);
					} catch (error) {
						console.error(
							`Error processing Launched event for token ${token_contract}:`,
							error,
						);
					}
				}
			},
			onError: (error) => {
				console.error(`Error in ${LAUNCHPAD_NAME} event watcher:`, error);
				// Optional: Add retry logic or more robust error handling here
				// Consider attempting to reconnect the WebSocket if it disconnects.
			},
		});

		console.log(`Listener for ${LAUNCHPAD_NAME} started successfully.`);
	} catch (error) {
		console.error(`Failed to start listener for ${LAUNCHPAD_NAME}:`, error);
	}
}

// Potential structure for a Base Class (Conceptual)
// export class EvmLaunchpadListener {
//   protected client: ReturnType<typeof createPublicClient>;
//   protected launchpadName: string;
//   protected contractAddress: `0x${string}`;
//   protected eventAbi: any; // Define more strictly
//   protected eventName: string;

//   constructor(config: { /* chain, rpcUrl, contractAddress, eventAbi, eventName, launchpadName */ }) {
//      // Initialize client, properties
//   }

//   protected async processEvent(log: any): Promise<NewLaunchData> {
//     // Abstract method to be implemented by subclasses
//     throw new Error("processEvent must be implemented by subclass");
//   }

//   start() {
//     // Common watchContractEvent logic using this.client, this.contractAddress, etc.
//     // Calls this.processEvent(log)
//     // Calls addLaunch(launchData)
//   }
// }

// export class VirtualsBaseListener extends EvmLaunchpadListener {
//    constructor() {
//      super({ /* config specific to Virtuals Base */ });
//    }

//    protected async processEvent(log: any): Promise<NewLaunchData> {
//       // Implementation specific to Virtuals Launched event
//       // ... fetch token details, format description ...
//       return launchData;
//    }
// }
