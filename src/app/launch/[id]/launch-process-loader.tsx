"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { performLlmAnalysis, updateTokenHoldings } from "./actions";
import { BackgroundProcessIndicator } from "./background-process-indicator";

interface LaunchProcessLoaderProps {
	launchId: number;
	needsAnalysis: boolean;
	needsTokenUpdate: boolean;
	tokenAddress?: string;
	creatorAddress?: string;
	creatorInitialTokens?: string;
}

export function LaunchProcessLoader({
	launchId,
	needsAnalysis,
	needsTokenUpdate,
	tokenAddress,
	creatorAddress,
	creatorInitialTokens,
}: LaunchProcessLoaderProps) {
	const router = useRouter();
	const [processStates, setProcessStates] = useState({
		analysis: {
			isRunning: false,
			isComplete: false,
			hasStarted: false,
		},
		tokenUpdate: {
			isRunning: false,
			isComplete: false,
			hasStarted: false,
		},
	});
	const [shouldRefresh, setShouldRefresh] = useState(false);

	// Handle LLM Analysis
	useEffect(() => {
		if (needsAnalysis && !processStates.analysis.hasStarted) {
			const timer = setTimeout(() => {
				setProcessStates((prev) => ({
					...prev,
					analysis: { ...prev.analysis, isRunning: true, hasStarted: true },
				}));

				performLlmAnalysis(launchId).catch((error) => {
					console.error("Error performing LLM analysis:", error);
					setProcessStates((prev) => ({
						...prev,
						analysis: { ...prev.analysis, isRunning: false },
					}));
				});
			}, 300);

			return () => clearTimeout(timer);
		}
	}, [needsAnalysis, processStates.analysis.hasStarted, launchId]);

	// Handle Token Holdings Update
	useEffect(() => {
		// Create a consistent process identifier for this specific update
		const tokenUpdateKey = `tokenUpdate-${launchId}-${tokenAddress}`;

		if (
			needsTokenUpdate &&
			!processStates.tokenUpdate.hasStarted &&
			tokenAddress &&
			creatorAddress &&
			creatorInitialTokens
		) {
			// Check if an update is already in progress
			const updateInProgress =
				sessionStorage.getItem(tokenUpdateKey) === "running";
			if (updateInProgress) {
				console.log(
					`Token update for launch ${launchId} already in progress, skipping`,
				);
				return;
			}

			// Check if we've updated recently (localStorage persists across page refreshes)
			const lastUpdateTimeStr = localStorage.getItem(
				`lastTokenUpdate-${launchId}`,
			);
			const lastUpdateTime = lastUpdateTimeStr
				? Number.parseInt(lastUpdateTimeStr, 10)
				: 0;
			const currentTime = Date.now();

			// Increase the cooldown to 5 minutes to prevent frequent updates
			const shouldUpdate = currentTime - lastUpdateTime > 5 * 60 * 1000;

			if (shouldUpdate) {
				// Mark as running in session storage
				sessionStorage.setItem(tokenUpdateKey, "running");

				setProcessStates((prev) => ({
					...prev,
					tokenUpdate: {
						...prev.tokenUpdate,
						isRunning: true,
						hasStarted: true,
					},
				}));

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
						// Clear the running status
						sessionStorage.removeItem(tokenUpdateKey);
					})
					.catch((error) => {
						console.error("Error updating token holdings:", error);
						setProcessStates((prev) => ({
							...prev,
							tokenUpdate: { ...prev.tokenUpdate, isRunning: false },
						}));
						// Clear the running status on error too
						sessionStorage.removeItem(tokenUpdateKey);
					});
			} else {
				console.log(
					`Skipping token update for launch ${launchId} - updated recently`,
				);
				// Skip the update process entirely
				setProcessStates((prev) => ({
					...prev,
					tokenUpdate: {
						isRunning: false,
						isComplete: true,
						hasStarted: true,
					},
				}));
			}
		}
	}, [
		needsTokenUpdate,
		processStates.tokenUpdate.hasStarted,
		launchId,
		tokenAddress,
		creatorAddress,
		creatorInitialTokens,
	]);

	// Handle completion of processes
	const handleAnalysisComplete = () => {
		setProcessStates((prev) => ({
			...prev,
			analysis: { ...prev.analysis, isComplete: true, isRunning: false },
		}));
		setShouldRefresh(true);
	};

	const handleTokenUpdateComplete = () => {
		setProcessStates((prev) => ({
			...prev,
			tokenUpdate: { ...prev.tokenUpdate, isComplete: true, isRunning: false },
		}));
		setShouldRefresh(true);
	};

	// Refresh the page when all processes complete
	useEffect(() => {
		if (shouldRefresh) {
			const allComplete =
				(!needsAnalysis || processStates.analysis.isComplete) &&
				(!needsTokenUpdate || processStates.tokenUpdate.isComplete);

			if (allComplete) {
				const timer = setTimeout(() => {
					router.refresh();
				}, 500);

				return () => clearTimeout(timer);
			}
		}
	}, [shouldRefresh, processStates, needsAnalysis, needsTokenUpdate, router]);

	// Do not render anything if no processes need to run
	if (!needsAnalysis && !needsTokenUpdate) return null;

	return (
		<div className="container mx-auto mb-4">
			{needsAnalysis && (
				<BackgroundProcessIndicator
					processType="llmAnalysis"
					isActive={processStates.analysis.isRunning}
					onComplete={handleAnalysisComplete}
				/>
			)}

			{needsTokenUpdate && (
				<BackgroundProcessIndicator
					processType="tokenStats"
					isActive={processStates.tokenUpdate.isRunning}
					onComplete={handleTokenUpdateComplete}
				/>
			)}
		</div>
	);
}
