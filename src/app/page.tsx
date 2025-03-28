import { format, formatDistanceToNow } from "date-fns"; // Import format function
import Link from "next/link";
import { getLaunches } from "~/server/queries";

// Ensure the page is dynamically rendered to pick up revalidated data
export const dynamic = "force-dynamic";
// Alternatively, consider using route segment config:
// export const revalidate = 0; // Equivalent to force-dynamic for data fetching

// Define the expected shape of searchParams
interface HomePageProps {
	searchParams: {
		// Make searchParams non-optional, it's always provided
		filter?: string;
	};
}

export default async function HomePage({ searchParams }: HomePageProps) {
	// Await searchParams before accessing its properties
	const params = await searchParams;
	const currentFilter = params.filter;

	// Fetch launches using the DAL - this will now refetch after revalidatePath('/') is called
	const filteredLaunches = await getLaunches(currentFilter);

	return (
		// Removed items-center justify-center, added pt-8 for spacing below navbar
		<main className="flex min-h-screen flex-col bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 pt-8 text-white">
			{/* Container to control max-width and padding */}
			<div className="container mx-auto w-full max-w-6xl p-4">
				{filteredLaunches.length === 0 ? (
					<p className="text-center text-gray-300">
						{currentFilter && currentFilter !== "All"
							? `No launches found for "${currentFilter}".`
							: "No launches found."}
					</p>
				) : (
					// Changed max-width, removed items-center justify-center from parent main
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{filteredLaunches.map((launch) => (
							<div
								key={launch.id}
								className="flex flex-col rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-md"
							>
								{/* Link the title */}
								<Link
									href={`/launch/${launch.id}`}
									className="mb-2 font-bold text-xl hover:text-[var(--color-scanner-purple-light)]"
								>
									{launch.title}
								</Link>
								<p className="mb-2 text-gray-400 text-xs">{launch.launchpad}</p>
								{/* Use flex-grow to push date/rating to bottom */}
								<p className="mb-3 line-clamp-3 flex-grow text-gray-300">
									{launch.summary}
								</p>
								<div className="mt-auto flex items-center justify-between pt-2">
									{" "}
									{/* mt-auto pushes this div down */}
									<span className="my-1 rounded bg-[var(--color-scanner-purple-dark)] px-3 py-2 text-white text-xs">
										{launch.rating === -1
											? "Not rated"
											: `Rating: ${launch.rating}/10`}
									</span>
									{/* Display formatted date using date-fns and add title for tooltip */}
									<span
										className="text-gray-400 text-sm"
										title={
											launch.createdAt
												? format(launch.createdAt, "yyyy-MM-dd HH:mm") // Format for tooltip
												: "No date available"
										}
									>
										{launch.createdAt
											? formatDistanceToNow(launch.createdAt, {
													addSuffix: true, // Adds "ago" or "in"
												})
											: "No date"}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</main>
	);
}
