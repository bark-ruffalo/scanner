import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClientNavbar } from "~/app/_components/ClientNavbar";

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

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body suppressHydrationWarning className="bg-gray-900 text-white">
				<ClientNavbar />
				{children}
			</body>
		</html>
	);
}
