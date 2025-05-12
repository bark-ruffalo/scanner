import { eq } from "drizzle-orm";
import { conn, db } from "~/server/db"; // Import conn for closing
import { launches } from "~/server/db/schema";
import { debugVirtualsLaunchById } from "../virtuals";
import { LAUNCHPAD_NAME } from "../virtuals"; // Assuming LAUNCHPAD_NAME is exported or use the string directly

// Helper to remove a launch by API ID for cleanup
async function cleanupLaunch(launchApiId: number | string) {
	console.log(`Cleaning up launch with launchApiId: ${launchApiId}`);
	await db
		.delete(launches)
		.where(eq(launches.launchpadSpecificId, launchApiId.toString()));
}

describe("Virtuals Protocol Listener - debugVirtualsLaunchById", () => {
	// Test for Genesis Launch (ID: 22653 - FRESCO)
	it("should skip a Genesis launch (ID: 22653) that is not relevant", async () => {
		const launchApiId = 22653;
		console.log("Testing launch ID 22653");
		await cleanupLaunch(launchApiId); // Ensure clean state for the test

		const result = await debugVirtualsLaunchById(launchApiId, true);

		expect(result.success).toBe(true);
		console.log("Result message:", result.message);
		expect(result.message).toContain(
			"Skipping Genesis launch 22653 due to status: FAILED",
		);
		const dbLaunch = await db.query.launches.findFirst({
			where: eq(launches.launchpadSpecificId, launchApiId.toString()),
		});

		expect(dbLaunch).toBeUndefined();
		// await cleanupLaunch(launchApiId); // Cleanup after test
	}, 30000); // Increase timeout for API calls and DB operations for this specific test

	// Test for Undergrad Solana Launch (ID: 21809 - Dolphin Ai)
	it("should process and store an Undergrad Solana launch (ID: 21809)", async () => {
		const launchApiId = 21809;
		await cleanupLaunch(launchApiId);

		const result = await debugVirtualsLaunchById(launchApiId, true);

		expect(result.success).toBe(true);
		expect(result.message).toContain(
			`Successfully processed launch ID: ${launchApiId}`,
		);

		const dbLaunch = await db.query.launches.findFirst({
			where: eq(launches.launchpadSpecificId, launchApiId.toString()),
		});

		expect(dbLaunch).toBeDefined();
		expect(dbLaunch?.title).toBe("Dolphin Ai ($DOLPHIN)");
		expect(dbLaunch?.launchpad).toBe(LAUNCHPAD_NAME);
		expect(dbLaunch?.chain).toBe("SOLANA");
		expect(dbLaunch?.status).toBe("UNDERGRAD");
		expect(dbLaunch?.description?.length).toBeGreaterThan(100);
		expect(dbLaunch?.description).toContain("<full_details>");
		expect(dbLaunch?.imageUrl).toBe(
			"https://s3.ap-southeast-1.amazonaws.com/virtualprotocolcdn/thumbnail_21809_Dolphin_Ai_ea219f7b4e.jpeg",
		);
		expect(dbLaunch?.tokenAddress).toBe(
			"s2kpGsBQiJeXEpXjCaezhkTBEAXKp4jr9ps38zEvirt",
		);
		expect(dbLaunch?.creatorAddress).toBe(
			"Cm2c45MaiH6TxpP9JfzfdGVZ2a9mLqfR9sUat3JZtG9i",
		);
		if (dbLaunch) {
			expect(dbLaunch.url).toBe(
				"https://app.virtuals.io/prototypes/s2kpGsBQiJeXEpXjCaezhkTBEAXKp4jr9ps38zEvirt",
			);
		}
		await cleanupLaunch(launchApiId);
	}, 30000);

	// Test for Available Base Launch (ID: 12398 - Seraph)
	it("should process and store an Available Base launch (ID: 12398)", async () => {
		const launchApiId = 12398;
		await cleanupLaunch(launchApiId);

		const result = await debugVirtualsLaunchById(launchApiId, true);

		expect(result.success).toBe(true);
		expect(result.message).toContain(
			`Successfully processed launch ID: ${launchApiId}`,
		);

		const dbLaunch = await db.query.launches.findFirst({
			where: eq(launches.launchpadSpecificId, launchApiId.toString()),
		});

		expect(dbLaunch).toBeDefined();
		expect(dbLaunch?.title).toBe("Seraph ($SERAPH)");
		expect(dbLaunch?.launchpad).toBe(LAUNCHPAD_NAME);
		expect(dbLaunch?.chain).toBe("BASE");
		expect(dbLaunch?.status).toBe("AVAILABLE");
		expect(dbLaunch?.description?.length).toBeGreaterThan(100);
		expect(dbLaunch?.description).toContain("<full_details>");
		expect(dbLaunch?.imageUrl).toBe(
			"https://s3.ap-southeast-1.amazonaws.com/virtualprotocolcdn/thumbnail_name_d7a9656f05.png",
		);
		// For "AVAILABLE" status, preToken is the one we track as tokenAddress in our DB for this launchpad type
		expect(dbLaunch?.tokenAddress?.toLowerCase()).toBe(
			"0x4f81837C2f4A189A0B69370027cc2627d93785B4".toLowerCase(),
		);
		expect(dbLaunch?.creatorAddress?.toLowerCase()).toBe(
			"0x5e53bc4b3f0738c3fe9009e377c7e6eb4cb35897".toLowerCase(),
		);
		if (dbLaunch) {
			expect(dbLaunch.url).toBe("https://app.virtuals.io/virtuals/12398");
		}
		await cleanupLaunch(launchApiId);
	}, 30000);

	// Test for Genesis Launch (ID: 21679 - BurnieAI)
	it("should process and store a Genesis launch (ID: 21679) that is relevant", async () => {
		const launchApiId = 21679;
		await cleanupLaunch(launchApiId); // Ensure clean state for the test

		const result = await debugVirtualsLaunchById(launchApiId, true);

		expect(result.success).toBe(true);
		expect(result.message).toContain(
			`Successfully processed launch ID: ${launchApiId}`,
		);

		const dbLaunch = await db.query.launches.findFirst({
			where: eq(launches.launchpadSpecificId, launchApiId.toString()),
		});

		expect(dbLaunch).toBeDefined();
		expect(dbLaunch?.title).toBe("BurnieAI ($ROAST)");
		expect(dbLaunch?.launchpad).toBe(LAUNCHPAD_NAME);
		expect(dbLaunch?.chain).toBe("BASE");
		expect(dbLaunch?.status).toBe("AVAILABLE");
		if (dbLaunch) {
			expect(dbLaunch.url).toBe("https://app.virtuals.io/virtuals/21679");
		}
		expect(dbLaunch?.imageUrl).toBe(
			"https://s3.ap-southeast-1.amazonaws.com/virtualprotocolcdn/thumbnail_21679_Burnie_AI_7d43577f60.png",
		);
		expect(dbLaunch?.tokenAddress?.toLowerCase()).toBe(
			"0x06fe6D0EC562e19cFC491C187F0A02cE8D5083E4".toLowerCase(),
		);
		expect(dbLaunch?.creatorAddress?.toLowerCase()).toBe(
			"0x1b19d30c6b6d3161668738b169f8920507e7f22a",
		);
		await cleanupLaunch(launchApiId); // Cleanup after test
	}, 90000); // Increase timeout for API calls and DB operations for this specific test

	afterAll(async () => {
		// Close the database connection after all tests in this suite are done
		if (conn) {
			await conn.end();
			console.log("Database connection closed after tests.");
		}
	});
});
