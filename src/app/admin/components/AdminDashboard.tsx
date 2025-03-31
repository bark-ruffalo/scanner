"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	deleteLaunch,
	reanalyzeAllLaunches,
	reanalyzeLaunch,
	updateAllTokenStats,
	updateLaunchTokenStats,
} from "../actions";

// Define the Launch interface based on the types used in the queries module
interface Launch {
	id: number;
	title: string;
	launchpad: string;
	rating: number;
	updatedAt: Date | null;
	description: string;
}

interface AdminDashboardProps {
	launches: Launch[];
}

export function AdminDashboard({ launches }: AdminDashboardProps) {
	const router = useRouter();
	const [isProcessing, setIsProcessing] = useState(false);
	const [actionResults, setActionResults] = useState<{
		message: string;
		type: "success" | "error";
	} | null>(null);

	const handleDelete = async (id: number) => {
		if (!confirm("Are you sure you want to delete this launch?")) {
			return;
		}

		try {
			setIsProcessing(true);
			const result = await deleteLaunch(id);
			setActionResults({
				message: "Launch deleted successfully",
				type: "success",
			});
			router.refresh();
		} catch (error) {
			console.error("Error deleting launch:", error);
			setActionResults({
				message: `Error deleting launch: ${error instanceof Error ? error.message : "Unknown error"}`,
				type: "error",
			});
		} finally {
			setIsProcessing(false);
		}
	};

	const handleUpdateStats = async (
		id: number,
		description: string,
		isAll = false,
	) => {
		try {
			setIsProcessing(true);

			if (isAll) {
				const results = await updateAllTokenStats();
				setActionResults({
					message: `Updated ${results.success} launches, ${results.failed} failed`,
					type: "success",
				});
			} else {
				// Extract token info from description
				const tokenAddressMatch = description.match(
					/Token address: (0x[a-fA-F0-9]{40})/,
				);
				const creatorMatch = description.match(
					/Creator address: (0x[a-fA-F0-9]{40})/,
				);
				const initialTokensMatch = description.match(
					/Creator initial number of tokens: ([\d,]+)/,
				);

				if (
					!tokenAddressMatch?.[1] ||
					!creatorMatch?.[1] ||
					!initialTokensMatch?.[1]
				) {
					throw new Error("Could not extract token info from description");
				}

				await updateLaunchTokenStats(
					id,
					tokenAddressMatch[1],
					creatorMatch[1],
					initialTokensMatch[1].replace(/,/g, ""),
				);
				setActionResults({
					message: "Token stats updated successfully",
					type: "success",
				});
			}

			router.refresh();
		} catch (error) {
			console.error("Error updating token stats:", error);
			setActionResults({
				message: `Error updating token stats: ${error instanceof Error ? error.message : "Unknown error"}`,
				type: "error",
			});
		} finally {
			setIsProcessing(false);
		}
	};

	const handleReanalyze = async (id: number, isAll = false) => {
		try {
			setIsProcessing(true);

			if (isAll) {
				const results = await reanalyzeAllLaunches();
				setActionResults({
					message: `Reanalyzed ${results.success} launches, ${results.failed} failed`,
					type: "success",
				});
			} else {
				const result = await reanalyzeLaunch(id);
				setActionResults({
					message: `Launch reanalyzed with new rating: ${result.rating}/10`,
					type: "success",
				});
			}

			router.refresh();
		} catch (error) {
			console.error("Error reanalyzing launch:", error);
			setActionResults({
				message: `Error reanalyzing launch: ${error instanceof Error ? error.message : "Unknown error"}`,
				type: "error",
			});
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<main className="min-h-screen bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 p-8 text-white">
			<div className="container mx-auto">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="font-bold text-3xl">Admin Dashboard</h1>
					<button
						type="button"
						className="rounded-lg bg-[var(--color-scanner-purple-dark)] px-4 py-2 text-white hover:bg-opacity-90"
						onClick={() => router.push("/admin/new")}
					>
						Add New Launch
					</button>
				</div>

				{actionResults && (
					<div
						className={`mb-4 rounded-lg p-4 ${
							actionResults.type === "success"
								? "bg-green-800 text-white"
								: "bg-red-800 text-white"
						}`}
					>
						{actionResults.message}
						<button
							type="button"
							className="ml-2 font-bold"
							onClick={() => setActionResults(null)}
						>
							×
						</button>
					</div>
				)}

				<div className="rounded-lg bg-gray-800 p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-semibold text-xl">Launches</h2>
						<div className="flex gap-4">
							<button
								type="button"
								className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
								onClick={() => handleUpdateStats(0, "", true)}
								disabled={isProcessing}
							>
								Update All Token Stats
							</button>
							<button
								type="button"
								className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
								onClick={() => handleReanalyze(0, true)}
								disabled={isProcessing}
							>
								Reanalyze All
							</button>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full table-auto">
							<thead>
								<tr className="border-gray-700 border-b">
									<th className="px-4 py-2 text-left">Title</th>
									<th className="px-4 py-2 text-left">Launchpad</th>
									<th className="px-4 py-2 text-left">Rating</th>
									<th className="px-4 py-2 text-left">Last Updated</th>
									<th className="px-4 py-2 text-left">Actions</th>
								</tr>
							</thead>
							<tbody>
								{launches.map((launch) => (
									<tr
										key={launch.id}
										className="border-gray-700 border-b hover:bg-gray-700"
									>
										<td className="px-4 py-2">
											<Link
												href={`/launch/${launch.id}`}
												className="text-blue-400 hover:underline"
											>
												{launch.title}
											</Link>
										</td>
										<td className="px-4 py-2">{launch.launchpad}</td>
										<td className="px-4 py-2">
											{launch.rating === -1 ? "Not rated" : launch.rating}
										</td>
										<td className="px-4 py-2">
											{launch.updatedAt
												? format(launch.updatedAt, "yyyy-MM-dd HH:mm")
												: "Never"}
										</td>
										<td className="px-4 py-2">
											<div className="flex gap-2">
												<button
													type="button"
													className="rounded bg-yellow-600 px-3 py-1 text-white hover:bg-yellow-700 disabled:opacity-50"
													onClick={() =>
														router.push(`/admin/edit/${launch.id}`)
													}
													disabled={isProcessing}
												>
													Edit
												</button>
												<button
													type="button"
													className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:opacity-50"
													onClick={() => handleDelete(launch.id)}
													disabled={isProcessing}
												>
													Delete
												</button>
												<button
													type="button"
													className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
													onClick={() =>
														handleUpdateStats(launch.id, launch.description)
													}
													disabled={isProcessing}
												>
													Update Stats
												</button>
												<button
													type="button"
													className="rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700 disabled:opacity-50"
													onClick={() => handleReanalyze(launch.id)}
													disabled={isProcessing}
												>
													Reanalyze
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</main>
	);
}
