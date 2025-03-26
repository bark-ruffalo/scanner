"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react"; // Using lucide-react for icon

interface LaunchpadFilterDropdownProps {
	launchpads: string[];
}

// Create a client component that uses useSearchParams
function FilterContent({ launchpads }: LaunchpadFilterDropdownProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentFilter = searchParams.get("filter") ?? "All";
	const [isOpen, setIsOpen] = useState(false);

	const handleSelect = (filter: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (filter === "All") {
			params.delete("filter");
		} else {
			params.set("filter", filter);
		}
		// Use router.push to navigate, preserving other potential query params
		router.push(`/?${params.toString()}`);
		setIsOpen(false); // Close dropdown after selection
	};

	// Close dropdown if clicked outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			// Check if the click is outside the dropdown elements (you might need a ref here for more robustness)
			// For simplicity, we'll just close it. A more robust solution involves refs.
			if (isOpen) {
				// A simple check, improve with refs if needed
				const target = event.target as HTMLElement;
				if (!target.closest('[data-dropdown-button]') && !target.closest('[data-dropdown-menu]')) {
					setIsOpen(false);
				}
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);


	return (
		<div className="relative inline-block text-left">
			<div>
				<button
					type="button"
					data-dropdown-button // Add data attribute for outside click detection
					className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-gray-700 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-gray-600"
					onClick={() => setIsOpen(!isOpen)}
				>
					{currentFilter === "All" ? "All Launchpads" : currentFilter}
					<ChevronDown className="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
				</button>
			</div>

			{isOpen && (
				<div
					data-dropdown-menu // Add data attribute for outside click detection
					className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none max-h-60 overflow-y-auto" // Added max-height and overflow
				>
					<div className="py-1">
						<button
							type="button"
							onClick={() => handleSelect("All")}
							className={`block w-full px-4 py-2 text-left text-sm ${
								currentFilter === "All"
									? "bg-purple-700 text-white"
									: "text-gray-300 hover:bg-gray-700 hover:text-white"
							}`}
						>
							All Launchpads
						</button>
						{launchpads.map((launchpad) => (
							<button
								type="button"
								key={launchpad}
								onClick={() => handleSelect(launchpad)}
								className={`block w-full px-4 py-2 text-left text-sm ${
									currentFilter === launchpad
										? "bg-purple-700 text-white"
										: "text-gray-300 hover:bg-gray-700 hover:text-white"
								}`}
							>
								{launchpad}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Create a main export with Suspense boundary
export function LaunchpadFilterDropdown(props: LaunchpadFilterDropdownProps) {
	return (
		<Suspense fallback={<div className="h-10 w-48 animate-pulse rounded-md bg-gray-700" />}>
			<FilterContent {...props} />
		</Suspense>
	);
}