import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { LaunchpadFilterDropdown } from "~/components/LaunchpadFilterDropdown";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";

export const metadata: Metadata = {
	title: "Scanner",
	description:
		"A web app that monitors the main launchpads from crypto and traditional finance, outputting all the launches summarized and evaluated as potential investments and offering various filters.",
	icons: [{ rel: "icon", url: "/favicon.png" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

async function Navbar() {
	const distinctLaunchpads = await db
		.selectDistinct({ launchpad: launches.launchpad })
		.from(launches);

	const launchpadNames = distinctLaunchpads.map(({ launchpad }) => launchpad);

	return (
		<nav className="sticky top-0 z-20 bg-gray-900 p-4 text-white shadow-md">
			<div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-6">
					<Link
						href="/"
						className="text-gray-300 hover:text-purple-400"
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
						className="text-gray-300 hover:text-purple-400"
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
				</div>
				<div className="flex items-center gap-2">
					<span className="mr-1 text-gray-400 text-sm">Filter:</span>
					<LaunchpadFilterDropdown launchpads={launchpadNames} />
				</div>
			</div>
		</nav>
	);
}

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body className="bg-gray-900 text-white">
				<Navbar />
				{children}
			</body>
		</html>
	);
}
