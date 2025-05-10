/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
	preset: "ts-jest/presets/default-esm", // Use ESM preset
	testEnvironment: "node",
	moduleNameMapper: {
		"^~/(.*)$": "<rootDir>/src/$1",
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true, // Tell ts-jest to use ESM
			},
		],
	},
	testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
	setupFilesAfterEnv: ["<rootDir>/jest.setup.js"], // Optional: for global test setup
	testTimeout: 60000, // Increase default timeout to 60 seconds
};
