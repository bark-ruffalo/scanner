import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { ClientNavbar } from "~/components/ClientNavbar";
import { FilterDropdown } from "~/components/common/FilterDropdown";
import { getDistinctLaunchpads } from "~/server/queries";

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

async function NavbarWrapper() {
	// Only fetch launchpad data once in the server component
	const launchpadNames = await getDistinctLaunchpads();

	// Pass the data to the client component
	return <ClientNavbar launchpadNames={launchpadNames} />;
}

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body className="bg-gray-900 text-white">
				<NavbarWrapper />
				{children}
			</body>
		</html>
	);
}
