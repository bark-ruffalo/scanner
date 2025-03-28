import "server-only";
// Use type imports for types
import type { AbiItem, Address } from "viem";
// Keep value imports separate
import { parseAbiItem } from "viem";

// Define ABI for standard ERC20 balanceOf function
export const balanceOfAbi = parseAbiItem(
	"function balanceOf(address account) view returns (uint256)",
) as AbiItem; // Cast remains as parseAbiItem returns a complex type

// Define a minimal client interface
interface ReadContractClient {
	readContract(args: {
		address: Address;
		abi: readonly AbiItem[];
		functionName: string;
		args: readonly unknown[];
		blockNumber?: bigint;
	}): Promise<unknown>;
}

/**
 * Fetches the EVM-based ERC20 token balance of an account at a specific block number.
 * @param client A viem client that can call readContract
 * @param tokenAddress The address of the ERC20 token contract.
 * @param accountAddress The address of the account whose balance is being checked.
 * @param blockNumber Optional block number at which to check the balance. If not provided, uses the latest block.
 * @returns A promise that resolves to the balance as a bigint, or 0n if an error occurs.
 */
export async function getEvmErc20BalanceAtBlock(
	client: ReadContractClient, // Use the interface instead of {readContract: Function}
	tokenAddress: Address,
	accountAddress: Address,
	blockNumber?: bigint,
): Promise<bigint> {
	try {
		const contractArgs: {
			address: Address;
			abi: readonly AbiItem[];
			functionName: string;
			args: readonly unknown[];
			blockNumber?: bigint;
		} = {
			address: tokenAddress,
			abi: [balanceOfAbi], // Use the shared ABI fragment
			functionName: "balanceOf",
			args: [accountAddress],
		};

		// Only add blockNumber if it's specified
		if (blockNumber !== undefined) {
			contractArgs.blockNumber = blockNumber;
		}

		const balance = await client.readContract(contractArgs);

		// Handle type conversion with proper guards
		if (typeof balance === "bigint") {
			return balance;
		}

		if (typeof balance === "string" || typeof balance === "number") {
			// Convert string/number to bigint
			return BigInt(balance);
		}

		// If it's neither bigint nor string/number, return 0n as a safe fallback
		console.warn(
			`Unexpected balance type (${typeof balance}) for token ${tokenAddress}, account ${accountAddress}. Using 0.`,
		);
		return 0n;
	} catch (error) {
		console.error(
			`Error fetching balance for token ${tokenAddress} / account ${accountAddress}${
				blockNumber !== undefined ? ` at block ${blockNumber}` : ""
			}:`,
			error,
		);
		return 0n;
	}
}
