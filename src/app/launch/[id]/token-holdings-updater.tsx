"use client";

import { useEffect } from "react";
import { updateTokenHoldings } from "./actions";

interface TokenHoldingsUpdaterProps {
	launchId: number;
	tokenAddress: string;
	creatorAddress: string;
	initialBalance: string;
}

export function TokenHoldingsUpdater({
	launchId,
	tokenAddress,
	creatorAddress,
	initialBalance,
}: TokenHoldingsUpdaterProps) {
	useEffect(() => {
		updateTokenHoldings(
			launchId,
			tokenAddress,
			creatorAddress,
			initialBalance,
		).catch(console.error);
	}, [launchId, tokenAddress, creatorAddress, initialBalance]);

	return null;
}
