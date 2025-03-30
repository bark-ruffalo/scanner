import { NextResponse } from "next/server";
import { getDistinctLaunchpads } from "~/server/queries";

export async function GET() {
	// Only fetch launchpad data when this API route is called
	console.log("API route called: Fetching distinct launchpads from DB...");
	const launchpadNames = await getDistinctLaunchpads();

	// Return the data as JSON
	return NextResponse.json(launchpadNames);
}
