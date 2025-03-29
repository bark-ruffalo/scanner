import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "~/env";

// LLM models to try in order
const LLM_MODELS = [
	"google/gemini-2.5-pro-exp-03-25:free",
	"google/gemini-2.0-pro-exp-02-05:free",
	"google/gemini-2.0-flash-lite-preview-02-05:free",
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

	if (!response.ok) {
		throw new Error(
			`OpenRouter API error: ${response.status} ${response.statusText}`,
		);
	}

	const data = await response.json();

	// Add better error handling
	if (!data) {
		throw new Error(`Empty response from model ${model}`);
	}

	if (
		!data.choices ||
		!Array.isArray(data.choices) ||
		data.choices.length === 0
	) {
		throw new Error(
			`No choices in response from model ${model}: ${JSON.stringify(data).substring(0, 100)}...`,
		);
	}

	if (!data.choices[0].message || !data.choices[0].message.content) {
		throw new Error(
			`No message content in response from model ${model}: ${JSON.stringify(data.choices[0]).substring(0, 100)}...`,
		);
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
	const errors: Error[] = [];

	// Try each model in the list until one succeeds
	for (const model of LLM_MODELS) {
		try {
			console.log(`Analyzing launch with model: ${model}`);

			const prompt = renderTemplate("crypto-analysis-prompt", { description });

			console.log(`Prompt for LLM: ${prompt}`);

			const responseText = await callOpenRouter(model, prompt);

			// Parse and validate the JSON response
			let parsedData: unknown;
			try {
				parsedData = JSON.parse(responseText);
			} catch (parseError) {
				throw new Error(
					`Failed to parse JSON from model ${model}: ${responseText.substring(0, 100)}...`,
				);
			}

			// Validate against our schema
			const validatedData = analysisSchema.parse(parsedData);
			console.log(`Successfully analyzed launch with model: ${model}`);

			return validatedData;
		} catch (error) {
			console.error(`Error with model ${model}:`, error);
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
	}

	// If we get here, all models failed
	throw new Error(
		`All LLM models failed: ${errors.map((e) => e.message).join("; ")}`,
	);
}
