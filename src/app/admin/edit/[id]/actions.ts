"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { analyzeLaunch } from "~/server/lib/ai-utils";
import { getLaunchById } from "~/server/queries";

// Interface now includes almost all fields from schema (except auto ones like id, createdAt)
interface UpdateLaunchData {
	title: string;
	launchpad: string;
	url: string;
	description: string;
	summary: string; // Added
	analysis: string; // Added
	rating: string; // String from form
	imageUrl: string; // Allow empty string
	creatorTokenHoldingPercentage?: string; // Optional string from form
	creatorTokensHeld?: string; // Optional string from form
	creatorTokenMovementDetails?: string; // Optional string from form
	mainSellingAddress?: string; // Optional string from form
	totalTokenSupply?: string; // Optional string from form
	sentToZeroAddress: string; // String from form ('true'/'false' or 'on'/'off' depending on input)
	launchedAt: string; // String from form
	// Timestamps like basicInfoUpdatedAt, llmAnalysisUpdatedAt, tokenStatsUpdatedAt
	// are generally updated based on actions, not direct edits.
	// `updatedAt` is handled by the DB trigger.
}

export async function updateLaunch(id: number, data: UpdateLaunchData) {
	const currentLaunch = await getLaunchById(id);
	if (!currentLaunch) {
		throw new Error(`Launch with ID ${id} not found.`);
	}

	const descriptionChanged = currentLaunch.description !== data.description;

	// Prepare data for the main update, converting types
	// Use Partial<typeof launches.$inferInsert> to only set provided fields
	const updatePayload: Partial<typeof launches.$inferInsert> = {
		title: data.title,
		launchpad: data.launchpad,
		url: data.url,
		description: data.description,
		summary: data.summary, // Directly use edited summary
		analysis: data.analysis, // Directly use edited analysis
		rating: Number.parseInt(data.rating, 10), // Use edited rating
		imageUrl: data.imageUrl || null,
		launchedAt: data.launchedAt ? new Date(data.launchedAt) : new Date(),
		mainSellingAddress: data.mainSellingAddress || null,
		creatorTokenHoldingPercentage: data.creatorTokenHoldingPercentage
			? data.creatorTokenHoldingPercentage
			: null,
		creatorTokensHeld: data.creatorTokensHeld ? data.creatorTokensHeld : null,
		creatorTokenMovementDetails: data.creatorTokenMovementDetails || null,
		totalTokenSupply: data.totalTokenSupply ? data.totalTokenSupply : null,
		// Convert 'true'/'false' string or 'on' from checkbox to boolean
		sentToZeroAddress:
			data.sentToZeroAddress === "true" || data.sentToZeroAddress === "on",
		// Update basic info timestamp as we edited core fields
		basicInfoUpdatedAt: new Date(),
		// We will update llmAnalysisUpdatedAt ONLY if AI runs
		// We don't update tokenStatsUpdatedAt manually here
	};

	// Perform the main update with manually edited data
	await db.update(launches).set(updatePayload).where(eq(launches.id, id));

	// Only reanalyze if the description specifically changed
	if (descriptionChanged) {
		console.log(
			`Description changed for launch ${id}. Re-running AI analysis...`,
		);
		try {
			const analysisResult = await analyzeLaunch(
				data.description,
				data.launchpad,
			);

			// Update analysis fields and LLM timestamp after AI run
			// This WILL overwrite manual edits to summary/analysis/rating if description changed
			await db
				.update(launches)
				.set({
					analysis: analysisResult.analysis,
					summary: analysisResult.summary,
					rating: analysisResult.rating,
					llmAnalysisUpdatedAt: new Date(), // Update LLM timestamp
				})
				.where(eq(launches.id, id));
			console.log(
				`AI analysis updated for launch ${id}, overwriting manual edits to summary/analysis/rating.`,
			);
		} catch (analysisError) {
			console.error(
				`Error during AI re-analysis for launch ${id}:`,
				analysisError,
			);
			// Log error, but manual edits from the first update are already saved
		}
	} else {
		console.log(
			`Description unchanged for launch ${id}. Skipping AI analysis. Manual edits preserved.`,
		);
	}

	// Revalidate paths
	revalidatePath(`/launch/${id}`);
	revalidatePath("/admin");
	revalidatePath("/");
}
