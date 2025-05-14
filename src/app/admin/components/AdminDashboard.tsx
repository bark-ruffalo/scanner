"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	debugLaunchpadHistoricalEvents,
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
	tokenAddress?: string | null;
	creatorAddress?: string | null;
	creatorInitialTokensHeld?: string | null;
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

	// --- Debug Launchpad State ---
	const [debugLaunchpad, setDebugLaunchpad] = useState<string>(
		"Virtuals Protocol", // Default to the new consolidated launchpad
	);
	const [debugFrom, setDebugFrom] = useState<string>(""); // Will be used for API ID for Virtuals
	const [debugTo, setDebugTo] = useState<string>(""); // Kept for other launchpads, unused for Virtuals API ID debug
	const [debugVirtualsApiId, setDebugVirtualsApiId] = useState<string>("");
	const [debugResult, setDebugResult] = useState<string>("");
	const [debugLoading, setDebugLoading] = useState(false);
	const [overwriteExisting, setOverwriteExisting] = useState(false);

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
		tokenAddress?: string | null,
		creatorAddress?: string | null,
		creatorInitialTokensHeld?: string | null,
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
				const result = await updateLaunchTokenStats(
					id,
					tokenAddress ?? undefined,
					creatorAddress ?? undefined,
					creatorInitialTokensHeld ?? undefined,
				);
				if (result?.skipped) {
					setActionResults({
						message: result.reason || "Update skipped.",
						type: "success",
					});
				} else {
					setActionResults({
						message: "Token stats updated successfully",
						type: "success",
					});
				}
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

	const handleDebug = async () => {
		setDebugLoading(true);
		setDebugResult("");
		try {
			let fromValue = debugFrom.trim();
			let toValue = debugTo.trim() || undefined;
			const launchpadValue = debugLaunchpad;

			if (debugLaunchpad === "Virtuals Protocol") {
				if (!debugVirtualsApiId.trim()) {
					setDebugResult("Error: Virtuals Launch API ID is required");
					setDebugLoading(false);
					return;
				}
				// For Virtuals Protocol, 'from' will be the API ID, 'to' is not used for single ID debug
				fromValue = debugVirtualsApiId.trim();
				toValue = undefined; // Explicitly set to undefined
			} else {
				// For old launchpads (to be removed)
				if (!fromValue) {
					setDebugResult("Error: From block/slot is required");
					setDebugLoading(false);
					return;
				}
			}

			const res = await debugLaunchpadHistoricalEvents({
				launchpad: launchpadValue,
				from: fromValue,
				to: toValue,
				overwriteExisting,
			});
			setDebugResult(res.message);
		} catch (e) {
			setDebugResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
		setDebugLoading(false);
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

				{/* Debug Launchpad Historical Events Section */}
				<div className="mb-8 rounded-lg bg-gray-900 p-6 shadow-lg">
					<h2 className="mb-4 font-semibold text-xl">
						Debug Launchpad Historical Events
					</h2>
					<div className="flex flex-col gap-4 md:flex-row md:items-end">
						<div>
							<label
								htmlFor="debug-launchpad-select"
								className="mb-1 block font-medium"
							>
								Launchpad
							</label>
							<select
								id="debug-launchpad-select"
								className="w-full rounded-lg bg-gray-800 px-4 py-2 text-white"
								value={debugLaunchpad}
								onChange={(e) => {
									setDebugLaunchpad(e.target.value);
									// Reset specific fields when launchpad changes
									setDebugVirtualsApiId("");
									setDebugFrom("");
									setDebugTo("");
								}}
							>
								<option value="Virtuals Protocol">Virtuals Protocol</option>
								{/* Keep old options for now, will be removed later */}
								<option value="VIRTUALS Protocol (Base)">
									VIRTUALS Protocol (Base) - Legacy
								</option>
								<option value="VIRTUALS Protocol (Solana)">
									VIRTUALS Protocol (Solana) - Legacy
								</option>
							</select>
						</div>
						{debugLaunchpad === "Virtuals Protocol" ? (
							<div>
								<label
									htmlFor="debug-virtuals-api-id"
									className="mb-1 block font-medium"
								>
									Virtuals Launch API ID (required)
								</label>
								<input
									id="debug-virtuals-api-id"
									type="text"
									className="w-full rounded-lg bg-gray-800 px-4 py-2 text-white"
									value={debugVirtualsApiId}
									onChange={(e) => setDebugVirtualsApiId(e.target.value)}
									required
								/>
							</div>
						) : (
							<>
								<div>
									<label
										htmlFor="debug-from"
										className="mb-1 block font-medium"
									>
										From Block/Slot (required)
									</label>
									<input
										id="debug-from"
										type="text"
										className="w-full rounded-lg bg-gray-800 px-4 py-2 text-white"
										value={debugFrom}
										onChange={(e) => setDebugFrom(e.target.value)}
										required
									/>
								</div>
								<div>
									<label htmlFor="debug-to" className="mb-1 block font-medium">
										To Block/Slot (optional)
									</label>
									<input
										id="debug-to"
										type="text"
										className="w-full rounded-lg bg-gray-800 px-4 py-2 text-white"
										value={debugTo}
										onChange={(e) => setDebugTo(e.target.value)}
									/>
								</div>
							</>
						)}
						<div className="flex items-center gap-2 pt-5">
							<input
								id="overwrite-existing"
								type="checkbox"
								className="h-4 w-4 rounded border-gray-300 bg-gray-800 text-purple-600 focus:ring-purple-500"
								checked={overwriteExisting}
								onChange={(e) => setOverwriteExisting(e.target.checked)}
							/>
							<label htmlFor="overwrite-existing" className="font-medium">
								Overwrite Existing Launches
							</label>
						</div>
						<div>
							<button
								type="button"
								className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
								disabled={debugLoading}
								onClick={handleDebug}
							>
								{debugLoading ? "Running..." : "Run Debug"}
							</button>
						</div>
					</div>
					{debugResult && (
						<div className="mt-4 rounded bg-gray-800 p-3 text-sm text-white">
							{debugResult}
						</div>
					)}
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
								onClick={() =>
									handleUpdateStats(0, undefined, undefined, undefined, true)
								}
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
												target="_blank"
												rel="noopener noreferrer"
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
														handleUpdateStats(
															launch.id,
															launch.tokenAddress,
															launch.creatorAddress,
															launch.creatorInitialTokensHeld,
														)
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
