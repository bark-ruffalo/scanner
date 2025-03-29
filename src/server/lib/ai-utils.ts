import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "~/env";

// LLM models to try in order
// Link for reference: https://lmarena.ai/?leaderboard
const LLM_MODELS = [
	"google/gemini-2.5-pro-exp-03-25:free",
	"google/gemini-2.0-pro-exp-02-05:free",
	"google/gemini-2.0-flash-thinking-exp:free",
	"google/gemini-2.0-flash-thinking-exp-1219:free",
	"google/gemini-2.0-flash-exp:free",
];

// Define the output schema for response validation
const analysisSchema = z.object({
	analysis: z.string().min(1),
	rating: z.number().int().min(-1).max(10),
	summary: z.string().min(1),
});

// Define return type
export type LaunchAnalysis = z.infer<typeof analysisSchema>;

/**
 * Reads a markdown template and replaces template variables with provided values
 */
function renderTemplate(
	templateName: string,
	variables: Record<string, string>,
): string {
	const templatePath = path.join(
		process.cwd(),
		"templates",
		`${templateName}.md`,
	);
	const template = fs.readFileSync(templatePath, "utf-8");

	return Object.entries(variables).reduce(
		(result, [key, value]) =>
			result.replace(new RegExp(`{{${key}}}`, "g"), value),
		template,
	);
}

/**
 * Sanitizes a string to extract valid JSON
 * Attempts to find the first '{' character and considers that the start of JSON
 */
function sanitizeJsonResponse(text: string): string {
	// Handle responses with markdown code blocks
	const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
	if (codeBlockMatch?.[1]) {
		return codeBlockMatch[1];
	}

	// Fallback to original logic for non-markdown responses
	const firstBraceIndex = text.indexOf("{");
	if (firstBraceIndex === -1) {
		return text;
	}
	return text.substring(firstBraceIndex);
}

// Define OpenRouter response type
interface OpenRouterResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
	[key: string]: unknown;
}

/**
 * Makes a direct API call to OpenRouter LLM
 */
async function callOpenRouter(model: string, prompt: string): Promise<string> {
	const response = await fetch(`${env.OPENROUTER_API_HOST}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
			response_format: { type: "json_object" },
		}),
	});

	// Read the full response body once
	const responseBodyText = await response.text();

	if (!response.ok) {
		// Log the full response body on HTTP error
		console.error(
			`OpenRouter API error response body for ${model}: ${responseBodyText}`,
		);
		throw new Error(
			`OpenRouter API error: ${response.status} ${response.statusText}`,
		);
	}

	// Add better error handling
	let data: OpenRouterResponse;
	try {
		// Sanitize response before parsing to handle common LLM formatting issues
		const sanitizedResponse = sanitizeJsonResponse(responseBodyText);
		data = JSON.parse(sanitizedResponse);
	} catch (parseError) {
		// Log the full response body on JSON parse error
		console.error(
			`Failed to parse JSON response from ${model}: ${responseBodyText}`,
		);
		throw new Error(`Failed to parse JSON response from ${model}.`);
	}

	if (!data) {
		// Log the full response body if data is unexpectedly empty after parsing
		console.error(
			`Empty parsed data from model ${model}. Original response: ${responseBodyText}`,
		);
		throw new Error(`Empty response from model ${model}`);
	}

	if (
		!data.choices ||
		!Array.isArray(data.choices) ||
		data.choices.length === 0
	) {
		// Log the full response body if choices are missing
		console.error(
			`No choices in response from model ${model}: ${responseBodyText}`,
		);
		throw new Error(`No choices in response from model ${model}.`);
	}

	if (!data.choices[0]?.message?.content) {
		// Log the full response body if message content is missing
		console.error(
			`No message content in response from model ${model}: ${responseBodyText}`,
		);
		throw new Error(`No message content in response from model ${model}.`);
	}

	return data.choices[0].message.content;
}

/**
 * Analyzes a launch description, rates it, and creates a summary.
 * @param description The launch description text to analyze
 * @returns An object with analysis, rating, and summary fields
 */
export async function analyzeLaunch(
	description: string,
): Promise<LaunchAnalysis> {
	// Simple error tracking
	const errors: { model: string; error: Error; responseText?: string }[] = [];

	// Try each model in the list until one succeeds
	for (const model of LLM_MODELS) {
		let responseText = ""; // Store response text for potential error logging
		try {
			console.log(`Analyzing launch with model: ${model}`);

			const prompt = renderTemplate("crypto-analysis-prompt", { description });

			// console.log(`Prompt for LLM: ${prompt}`);

			responseText = await callOpenRouter(model, prompt); // Get the raw text response

			// Parse and validate the JSON response
			let parsedData: unknown;
			try {
				// Apply sanitization here too in case the model returns non-JSON format
				const sanitizedResponse = sanitizeJsonResponse(responseText);
				parsedData = JSON.parse(sanitizedResponse);
			} catch (parseError) {
				// Log the full response text on JSON parse error
				console.error(
					`Failed to parse JSON from model ${model}. Full response: ${responseText}`,
				);
				// Throw a more specific error, keeping the original response context
				throw new Error(
					`Failed to parse JSON response from model ${model}.`,
					{ cause: parseError }, // Optionally chain the original error
				);
			}

			// Validate against our schema
			const validatedData = analysisSchema.parse(parsedData);
			console.log(`Successfully analyzed launch with model: ${model}`);

			return validatedData;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`Error with model ${model}:`, err.message);
			// Store the error along with the model and potentially the response text
			errors.push({
				model,
				error: err,
				responseText: responseText || undefined,
			});
		}
	}

	// If we get here, all models failed
	// Log detailed errors including full responses if available (especially for parse errors)
	const detailedErrorMessages = errors
		.map(
			(e) =>
				`Model ${e.model}: ${e.error.message}${e.responseText ? ` | Response: ${e.responseText.substring(0, 200)}...` : ""}`,
		)
		.join("; ");

	throw new Error(`All LLM models failed. Details: ${detailedErrorMessages}`);
}
