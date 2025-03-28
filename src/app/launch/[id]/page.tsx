import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackButton } from "~/components/BackButton";
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
		<div className="container mx-auto p-4">
			<div className="mb-4 flex items-center gap-4">
				<BackButton />
				<h1 className="font-bold text-2xl">{launch.title}</h1>
			</div>
			<div className="space-y-4 rounded border p-4">
				<p>
					<strong>Launchpad:</strong> {launch.launchpad}
				</p>
				{launch.url && (
					<p>
						<strong>URL:</strong>{" "}
						<a
							href={launch.url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:underline"
						>
							{launch.url}
						</a>
					</p>
				)}
				{launch.description && (
					<div>
						<h2 className="font-semibold text-lg">Description</h2>
						<p className="mt-1">{launch.description}</p>
					</div>
				)}
				{launch.summary && (
					<div>
						<h2 className="font-semibold text-lg">Summary</h2>
						<p className="mt-1">{launch.summary}</p>
					</div>
				)}
				{launch.analysis && (
					<div>
						<h2 className="font-semibold text-lg">Analysis</h2>
						<p className="mt-1">{launch.analysis}</p>
					</div>
				)}
				{launch.rating && (
					<p>
						<strong>Rating:</strong> {launch.rating}
					</p>
				)}
				{/* Add other launch details as needed */}
			</div>
		</div>
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
