import type { Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createSolanaEventParser } from "~/server/lib/svm-utils";

// Program ID for the Virtuals Protocol on Solana
// Export the Program ID constant
export const VIRTUALS_PROGRAM_ID = new PublicKey(
	process.env.VIRTUALS_SOLANA_PROGRAM_ID ||
		"5U3EU2ubXtK84QcRjWVmYt9RaDyA8gKxdUrPFXmZyaki",
);

// Update the IDL type to include address
// Export the IDL type
export interface VirtualsIdl extends Idl {
	// Address field is non-standard but present in the source IDL JSON
	// Keep it for potential reference, but it's not used by Anchor types directly.
	address: string;
}

// Load the program IDL - Anchor uses this to decode events and interact with the program
// This is the Solana equivalent of ABI in Ethereum
// Export the IDL constant
export const IDL: VirtualsIdl = {
	version: "0.1.0",
	name: "virtuals_amm",
	address: "VirtsXWsU7NrBrHhqxhKUr2QXE7gJ5MfVxVpxgKKpod",
	metadata: {
		name: "Virtuals AMM",
		version: "0.1.0",
		spec: "0.1.0",
		description: "Virtuals Protocol AMM",
	},
	instructions: [
		{
			name: "buy",
			accounts: [
				{
					name: "user",
					isSigner: true,
					isMut: false,
				},
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "user_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "user_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "platform_prototype",
					isMut: true,
					isSigner: false,
				},
				{
					name: "platform_prototype_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "platform_prototype",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [
				{
					name: "amount",
					type: "u64",
				},
				{
					name: "max_amount_out",
					type: "u64",
				},
			],
		},
		{
			name: "claim_fees",
			accounts: [
				{
					name: "payer",
					isMut: true,
					isSigner: true,
				},
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "virtuals_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "platform",
					isMut: true,
					isSigner: false,
				},
				{
					name: "platform_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "platform",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "platform_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "platform",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "creator_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "creator_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool.creator",
								account: "VirtualsPool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "pool",
					isMut: true,
					isSigner: false,
				},
				{
					name: "lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "lock_escrow",
					isMut: true,
					isSigner: false,
				},
				{
					name: "escrow_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "virtuals_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vault_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "dynamic_amm_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
		{
			name: "create_meteora_pool",
			accounts: [
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "meteora_deployer",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [
									109, 101, 116, 101, 111, 114, 97, 95, 100, 101, 112, 108, 111,
									121, 101, 114,
								],
							},
						],
					},
				},
				{
					name: "meteora_deployer_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "meteora_deployer_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "lock_escrow",
					isMut: true,
					isSigner: false,
				},
				{
					name: "escrow_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool",
					isMut: true,
					isSigner: false,
				},
				{
					name: "config",
					isMut: false,
					isSigner: false,
				},
				{
					name: "lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "virtuals_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "meteora_deployer_pool_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "protocol_virtuals_fee",
					isMut: true,
					isSigner: false,
				},
				{
					name: "protocol_token_fee",
					isMut: true,
					isSigner: false,
				},
				{
					name: "payer",
					isMut: true,
					isSigner: true,
				},
				{
					name: "token_metadata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [109, 101, 116, 97, 100, 97, 116, 97],
							},
							{
								kind: "account",
								path: "metadata_program",
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "rent",
					docs: ["Rent account."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "mint_metadata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "metadata_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "vault_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_program",
					docs: ["Token program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					docs: ["Associated token program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					docs: ["System program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "dynamic_amm_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
		{
			name: "initialize",
			docs: [
				"# Initialize Pool",
				"",
				"This is where Virtuals creates a new mint address and pool and mints the initial 1,000,000,000 tokens.",
				"This enabels Virtuals to premine addresses and \\",
				"sell\\\\",
				"them to customers without any delays of mining the",
				"address. While this instruction could be permissioned, it is currently permissionless. As such, we make",
				"sure to handle all the necessary checks such as: address suffix, zero supply, 6 decimals, correct mint",
				"authority.",
			],
			accounts: [
				{
					name: "payer",
					isMut: true,
					isSigner: true,
				},
				{
					name: "virtuals_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
		{
			name: "initialize_meteora_accounts",
			accounts: [
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "meteora_deployer",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [
									109, 101, 116, 101, 111, 114, 97, 95, 100, 101, 112, 108, 111,
									121, 101, 114,
								],
							},
						],
					},
				},
				{
					name: "meteora_deployer_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "meteora_deployer_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "lock_escrow",
					isMut: true,
					isSigner: false,
				},
				{
					name: "escrow_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool",
					isMut: true,
					isSigner: false,
				},
				{
					name: "config",
					isMut: false,
					isSigner: false,
				},
				{
					name: "lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "virtuals_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_token_vault",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "virtuals_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "token_vault_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "pool_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "meteora_deployer_pool_lp",
					isMut: true,
					isSigner: false,
				},
				{
					name: "protocol_virtuals_fee",
					isMut: true,
					isSigner: false,
				},
				{
					name: "protocol_token_fee",
					isMut: true,
					isSigner: false,
				},
				{
					name: "payer",
					isMut: true,
					isSigner: true,
				},
				{
					name: "token_metadata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [109, 101, 116, 97, 100, 97, 116, 97],
							},
							{
								kind: "account",
								path: "metadata_program",
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "rent",
					docs: ["Rent account."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "mint_metadata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "metadata_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "vault_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_program",
					docs: ["Token program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					docs: ["Associated token program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					docs: ["System program."],
					isMut: false,
					isSigner: false,
				},
				{
					name: "dynamic_amm_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
		{
			name: "launch",
			docs: [
				"",
				"This is where a user comes along and purchases a mint address and pool. The user will provide a name,",
				"symbol and URI containing offchain metadata. The contract will initialize a new onchain metadata",
				"account containing these values, then revoke the mint authority.",
				"",
			],
			accounts: [
				{
					name: "creator",
					isMut: true,
					isSigner: true,
				},
				{
					name: "creator_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "creator",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "token_mint",
					isMut: true,
					isSigner: false,
				},
				{
					name: "platform_prototype",
					isMut: true,
					isSigner: false,
				},
				{
					name: "platform_prototype_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "platform_prototype",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "token_metadata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [109, 101, 116, 97, 100, 97, 116, 97],
							},
							{
								kind: "account",
								path: "metadata_program",
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "metadata_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "rent",
					isMut: false,
					isSigner: false,
				},
			],
			args: [
				{
					name: "symbol",
					type: "string",
				},
				{
					name: "name",
					type: "string",
				},
				{
					name: "uri",
					type: "string",
				},
			],
		},
		{
			name: "sell",
			accounts: [
				{
					name: "user",
					isSigner: true,
					isMut: false,
				},
				{
					name: "vpool",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "user_virtuals_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "user_token_ata",
					isMut: true,
					isSigner: false,
				},
				{
					name: "vpool_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "platform_prototype",
					isMut: true,
					isSigner: false,
				},
				{
					name: "platform_prototype_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "platform_prototype",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "vpool_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "vpool",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "const",
								value: [
									40, 82, 144, 230, 223, 30, 203, 194, 218, 8, 182, 83, 3, 69,
									230, 99, 143, 96, 63, 54, 49, 170, 42, 186, 128, 143, 177,
									157, 236, 50, 113, 76,
								],
							},
						],
					},
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [
				{
					name: "amount",
					type: "u64",
				},
				{
					name: "min_amount_out",
					type: "u64",
				},
			],
		},
		{
			name: "update_pool_creator",
			accounts: [
				{
					name: "creator",
					isMut: true,
					isSigner: true,
					relations: ["vpool"],
				},
				{
					name: "new_creator",
					isMut: false,
					isSigner: false,
				},
				{
					name: "virtuals_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "token_mint",
					isMut: false,
					isSigner: false,
				},
				{
					name: "new_creator_virtuals_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "new_creator",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "virtuals_mint",
							},
						],
					},
				},
				{
					name: "new_creator_token_ata",
					isMut: true,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "account",
								path: "new_creator",
							},
							{
								kind: "const",
								value: [
									6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206,
									235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140,
									245, 133, 126, 255, 0, 169,
								],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "vpool",
					isMut: false,
					isSigner: false,
					pda: {
						seeds: [
							{
								kind: "const",
								value: [118, 112, 111, 111, 108],
							},
							{
								kind: "account",
								path: "token_mint",
							},
						],
					},
				},
				{
					name: "token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "associated_token_program",
					isMut: false,
					isSigner: false,
				},
				{
					name: "system_program",
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
	],
	accounts: [
		{
			name: "VirtualsPool",
			type: {
				kind: "struct",
				fields: [
					{ name: "creator", type: "publicKey" },
					{ name: "mint", type: "publicKey" },
					{ name: "virtual_y", type: "u64" },
					{ name: "graduation_x", type: "u64" },
					{ name: "state", type: { defined: "PoolState" } },
					{ name: "bump", type: "u8" },
				],
			},
		},
	],
	events: [
		{
			name: "BuyEvent",
			fields: [
				{ name: "buy_amount", type: "u64", index: false },
				{ name: "virtuals_amount", type: "u64", index: false },
			],
		},
		{
			name: "GraduationEvent",
			fields: [
				{ name: "vpool", type: "publicKey", index: false },
				{ name: "mint", type: "publicKey", index: false },
				{ name: "balance", type: "u64", index: false },
			],
		},
		{
			name: "LaunchEvent",
			fields: [
				{ name: "vpool", type: "publicKey", index: false },
				{ name: "mint", type: "publicKey", index: false },
				{ name: "creator", type: "publicKey", index: false },
			],
		},
		{
			name: "SellEvent",
			fields: [
				{ name: "sell_amount", type: "u64", index: false },
				{ name: "virtuals_amount", type: "u64", index: false },
			],
		},
	],
	errors: [
		{
			code: 6000,
			name: "InvalidMintAddress",
			msg: "Invalid mint address",
		},
		{
			code: 6001,
			name: "InvalidMintParams",
			msg: "Invalid mint params",
		},
		{
			code: 6002,
			name: "CurveError",
			msg: "Curve error",
		},
		{
			code: 6003,
			name: "InvalidFee",
			msg: "Fee cannot exceed 100%",
		},
		{
			code: 6004,
			name: "NameTooLong",
			msg: "Name too long. Max length = 20",
		},
		{
			code: 6005,
			name: "SymbolTooLong",
			msg: "Symbol too long. Max length = 10",
		},
		{
			code: 6006,
			name: "URITooLong",
			msg: "URI too long. Max length = 200",
		},
		{
			code: 6007,
			name: "InvalidAmount",
			msg: "Amount must be >0",
		},
		{
			code: 6008,
			name: "SlippageExceeded",
			msg: "Slippage exceeded",
		},
		{
			code: 6009,
			name: "InvalidVPoolState",
			msg: "Invalid vpool state",
		},
		{
			code: 6010,
			name: "InvalidName",
			msg: "Invalid name",
		},
		{
			code: 6011,
			name: "InvalidSymbol",
			msg: "Invalid symbol",
		},
		{
			code: 6012,
			name: "InvalidURI",
			msg: "Invalid URI",
		},
	],
	types: [
		{
			name: "BuyEvent",
			type: {
				kind: "struct",
				fields: [
					{
						name: "buy_amount",
						type: "u64",
					},
					{
						name: "virtuals_amount",
						type: "u64",
					},
				],
			},
		},
		{
			name: "GraduationEvent",
			type: {
				kind: "struct",
				fields: [
					{
						name: "vpool",
						type: "publicKey",
					},
					{
						name: "mint",
						type: "publicKey",
					},
					{
						name: "balance",
						type: "u64",
					},
				],
			},
		},
		{
			name: "LaunchEvent",
			type: {
				kind: "struct",
				fields: [
					{
						name: "vpool",
						type: "publicKey",
					},
					{
						name: "mint",
						type: "publicKey",
					},
					{
						name: "creator",
						type: "publicKey",
					},
				],
			},
		},
		{
			name: "PoolState",
			type: {
				kind: "enum",
				variants: [
					{
						name: "Initialized",
					},
					{
						name: "Active",
					},
					{
						name: "Graduated",
					},
					{
						name: "Migrated",
					},
				],
			},
		},
		{
			name: "SellEvent",
			type: {
				kind: "struct",
				fields: [
					{
						name: "sell_amount",
						type: "u64",
					},
					{
						name: "virtuals_amount",
						type: "u64",
					},
				],
			},
		},
		{
			name: "VirtualsPool",
			type: {
				kind: "struct",
				fields: [
					{
						name: "creator",
						type: "publicKey",
					},
					{
						name: "mint",
						type: "publicKey",
					},
					{
						name: "virtual_y",
						type: "u64",
					},
					{
						name: "graduation_x",
						type: "u64",
					},
					{
						name: "state",
						type: {
							defined: "PoolState",
						},
					},
					{
						name: "bump",
						type: "u8",
					},
				],
			},
		},
	],
};

// Create an event parser using the IDL
// Export the event parser
export const eventParser = createSolanaEventParser(VIRTUALS_PROGRAM_ID, IDL);
