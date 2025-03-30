// Simple health check endpoint for Render
import type { NextApiRequest, NextApiResponse } from "next";

type HealthResponse = {
	status: string;
	timestamp: string;
};

export default function handler(
	req: NextApiRequest,
	res: NextApiResponse<HealthResponse>,
) {
	// You could add more complex checks here, like database connectivity tests

	// Return a 200 OK status to indicate the service is healthy
	res.status(200).json({
		status: "ok",
		timestamp: new Date().toISOString(),
	});
}
