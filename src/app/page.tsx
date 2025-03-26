import Link from "next/link";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema"; // Import schema
import { eq, sql } from "drizzle-orm"; // Import eq for filtering

// Define the expected shape of searchParams
interface HomePageProps {
  searchParams?: {
    filter?: string;
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
    const currentFilter = searchParams?.filter;

    // Fetch launches based on the filter
    const filteredLaunches = await db.query.launches.findMany({
        where: currentFilter && currentFilter !== 'All'
            ? eq(launches.launchpad, currentFilter) // Filter by launchpad if filter exists and is not 'All'
            : undefined, // No filter applied if 'All' or no filter
        orderBy: (launches, { desc }) => [desc(launches.createdAt)], // Optional: Order by date
    });

	return (
        // Removed items-center justify-center, added pt-8 for spacing below navbar
		<main className="flex min-h-screen flex-col bg-gradient-to-b from-[#1a013d] to-[#15162c] pt-8 text-white">
            {/* Container to control max-width and padding */}
            <div className="container mx-auto w-full max-w-6xl p-4">
              {filteredLaunches.length === 0 ? (
                <p className="text-center text-gray-300">
                    {currentFilter && currentFilter !== 'All'
                        ? `No launches found for "${currentFilter}".`
                        : "No launches found."}
                </p>
              ) : (
                // Changed max-width, removed items-center justify-center from parent main
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredLaunches.map((launch) => (
                    <div key={launch.id} className="flex flex-col rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-md">
                      {/* Link the title */}
                      <Link href={`/launch/${launch.id}`} className="mb-2 text-xl font-bold hover:text-purple-400">
                        {launch.title}
                      </Link>
                      <p className="mb-2 text-xs text-gray-400">{launch.launchpad}</p>
                      {/* Use flex-grow to push date/rating to bottom */}
                      <p className="mb-3 line-clamp-3 flex-grow text-gray-300">{launch.summary}</p>
                      <div className="mt-auto flex items-center justify-between pt-2"> {/* mt-auto pushes this div down */}
                        <span className="rounded bg-purple-900 px-2 py-1 text-xs">
                          {launch.rating === -1 ? "Not rated" : `Rating: ${launch.rating}/10`}
                        </span>
                        {/* Display formatted date instead of View Details */}
                        <span className="text-sm text-gray-400">
                          {/* Assuming createdAt exists and is a Date object */}
                          {launch.createdAt
                            ? launch.createdAt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
                            : 'No date'}
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
