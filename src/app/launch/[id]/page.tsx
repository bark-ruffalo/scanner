import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BackButton } from "~/components/BackButton";
import { linkify } from "~/lib/utils";
import { getLaunchById } from "~/server/queries";

type Props = {
	params: { id: string };
};

// Add metadata generation
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const resolvedParams = await Promise.resolve(params);
	const launchId = Number.parseInt(resolvedParams.id, 10);
	if (Number.isNaN(launchId)) {
		return { title: "Invalid Launch | Scanner" };
	}

	const launch = await getLaunchById(launchId);
	return {
		title: launch ? `${launch.title} | Scanner` : "Launch Not Found | Scanner",
	};
}

export default async function LaunchDetailPage({ params }: Props) {
	// Validate ID - ensure it's a number
	const resolvedParams = await Promise.resolve(params);
	const launchId = Number.parseInt(resolvedParams.id, 10);
	if (Number.isNaN(launchId)) {
		notFound(); // Or handle invalid ID format appropriately
	}

	const launch = await getLaunchById(launchId);

	if (!launch) {
		notFound(); // Handle case where launch with the given ID doesn't exist
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 p-8 text-white">
			<div className="container mx-auto p-4">
				<div className="mb-4 flex items-center justify-between gap-4">
					<div className="flex items-center gap-4">
						<BackButton />
						<h1 className="font-bold text-2xl text-gray-800">{launch.title}</h1>
					</div>
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
				<div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-white/20 bg-gray-800 p-6">
					{launch.description && launch.description !== "-" && (
						<div className="break-words">
							<div className="mt-1 whitespace-pre-wrap break-words">
								{linkify(launch.description).map((part, index) => {
									if (typeof part === "string") {
										// Create a key using the content and index
										// Using substring to limit key length for very long text
										const textKey = `text-${part.substring(0, 10).trim()}-${index}`;
										return <span key={textKey}>{part}</span>;
									}
									// Create a unique key for URLs using the URL itself
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
						</div>
					)}
					{launch.summary && launch.summary !== "-" && (
						<div className="break-words">
							<h2 className="font-semibold text-lg">Summary</h2>
							<p className="mt-1 break-words">{launch.summary}</p>
						</div>
					)}
					{launch.analysis && launch.analysis !== "-" && (
						<div className="break-words">
							<h2 className="font-semibold text-lg">Analysis</h2>
							<p className="mt-1 whitespace-pre-wrap break-words">
								{launch.analysis}
							</p>
						</div>
					)}
					{launch.rating !== undefined && launch.rating !== -1 && (
						<p>
							<strong>Rating:</strong> {launch.rating}
						</p>
					)}
					{/* Add other launch details as needed */}
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
