"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { performLlmAnalysis } from "./actions";
import { BackgroundProcessIndicator } from "./background-process-indicator";

interface LlmAnalysisUpdaterProps {
	launchId: number;
	needsAnalysis: boolean;
}

export function LlmAnalysisUpdater({
	launchId,
	needsAnalysis,
}: LlmAnalysisUpdaterProps) {
	const router = useRouter();
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [analysisComplete, setAnalysisComplete] = useState(false);
	const [hasStarted, setHasStarted] = useState(false);

	useEffect(() => {
		if (needsAnalysis && !hasStarted) {
			// Set a small delay before showing the loading indicator
			// to prevent flickering if the analysis is quick
			const timer = setTimeout(() => {
				setIsAnalyzing(true);
				setHasStarted(true);

				// Start the analysis process
				performLlmAnalysis(launchId)
					.then(() => {
						// We'll wait for the onComplete callback before refreshing
					})
					.catch((error) => {
						console.error("Error performing LLM analysis:", error);
						setIsAnalyzing(false);
					});
			}, 300);

			return () => clearTimeout(timer);
		}
	}, [needsAnalysis, hasStarted, launchId]);

	const handleAnalysisComplete = () => {
		// Wait briefly before refreshing page to show updated data
		setTimeout(() => {
			setAnalysisComplete(true);
			router.refresh();
		}, 500);
	};

	if (!needsAnalysis) return null;

	return (
		<BackgroundProcessIndicator
			processType="llmAnalysis"
			isActive={isAnalyzing}
			onComplete={handleAnalysisComplete}
		/>
	);
}
