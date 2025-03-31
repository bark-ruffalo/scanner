"use server";

import { revalidatePath } from "next/cache";
import type { launches } from "~/server/db/schema"; // Import schema type
import { analyzeLaunch } from "~/server/lib/ai-utils";
import { addLaunch } from "~/server/queries";

interface CreateLaunchData {
	title: string;
	launchpad: string;
	url: string;
	description: string;
	imageUrl: string;
	launchedAt: string; // Comes as string from form
	mainSellingAddress?: string; // Optional
	// Add optional tokenomics fields (as strings from form)
	creatorTokenHoldingPercentage?: string;
	creatorTokensHeld?: string;
	totalTokenSupply?: string;
	// Removed rating field
}

export async function createLaunch(data: CreateLaunchData) {
	console.log("Received data for new launch:", data);

	// Analyze the launch with LLM first
	const analysisResult = await analyzeLaunch(data.description, data.launchpad);
	console.log("AI Analysis result:", analysisResult);

	// Prepare data for addLaunch, including new fields
	// Rating comes *only* from AI analysis now
	const launchPayload: Omit<
		typeof launches.$inferInsert,
		"id" | "createdAt" | "updatedAt" | "tokenStatsUpdatedAt" // Exclude auto-generated/updated fields
	> & { rating: number } = {
		// Ensure rating is number
		title: data.title,
		launchpad: data.launchpad || "added manually", // Use default if empty
		url: data.url,
		description: data.description,
		imageUrl: data.imageUrl || null, // Handle empty string
		launchedAt: data.launchedAt ? new Date(data.launchedAt) : new Date(), // Convert string to Date, provide default
		rating: analysisResult.rating, // Use rating from AI
		summary: analysisResult.summary, // Use summary from AI
		analysis: analysisResult.analysis, // Use analysis from AI
		mainSellingAddress: data.mainSellingAddress || null, // Handle empty string

		// Add optional tokenomics fields, converting to numeric/null
		creatorTokenHoldingPercentage: data.creatorTokenHoldingPercentage
			? data.creatorTokenHoldingPercentage
			: null, // Drizzle handles string -> numeric
		creatorTokensHeld: data.creatorTokensHeld ? data.creatorTokensHeld : null, // Drizzle handles string -> numeric
		totalTokenSupply: data.totalTokenSupply ? data.totalTokenSupply : null, // Drizzle handles string -> numeric

		// Set initial timestamps
		basicInfoUpdatedAt: new Date(),
		llmAnalysisUpdatedAt: new Date(),

		// Explicitly set defaults for other fields not provided by form/AI
		sentToZeroAddress: false,
		creatorTokenMovementDetails: null,
	};

	console.log("Payload for addLaunch:", launchPayload);

	// Add the launch to the database using the prepared payload
	await addLaunch(launchPayload);

	// Revalidate paths
	revalidatePath("/admin");
	revalidatePath("/");
}
