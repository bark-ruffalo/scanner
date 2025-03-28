"use client";

import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#DAB1DA] to-[#15162c] text-white">
			<div className="container mx-auto flex max-w-md flex-col items-center p-4 text-center">
				<h1 className="mb-4 font-bold text-4xl">404</h1>
				<p className="mb-8 text-lg">Page not found</p>
				<Link
					href="/"
					className="rounded-md bg-[#DAB1DA] px-4 py-2 font-medium text-gray-800 hover:bg-[#c99fc9]"
				>
					Return Home
				</Link>
			</div>
		</div>
	);
}
