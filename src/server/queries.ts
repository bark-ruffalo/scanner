import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { launches } from "./db/schema";

// Define the type for a new launch based on your schema (excluding generated fields like id, createdAt)
type NewLaunchData = Omit<
	typeof launches.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;

export async function getLaunches(filter?: string) {
	return await db.query.launches.findMany({
		where:
			filter && filter !== "All" ? eq(launches.launchpad, filter) : undefined,
		orderBy: (launches, { desc }) => [desc(launches.createdAt)],
	});
}

export async function getDistinctLaunchpads() {
	const distinctLaunchpads = await db
		.selectDistinct({ launchpad: launches.launchpad })
		.from(launches);

	return distinctLaunchpads.map(({ launchpad }) => launchpad);
}

// Function to add a new launch
export async function addLaunch(launchData: NewLaunchData) {
	try {
		await db.insert(launches).values(launchData);
		console.log(`Added new launch: ${launchData.title}`);
		// Revalidate the homepage path after successful insertion
		revalidatePath("/");
	} catch (error) {
		console.error("Error adding launch to database:", error);
		// Handle error appropriately, maybe throw it or log it more formally
	}
}
