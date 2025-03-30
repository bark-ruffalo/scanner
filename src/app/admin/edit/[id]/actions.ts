"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { analyzeLaunch } from "~/server/lib/ai-utils";

interface UpdateLaunchData {
	title: string;
	launchpad: string;
	url: string;
	description: string;
	imageUrl: string;
}

export async function updateLaunch(id: number, data: UpdateLaunchData) {
	// Update the launch in the database
	await db
		.update(launches)
		.set({
			...data,
			basicInfoUpdatedAt: new Date(),
		})
		.where(eq(launches.id, id));

	// Reanalyze the launch with the new description
	const analysisResult = await analyzeLaunch(data.description, data.launchpad);

	// Update the analysis
	await db
		.update(launches)
		.set({
			analysis: analysisResult.analysis,
			summary: analysisResult.summary,
			rating: analysisResult.rating,
			llmAnalysisUpdatedAt: new Date(),
		})
		.where(eq(launches.id, id));

	// Revalidate all relevant paths
	revalidatePath(`/launch/${id}`);
	revalidatePath("/admin");
	revalidatePath("/");
}
