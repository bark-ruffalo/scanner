"use client";

import { useEffect } from "react";
import { updateTokenHoldings } from "./actions";

interface TokenHoldingsUpdaterProps {
	launchId: number;
	tokenAddress: string;
	creatorAddress: string;
	creatorInitialTokens: string; // Initial token allocation at launch
}

export function TokenHoldingsUpdater({
	launchId,
	tokenAddress,
	creatorAddress,
	creatorInitialTokens,
}: TokenHoldingsUpdaterProps) {
	useEffect(() => {
		updateTokenHoldings(
			launchId,
			tokenAddress,
			creatorAddress,
			creatorInitialTokens,
		).catch(console.error);
	}, [launchId, tokenAddress, creatorAddress, creatorInitialTokens]);

	return null;
}
