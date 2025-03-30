"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { http, type Chain, type Transport, createPublicClient } from "viem";
import { base } from "viem/chains";
import { db } from "~/server/db";
import { launches } from "~/server/db/schema";
import { updateEvmTokenStatistics } from "~/server/lib/evm-utils";

const publicClient = createPublicClient<Transport, Chain>({
	chain: base,
	transport: http(),
});

export async function deleteLaunch(id: number) {
	await db.delete(launches).where(eq(launches.id, id));
	revalidatePath("/admin");
	revalidatePath("/");
}

export async function updateLaunchTokenStats(
	launchId: number,
	tokenAddress: string,
	creatorAddress: string,
	creatorInitialTokens: string,
) {
	const launch = await db.query.launches.findFirst({
		where: eq(launches.id, launchId),
	});

	if (!launch) {
		throw new Error("Launch not found");
	}

	const tokenStats = await updateEvmTokenStatistics(
		publicClient,
		tokenAddress as `0x${string}`,
		creatorAddress as `0x${string}`,
		creatorInitialTokens,
		undefined,
		launch.mainSellingAddress as `0x${string}` | undefined,
	);

	await db
		.update(launches)
		.set({
			creatorTokensHeld: tokenStats.creatorTokensHeld,
			creatorTokenHoldingPercentage: tokenStats.creatorTokenHoldingPercentage,
			creatorTokenMovementDetails: tokenStats.creatorTokenMovementDetails,
			tokenStatsUpdatedAt: tokenStats.tokenStatsUpdatedAt,
			sentToZeroAddress: tokenStats.sentToZeroAddress ?? false,
			updatedAt: new Date(),
		})
		.where(eq(launches.id, launchId));

	revalidatePath("/admin");
	revalidatePath("/");
}

export async function updateAllTokenStats() {
	const allLaunches = await db.query.launches.findMany();

	for (const launch of allLaunches) {
		try {
			const tokenAddressMatch = launch.description.match(
				/Token address: (0x[a-fA-F0-9]{40})/,
			);
			const creatorMatch = launch.description.match(
				/Creator address: (0x[a-fA-F0-9]{40})/,
			);
			const initialTokensMatch = launch.description.match(
				/Creator initial number of tokens: ([\d,]+)/,
			);

			if (
				!tokenAddressMatch?.[1] ||
				!creatorMatch?.[1] ||
				!initialTokensMatch?.[1]
			) {
				console.warn(`Could not extract token info from launch ${launch.id}`);
				continue;
			}

			await updateLaunchTokenStats(
				launch.id,
				tokenAddressMatch[1],
				creatorMatch[1],
				initialTokensMatch[1].replace(/,/g, ""),
			);
		} catch (error) {
			console.error(
				`Error updating token stats for launch ${launch.id}:`,
				error,
			);
		}
	}
}

export async function reanalyzeLaunch(id: number) {
	const launch = await db.query.launches.findFirst({
		where: eq(launches.id, id),
	});

	if (!launch) {
		throw new Error("Launch not found");
	}

	// TODO: Implement LLM analysis
	await db
		.update(launches)
		.set({
			rating: Math.floor(Math.random() * 10) + 1,
			updatedAt: new Date(),
		})
		.where(eq(launches.id, id));

	revalidatePath("/admin");
	revalidatePath("/");
}

export async function reanalyzeAllLaunches() {
	const launches = await db.query.launches.findMany();

	for (const launch of launches) {
		try {
			await reanalyzeLaunch(launch.id);
		} catch (error) {
			console.error(`Error reanalyzing launch ${launch.id}:`, error);
		}
	}
}
