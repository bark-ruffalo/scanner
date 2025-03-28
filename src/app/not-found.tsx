"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NotFound() {
	const router = useRouter();

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-[#15162c] text-white">
			<div className="container mx-auto flex max-w-md flex-col items-center p-4 text-center">
				<h1 className="mb-4 font-bold text-4xl">404</h1>
				<p className="mb-8 text-lg">Page not found</p>
				<button
					onClick={() => router.push("/")}
					className="rounded p-2 hover:bg-gray-200/80"
					aria-label="Return Home"
					type="button"
				>
					<ArrowLeft className="h-6 w-6 text-gray-800" />
				</button>
			</div>
		</div>
	);
}
