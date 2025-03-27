import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { launches } from "./db/schema";

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
