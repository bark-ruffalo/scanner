"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FilterDropdown } from "~/components/common/FilterDropdown";

export function ClientNavbar() {
	// Get current path to determine if we should show filters
	const pathname = usePathname();
	const isHomePage = pathname === "/" || pathname === "";

	// Only store launchpad data if on homepage
	const [launchpadNames, setLaunchpadNames] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [lastLoadTime, setLastLoadTime] = useState(0);

	// Only fetch launchpads when on the homepage
	useEffect(() => {
		// Refresh data if:
		// 1. We're on the homepage
		// 2. AND either:
		//    a. We have no data yet, OR
		//    b. It's been more than 5 minutes since last load
		// 3. AND we're not currently loading
		const shouldRefresh =
			isHomePage &&
			(launchpadNames.length === 0 ||
				Date.now() - lastLoadTime > 5 * 60 * 1000) && // TODO: maybe increase the interval in the future, or find a better way
			!isLoading;

		if (shouldRefresh) {
			setIsLoading(true);
			// Create an API route to fetch this data without running server queries directly
			fetch("/api/launchpads")
				.then((res) => res.json())
				.then((data) => {
					setLaunchpadNames(data);
					setLastLoadTime(Date.now());
					setIsLoading(false);
				})
				.catch((error) => {
					console.error("Error fetching launchpads:", error);
					setIsLoading(false);
				});
		}
	}, [isHomePage, launchpadNames.length, isLoading, lastLoadTime]);

	// Prepare rating options for the dropdown
	const ratingOptions = Array.from({ length: 11 }, (_, i) => ({
		value: i.toString(),
		label: i.toString(),
	}));

	// Prepare launchpad options for the dropdown
	const launchpadOptions = [
		{ value: "All", label: "All Launchpads" },
		...launchpadNames.map((name) => ({ value: name, label: name })),
	];

	return (
		<nav className="sticky top-0 z-20 bg-gray-900 p-4 text-white shadow-md">
			<div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-6">
					<Link
						href="/"
						className="text-gray-300 hover:text-[var(--color-scanner-purple-dark)]"
						aria-label="Home"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							role="img"
							aria-labelledby="homeIconTitle"
						>
							<title id="homeIconTitle">Home</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
							/>
						</svg>
					</Link>
					<a
						href="https://github.com/bark-ruffalo/scanner"
						target="_blank"
						rel="noopener noreferrer"
						className="text-gray-300 hover:text-[var(--color-scanner-purple-dark)]"
						aria-label="View source code on GitHub"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6"
							fill="currentColor"
							viewBox="0 0 16 16"
							role="img"
							aria-labelledby="githubIconTitle"
						>
							<title id="githubIconTitle">GitHub Repository</title>
							<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
						</svg>
					</a>
					<Link
						href="/admin"
						className="text-gray-300 hover:text-[var(--color-scanner-purple-dark)]"
						aria-label="Admin"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							role="img"
							aria-labelledby="adminIconTitle"
						>
							<title id="adminIconTitle">Admin</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
							/>
						</svg>
					</Link>
				</div>
				{/* Only show filters on the home page */}
				{isHomePage && (
					<div className="flex items-center gap-2">
						<span className="mr-1 text-gray-400 text-sm">Filters:</span>
						<FilterDropdown
							options={ratingOptions}
							paramName="minRating"
							defaultValue="2"
							label="Min Rating"
						/>
						<FilterDropdown
							options={launchpadOptions}
							paramName="filter"
							defaultValue="All"
							width="w-56"
						/>
					</div>
				)}
			</div>
		</nav>
	);
}
