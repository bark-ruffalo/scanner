"use client";

import { useEffect, useState } from "react";

// Simple utility for conditional class names
const cn = (...classes: (string | undefined)[]) => {
	return classes.filter(Boolean).join(" ");
};

export type ProcessType = "tokenStats" | "llmAnalysis";

interface BackgroundProcessIndicatorProps {
	processType: ProcessType;
	isActive: boolean;
	onComplete?: () => void;
	className?: string;
}

export function BackgroundProcessIndicator({
	processType,
	isActive,
	onComplete,
	className,
}: BackgroundProcessIndicatorProps) {
	const [isComplete, setIsComplete] = useState(false);

	// Track if this process has already been completed
	const [hasCompleted, setHasCompleted] = useState(false);

	useEffect(() => {
		if (!isActive) {
			setIsComplete(false);
			return;
		}

		// Only trigger the completion timer once
		if (hasCompleted) return;

		// Use localStorage to ensure we don't run the same process twice
		const processKey = `process-${processType}-${Date.now()}`;
		if (localStorage.getItem(processKey)) return;

		// Store that we've started this process
		localStorage.setItem(processKey, "true");

		// Simulate completion for demonstration purposes
		// In real production, this would be triggered by the actual task completion
		const duration = processType === "tokenStats" ? 5000 : 15000;
		const timer = setTimeout(() => {
			if (hasCompleted) return;
			setIsComplete(true);
			setHasCompleted(true);
			onComplete?.();

			// Clean up after 10 minutes
			setTimeout(
				() => {
					localStorage.removeItem(processKey);
				},
				10 * 60 * 1000,
			);
		}, duration);

		return () => clearTimeout(timer);
	}, [isActive, processType, onComplete, hasCompleted]);

	const labels = {
		tokenStats: "Updating token statistics...",
		llmAnalysis: "Running AI analysis...",
	};

	if (!isActive && !isComplete) return null;

	return (
		<div
			className={cn(
				"mb-4 overflow-hidden rounded-lg bg-gray-700 p-4",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm text-white">
					{isComplete
						? `${labels[processType].replace("...", "")} complete`
						: labels[processType]}
				</span>
			</div>
			{!isComplete && (
				<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-600">
					<div className="h-full w-1/3 animate-indeterminate-loading rounded-full bg-blue-500" />
				</div>
			)}
			{isComplete && (
				<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-600">
					<div className="h-full w-full bg-green-500" />
				</div>
			)}
		</div>
	);
}
