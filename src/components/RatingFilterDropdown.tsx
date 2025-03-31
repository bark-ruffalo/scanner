"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

// Create a client component that uses useSearchParams
function FilterContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams() || new URLSearchParams();
	const currentFilter = searchParams?.get("minRating") ?? "2";
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const loadingRef = useRef(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

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

	const handleSelect = (rating: string) => {
		// If the selected rating is the same as the current filter, just close the dropdown
		if (rating === currentFilter) {
			setIsOpen(false);
			return;
		}

		// Set loading state while router navigation is happening
		setIsLoading(true);
		loadingRef.current = true;
		const params = new URLSearchParams(searchParams?.toString() || "");
		params.set("minRating", rating);
		router.push(`${pathname}?${params.toString()}`);
		setIsOpen(false);
	};

	// Close dropdown if clicked outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		} else {
			document.removeEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	// Generate rating options from 0 to 10
	const ratingOptions = Array.from({ length: 11 }, (_, i) => i.toString());

	return (
		<div className="relative inline-block text-left" ref={dropdownRef}>
			<div>
				<button
					type="button"
					disabled={isLoading}
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
							Min Rating: {currentFilter}
							<ChevronDown
								className="-mr-1 h-5 w-5 text-gray-400"
								aria-hidden="true"
							/>
						</>
					)}
				</button>
			</div>

			{isOpen && (
				<div className="absolute right-0 z-10 mt-2 max-h-60 w-56 origin-top-right overflow-y-auto rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
					<div className="py-1">
						{ratingOptions.map((rating) => (
							<button
								type="button"
								key={rating}
								onClick={() => handleSelect(rating)}
								className={`block w-full px-4 py-2 text-left text-sm ${
									currentFilter === rating
										? "bg-[var(--color-scanner-purple-dark)] text-white"
										: "text-gray-300 hover:bg-gray-700 hover:text-white"
								}`}
							>
								{rating}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Create a main export with Suspense boundary
export function RatingFilterDropdown() {
	return (
		<Suspense
			fallback={
				<div className="inline-flex h-10 w-48 items-center justify-center rounded-md bg-gray-700 px-3 py-2">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					Loading...
				</div>
			}
		>
			<FilterContent />
		</Suspense>
	);
}
