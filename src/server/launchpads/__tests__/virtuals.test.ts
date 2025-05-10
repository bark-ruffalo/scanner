import { db, conn } from "~/server/db"; // Import conn for closing
import { launches } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { debugVirtualsLaunchById } from "../virtuals";
import { LAUNCHPAD_NAME } from "../virtuals"; // Assuming LAUNCHPAD_NAME is exported or use the string directly

// Helper to remove a launch by API ID for cleanup
async function cleanupLaunch(launchApiId: number | string) {
	await db
		.delete(launches)
		.where(eq(launches.launchpadSpecificId, launchApiId.toString()));
}

describe("Virtuals Protocol Listener - debugVirtualsLaunchById", () => {
	// Test for Genesis Launch (ID: 22653 - FRESCO)
	it("should process and store a Genesis launch (ID: 22653)", async () => {
		const launchApiId = 22653;
		await cleanupLaunch(launchApiId); // Ensure clean state for the test

		const result = await debugVirtualsLaunchById(launchApiId);

		expect(result.success).toBe(true);
		expect(result.message).toContain(
			`Successfully processed launch ID: ${launchApiId}`,
		);

		const dbLaunch = await db.query.launches.findFirst({
			where: eq(launches.launchpadSpecificId, launchApiId.toString()),
		});

		expect(dbLaunch).toBeDefined();
		expect(dbLaunch?.title).toBe("FRESCO ($FRES)");
		expect(dbLaunch?.launchpad).toBe(LAUNCHPAD_NAME);
		expect(dbLaunch?.chain).toBe("BASE");
		expect(dbLaunch?.status).toBe("GENESIS");
		expect(dbLaunch?.description?.length).toBeGreaterThan(100);
		expect(dbLaunch?.description).toContain("<full_details>");
		expect(dbLaunch?.imageUrl).toBe(
			"https://s3.ap-southeast-1.amazonaws.com/virtualprotocolcdn/thumbnail_22653_Fresco_d1fca8a174.jpeg",
		);
		expect(dbLaunch?.tokenAddress).toBeNull(); // Genesis launches might not have a preToken
		expect(dbLaunch?.creatorAddress?.toLowerCase()).toBe(
			"0xfd5d7fa11b86789c3e8e874427896169374bf247".toLowerCase(),
		);
		await cleanupLaunch(launchApiId); // Cleanup after test
	}, 90000); // Increase timeout for API calls and DB operations for this specific test

	// Test for Undergrad Solana Launch (ID: 21809 - Dolphin Ai)
	it("should process and store an Undergrad Solana launch (ID: 21809)", async () => {
		const launchApiId = 21809;
		await cleanupLaunch(launchApiId);

		const result = await debugVirtualsLaunchById(launchApiId);

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
		await cleanupLaunch(launchApiId);
	}, 30000);

	// Test for Available Base Launch (ID: 12398 - Seraph)
	it("should process and store an Available Base launch (ID: 12398)", async () => {
		const launchApiId = 12398;
		await cleanupLaunch(launchApiId);

		const result = await debugVirtualsLaunchById(launchApiId);

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
			"0x5823474E0062da58DA5a19B3FC221C4574d8D647".toLowerCase(),
		);
		expect(dbLaunch?.creatorAddress?.toLowerCase()).toBe(
			"0x5e53bc4b3f0738c3fe9009e377c7e6eb4cb35897".toLowerCase(),
		);
		await cleanupLaunch(launchApiId);
	}, 30000);

	afterAll(async () => {
		// Close the database connection after all tests in this suite are done
		if (conn) {
			await conn.end();
			console.log("Database connection closed after tests.");
		}
	});
});
