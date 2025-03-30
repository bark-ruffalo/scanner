"use client";

import { ChevronDown, Loader2 } from "lucide-react"; // Add Loader2 icon
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react"; // Import useRef

interface LaunchpadFilterDropdownProps {
	launchpads: string[];
}

// Create a client component that uses useSearchParams
function FilterContent({ launchpads }: LaunchpadFilterDropdownProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentFilter = searchParams.get("filter") ?? "All";
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const loadingRef = useRef(false);
	const dropdownRef = useRef<HTMLDivElement>(null); // Create a ref for the dropdown container

	// Track navigation changes without dependencies
	const navigationRef = useRef({ pathname, searchParams });

	useEffect(() => {
		// Update ref when navigation changes
		navigationRef.current = { pathname, searchParams };

		// Reset loading state if navigation changed while loading
		if (loadingRef.current) {
			setIsLoading(false);
			loadingRef.current = false;
		}
	}, [pathname, searchParams]);

	const handleSelect = (filter: string) => {
		// Set loading state while router navigation is happening
		setIsLoading(true);
		loadingRef.current = true;
		const params = new URLSearchParams(searchParams.toString());
		if (filter === "All") {
			params.delete("filter");
		} else {
			params.set("filter", filter);
		}
		// Use router.push to navigate, preserving other potential query params
		router.push(`${pathname}?${params.toString()}`);
		setIsOpen(false); // Close dropdown after selection
	};

	// Close dropdown if clicked outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			// Check if the click is outside the dropdown element using the ref
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		// Bind the event listener only when the dropdown is open
		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		} else {
			document.removeEventListener("mousedown", handleClickOutside);
		}

		// Cleanup the event listener on component unmount or when isOpen changes
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]); // Re-run effect when isOpen changes

	return (
		// Attach the ref to the main container div
		<div className="relative inline-block text-left" ref={dropdownRef}>
			<div>
				<button
					type="button"
					disabled={isLoading}
					// Removed data-dropdown-button as ref is used now
					className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-gray-700 px-3 py-2 font-semibold text-sm text-white shadow-sm ring-1 ring-gray-600 ring-inset hover:bg-gray-600 disabled:opacity-70"
					onClick={() => setIsOpen(!isOpen)}
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Loading...
						</>
					) : (
						<>
							{currentFilter === "All" ? "All Launchpads" : currentFilter}
							<ChevronDown
								className="-mr-1 h-5 w-5 text-gray-400"
								aria-hidden="true"
							/>
						</>
					)}
				</button>
			</div>

			{isOpen && (
				<div
					// Removed data-dropdown-menu as ref is used now
					className="absolute right-0 z-10 mt-2 max-h-60 w-56 origin-top-right overflow-y-auto rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" // Added max-height and overflow
				>
					<div className="py-1">
						<button
							type="button"
							onClick={() => handleSelect("All")}
							className={`block w-full px-4 py-2 text-left text-sm ${
								currentFilter === "All"
									? "bg-[var(--color-scanner-purple-dark)] text-white"
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
										? "bg-[var(--color-scanner-purple-dark)] text-white"
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
		<Suspense
			fallback={
				<div className="inline-flex h-10 w-48 items-center justify-center rounded-md bg-gray-700 px-3 py-2">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					Loading...
				</div>
			}
		>
			<FilterContent {...props} />
		</Suspense>
	);
}
