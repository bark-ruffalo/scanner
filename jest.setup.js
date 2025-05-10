// This file can be used for global test setup, e.g., mocking modules, setting up environment variables for tests.
import { jest } from "@jest/globals";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Mock "server-only" to prevent errors in test environment
jest.mock("server-only", () => ({}));

// Mock "next/cache" to prevent errors with revalidatePath in tests
jest.mock("next/cache", () => ({
	revalidatePath: jest.fn(),
	revalidateTag: jest.fn(),
}));

// Mock environment variables if needed for tests
// For example:
// process.env.POSTGRES_URL = 'mock_postgres_url';
// process.env.OPENROUTER_API_KEY = 'mock_openrouter_key';
// process.env.FIRECRAWL_API_KEY = 'mock_firecrawl_key';
// process.env.TELEGRAM_BOT_TOKEN = 'mock_telegram_token';
// process.env.TELEGRAM_GROUP_ID = 'mock_telegram_group_id';
// process.env.TELEGRAM_TOPIC_ID = 'mock_telegram_topic_id';
// process.env.ADMIN_PASSWORD = 'mock_admin_password';
// process.env.HELIUS_API_KEY = 'mock_helius_key';

// You might need to mock specific modules that make external calls
// jest.mock('~/server/db', () => ({
//   db: {
//     query: {
//       launches: {
//         findFirst: jest.fn(),
//         findMany: jest.fn(),
//       },
//     },
//     insert: jest.fn().mockReturnThis(),
//     values: jest.fn().mockReturnThis(),
//     returning: jest.fn(),
//     update: jest.fn().mockReturnThis(),
//     set: jest.fn().mockReturnThis(),
//     where: jest.fn().mockReturnThis(),
//   },
// }));
