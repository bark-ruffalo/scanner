import { format } from "date-fns";
import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackButton } from "~/app/_components/BackButton";
import { LaunchProcessLoader } from "~/app/launch/[id]/launch-process-loader";
import {
	calculateBigIntPercentage,
	formatPercentage,
	formatTokenBalance,
	linkify,
} from "~/lib/utils";
import { getLaunchById, getLaunchMetadata } from "~/server/queries";

export type PageProps = {
	params: { id: string };
	searchParams: Record<string, string | string[] | undefined>;
};

// Add metadata generation
export async function generateMetadata(
	{ params }: { params: Promise<{ id: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> {
	const resolvedParams = await params;
	const launchId = Number.parseInt(resolvedParams.id, 10);
	if (Number.isNaN(launchId)) {
		return { title: "Invalid Launch | Scanner" };
	}
	return getLaunchMetadata(launchId);
}

// Make the main page component a server component again
export default async function LaunchDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<ReactNode> {
	const resolvedParams = await params;
	const launchId = Number.parseInt(resolvedParams.id, 10);
	if (Number.isNaN(launchId)) {
		notFound();
	}

	const launch = await getLaunchById(launchId);

	if (!launch) {
		notFound();
	}

	// Check if any LLM responses are missing or have default values
	const needsAnalysis =
		!launch.analysis ||
		launch.analysis === "-" ||
		!launch.summary ||
		launch.summary === "-" ||
		launch.rating === -1;

	// Extract token address, creator address, and initial allocation from the description
	const tokenAddressMatch = launch.description.match(
		/Token address: (0x[a-fA-F0-9]{40})/,
	);
	const creatorMatch = launch.description.match(
		/Creator address: (0x[a-fA-F0-9]{40})/,
	);
	const initialTokensMatch = launch.description.match(
		/Creator initial number of tokens: ([\d,]+)/,
	);

	const tokenAddress = tokenAddressMatch?.[1];
	const creatorAddress = creatorMatch?.[1];
	const creatorInitialTokens = initialTokensMatch?.[1]?.replace(/,/g, "");

	// Should we check for token holdings?
	const needsTokenUpdate = !!(
		tokenAddress &&
		creatorAddress &&
		creatorInitialTokens
	);

	// Calculate percentage of total supply held by creator if possible
	let percentageOfTotalSupplyFormatted: string | null = null;
	if (launch.creatorTokensHeld && launch.totalTokenSupply) {
		try {
			const creatorHeldBigInt = BigInt(launch.creatorTokensHeld);
			const totalBigInt = BigInt(launch.totalTokenSupply);
			// Use the helper function to calculate the percentage
			const result = calculateBigIntPercentage(creatorHeldBigInt, totalBigInt);
			if (result) {
				percentageOfTotalSupplyFormatted = result.formatted;
			}
		} catch (error) {
			console.error(
				"Error calculating percentage of total supply:",
				error,
				launch.creatorTokensHeld,
				launch.totalTokenSupply,
			);
			// Handle potential BigInt conversion errors if strings are invalid
		}
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 p-8 text-white">
			{/* Centralized process loader */}
			<LaunchProcessLoader
				launchId={launch.id}
				needsAnalysis={needsAnalysis}
				needsTokenUpdate={needsTokenUpdate}
				tokenAddress={tokenAddress}
				creatorAddress={creatorAddress}
				creatorInitialTokens={creatorInitialTokens ?? "0"}
			/>

			<div className="container mx-auto p-4">
				<div className="mb-4 flex flex-col items-center justify-center gap-4">
					<div className="flex items-center justify-center gap-4">
						<BackButton />
						<h1 className="font-bold text-2xl text-gray-800">{launch.title}</h1>
						{launch.imageUrl && (
							<Image
								src={launch.imageUrl}
								alt={`${launch.title} image`}
								width={72}
								height={72}
								className="rounded object-cover"
								unoptimized
							/>
						)}
					</div>
				</div>

				{/* Token Statistics Section */}
				{(launch.creatorTokenHoldingPercentage ||
					launch.creatorTokensHeld ||
					launch.sentToZeroAddress) && (
					<>
						<div className="mt-8">
							<h2 className="mb-4 font-bold text-xl">Recent developments:</h2>
						</div>
						<div className="rounded-lg border border-white/20 bg-gray-800 p-6">
							<div className="flex flex-col gap-1">
								{launch.sentToZeroAddress ? (
									<p>Creator token holdings: unknown</p>
								) : (
									<p>
										{typeof launch.creatorTokenHoldingPercentage === "string" &&
											launch.creatorTokenHoldingPercentage !== "" && (
												<>
													{formatPercentage(
														Number(launch.creatorTokenHoldingPercentage ?? "0"),
													)}{" "}
													of the initial token allocation is held by the creator
													{launch.creatorTokensHeld && (
														<>
															{" "}
															({formatTokenBalance(launch.creatorTokensHeld)}{" "}
															tokens
															{/* Add the percentage of total supply here */}
															{percentageOfTotalSupplyFormatted &&
																` / ${percentageOfTotalSupplyFormatted} of total supply`}
															)
														</>
													)}
													.
												</>
											)}
									</p>
								)}
								{launch.creatorTokenMovementDetails && (
									<p className="mt-2">{launch.creatorTokenMovementDetails}</p>
								)}
								{launch.tokenStatsUpdatedAt && (
									<p className="mt-2 text-gray-500 text-sm">
										Creator token stats last updated:{" "}
										{format(
											new Date(launch.tokenStatsUpdatedAt),
											"MMM d, yyyy HH:mm",
										)}
									</p>
								)}
							</div>
						</div>
					</>
				)}

				{/* LLM Generated Content */}
				<div className="mt-8">
					<h2 className="mb-4 font-bold text-xl">
						The following is generated by an LLM:
					</h2>
				</div>
				<div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-white/20 bg-gray-800 p-6">
					{launch.summary && launch.summary !== "-" && (
						<div className="mb-4 break-words">
							<h2 className="font-semibold text-lg">Summary</h2>
							<p className="mt-1 break-words">{launch.summary}</p>
						</div>
					)}
					{launch.analysis && launch.analysis !== "-" && (
						<div className="mb-4 break-words">
							<h2 className="font-semibold text-lg">Analysis</h2>
							<p className="mt-1 whitespace-pre-wrap break-words">
								{launch.analysis.replace(/\n\nGenerated with LLM: .*$/, "")}
							</p>
						</div>
					)}
					{launch.rating !== undefined && launch.rating !== -1 && (
						<p>
							<strong>Rating:</strong> {launch.rating}
						</p>
					)}
					{/* Container for LLM metadata */}
					<div>
						{/* Extract and display the LLM model information if present */}
						{launch.analysis?.includes("Generated with LLM:") && (
							<p className="text-gray-500 text-sm">
								{launch.analysis?.match(/Generated with LLM: .*$/)?.[0] || ""}
							</p>
						)}
						{launch.llmAnalysisUpdatedAt && (
							<p className="text-gray-500 text-sm">
								LLM responses last updated:{" "}
								{format(
									new Date(launch.llmAnalysisUpdatedAt),
									"MMM d, yyyy HH:mm",
								)}
							</p>
						)}
					</div>
				</div>

				{/* Description Section */}
				<div className="mt-8">
					<h2 className="mb-4 font-bold text-xl">Original investment data:</h2>
				</div>
				<div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-white/20 bg-gray-800 p-6">
					{launch.description && launch.description !== "-" && (
						<div className="break-words">
							<div className="mt-1 whitespace-pre-wrap break-words">
								{linkify(launch.description).map((part, index) => {
									if (typeof part === "string") {
										const textKey = `text-${part.substring(0, 10).trim()}-${index}`;
										return <span key={textKey}>{part}</span>;
									}
									const urlKey = `link-${part.url.replace(/[^a-z0-9]/gi, "-").substring(0, 20)}-${index}`;
									return (
										<a
											key={urlKey}
											href={part.url}
											target="_blank"
											rel="noopener noreferrer"
											className="break-all text-blue-500 hover:underline"
										>
											{part.url}
										</a>
									);
								})}
							</div>
							{launch.basicInfoUpdatedAt && (
								<p className="mt-4 text-gray-500 text-sm">
									Investment info last updated:{" "}
									{format(
										new Date(launch.basicInfoUpdatedAt),
										"MMM d, yyyy HH:mm",
									)}
								</p>
							)}
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

// Optional: Generate static paths if you know the possible launch IDs beforehand
// export async function generateStaticParams() {
//   // Fetch all launch IDs
//   // const launches = await getAllLaunchIds(); // Assuming a function like this exists
//   // return launches.map((launch) => ({
//   //   id: launch.id.toString(),
//   // }));
// }
