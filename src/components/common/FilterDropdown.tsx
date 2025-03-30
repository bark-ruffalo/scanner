"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

interface FilterOption {
	value: string;
	label: string;
}

interface FilterDropdownProps {
	options: FilterOption[];
	paramName: string;
	defaultValue: string;
	label?: string;
	width?: string;
}

function FilterContent({
	options,
	paramName,
	defaultValue,
	label,
	width = "w-48",
}: FilterDropdownProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentValue = searchParams.get(paramName) ?? defaultValue;
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

	const handleSelect = (value: string) => {
		setIsLoading(true);
		loadingRef.current = true;
		const params = new URLSearchParams(searchParams.toString());

		if (value === defaultValue && paramName === "filter") {
			// Special case for filter dropdown with default "All" value
			params.delete(paramName);
		} else {
			params.set(paramName, value);
		}

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

	// Find current option label
	const currentOption = options.find((option) => option.value === currentValue);
	const buttonLabel = currentOption?.label || currentValue;

	return (
		<div
			className={`relative inline-block text-left ${width}`}
			ref={dropdownRef}
		>
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
						{label ? `${label}: ${buttonLabel}` : buttonLabel}
						<ChevronDown
							className="-mr-1 ml-2 h-5 w-5 text-gray-400"
							aria-hidden="true"
						/>
					</>
				)}
			</button>

			{isOpen && (
				<div className="absolute right-0 z-10 mt-2 max-h-60 w-full origin-top-right overflow-y-auto rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
					<div className="py-1">
						{options.map((option) => (
							<button
								type="button"
								key={option.value}
								onClick={() => handleSelect(option.value)}
								className={`block w-full px-4 py-2 text-left text-sm ${
									currentValue === option.value
										? "bg-[var(--color-scanner-purple-dark)] text-white"
										: "text-gray-300 hover:bg-gray-700 hover:text-white"
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function FilterDropdown(props: FilterDropdownProps) {
	return (
		<Suspense
			fallback={
				<div
					className={`inline-flex h-10 ${props.width || "w-48"} items-center justify-center rounded-md bg-gray-700 px-3 py-2`}
				>
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					Loading...
				</div>
			}
		>
			<FilterContent {...props} />
		</Suspense>
	);
}
