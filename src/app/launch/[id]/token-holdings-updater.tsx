"use client";

import { useEffect, useState } from "react";
import { updateTokenHoldings } from "./actions";
import { BackgroundProcessIndicator } from "./background-process-indicator";

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
	const [hasUpdated, setHasUpdated] = useState(false);
	const [isUpdating, setIsUpdating] = useState(false);
	const [updateComplete, setUpdateComplete] = useState(false);

	useEffect(() => {
		// Check if we've updated recently (localStorage persists across page refreshes)
		const lastUpdateTimeStr = localStorage.getItem(
			`lastTokenUpdate-${launchId}`,
		);
		const lastUpdateTime = lastUpdateTimeStr
			? Number.parseInt(lastUpdateTimeStr, 10)
			: 0;
		const currentTime = Date.now();

		// Only update if it's been more than 1 hour since the last update
		const shouldUpdate = currentTime - lastUpdateTime > 60 * 60 * 1000;

		if (shouldUpdate && !hasUpdated) {
			setIsUpdating(true);

			updateTokenHoldings(
				launchId,
				tokenAddress,
				creatorAddress,
				creatorInitialTokens,
			)
				.then(() => {
					// Update the last update time
					localStorage.setItem(
						`lastTokenUpdate-${launchId}`,
						currentTime.toString(),
					);
					setHasUpdated(true);
					setUpdateComplete(true);

					// Refresh the page to show updated data
					setTimeout(() => {
						window.location.reload();
					}, 1000);
				})
				.catch((error) => {
					console.error(error);
					setIsUpdating(false);
				});
		}
	}, [
		launchId,
		tokenAddress,
		creatorAddress,
		creatorInitialTokens,
		hasUpdated,
	]);

	const handleTokenStatsComplete = () => {
		// Wait briefly before changing UI state
		setTimeout(() => {
			setUpdateComplete(true);
		}, 500);
	};

	return (
		<BackgroundProcessIndicator
			processType="tokenStats"
			isActive={isUpdating}
			onComplete={handleTokenStatsComplete}
		/>
	);
}
