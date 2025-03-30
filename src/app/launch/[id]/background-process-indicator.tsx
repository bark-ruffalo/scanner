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
	const [progress, setProgress] = useState(0);
	const [isComplete, setIsComplete] = useState(false);

	useEffect(() => {
		if (!isActive) {
			setProgress(0);
			setIsComplete(false);
			return;
		}

		const duration = processType === "tokenStats" ? 5000 : 15000; // Token stats faster than LLM
		const interval = 100;
		const steps = duration / interval;
		const increment = 100 / steps;

		let currentProgress = 0;
		const timer = setInterval(() => {
			currentProgress += increment;

			// Slow down progress as it approaches completion for natural feeling
			const easedProgress =
				currentProgress < 70
					? currentProgress
					: 70 + ((currentProgress - 70) / 30) ** 2 * 30;

			setProgress(Math.min(easedProgress, 99.5));

			if (currentProgress >= 100) {
				clearInterval(timer);
				setProgress(100);
				setIsComplete(true);
				onComplete?.();
			}
		}, interval);

		return () => clearInterval(timer);
	}, [isActive, processType, onComplete]);

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
				<span className="text-gray-300 text-xs">{Math.round(progress)}%</span>
			</div>
			<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-600">
				<div
					className={cn(
						"h-full transition-all duration-300 ease-in-out",
						isComplete ? "bg-green-500" : "bg-blue-500",
					)}
					style={{ width: `${progress}%` }}
				/>
			</div>
		</div>
	);
}
