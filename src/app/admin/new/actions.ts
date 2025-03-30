"use server";

import { revalidatePath } from "next/cache";
import { analyzeLaunch } from "~/server/lib/ai-utils";
import { addLaunch } from "~/server/queries";

interface CreateLaunchData {
	title: string;
	launchpad: string;
	url: string;
	description: string;
	imageUrl: string;
}

export async function createLaunch(data: CreateLaunchData) {
	// Analyze the launch with LLM
	const analysisResult = await analyzeLaunch(data.description, data.launchpad);

	// Add the launch to the database
	await addLaunch({
		...data,
		analysis: analysisResult.analysis,
		summary: analysisResult.summary,
		rating: analysisResult.rating,
		basicInfoUpdatedAt: new Date(),
		llmAnalysisUpdatedAt: new Date(),
	});

	// Revalidate all relevant paths
	revalidatePath("/admin");
	revalidatePath("/");
}
