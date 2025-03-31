"use client";

import { format } from "date-fns"; // Import format for date input
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react"; // Import ChangeEvent
import { updateLaunch } from "~/app/admin/edit/[id]/actions";

// Interface now matches schema more closely for editing
interface Launch {
	id: number;
	title: string;
	launchpad: string;
	url: string;
	description: string;
	summary: string; // Added
	analysis: string; // Added
	rating: number;
	imageUrl: string | null;
	creatorTokenHoldingPercentage: string | null; // Keep as string/null from DB numeric
	creatorTokensHeld: string | null; // Keep as string/null from DB numeric
	creatorTokenMovementDetails: string | null; // Added
	mainSellingAddress: string | null;
	totalTokenSupply: string | null; // Keep as string/null from DB numeric
	sentToZeroAddress: boolean; // Added
	launchedAt: Date;
	// Timestamps can be displayed but usually not edited directly
	basicInfoUpdatedAt: Date;
	tokenStatsUpdatedAt: Date;
	llmAnalysisUpdatedAt: Date;
	createdAt: Date;
	updatedAt: Date | null;
}

interface EditLaunchFormProps {
	launch: Launch;
}

type FormErrors = {
	title?: string;
	launchpad?: string;
	url?: string;
	description?: string;
	summary?: string; // Added
	analysis?: string; // Added
	launchedAt?: string;
	rating?: string;
	// Add errors for new numeric fields if needed
	creatorTokenHoldingPercentage?: string;
	creatorTokensHeld?: string;
	totalTokenSupply?: string;
};

export function EditLaunchForm({ launch }: EditLaunchFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const formatDateForInput = (date: Date | null | undefined): string => {
		if (!date) return "";
		try {
			const validDate = new Date(date);
			if (Number.isNaN(validDate.getTime())) return "";
			return format(validDate, "yyyy-MM-dd'T'HH:mm");
		} catch {
			return "";
		}
	};

	// Format optional numeric fields stored as string | null from DB
	const formatNumericString = (value: string | null | undefined): string => {
		return value ?? ""; // Return empty string if null/undefined
	};

	const [formData, setFormData] = useState({
		title: launch.title,
		launchpad: launch.launchpad,
		url: launch.url,
		description: launch.description,
		summary: launch.summary, // Initialize summary
		analysis: launch.analysis, // Initialize analysis
		rating: launch.rating.toString(),
		imageUrl: launch.imageUrl || "",
		launchedAt: formatDateForInput(launch.launchedAt),
		mainSellingAddress: launch.mainSellingAddress || "",
		creatorTokenHoldingPercentage: formatNumericString(
			launch.creatorTokenHoldingPercentage,
		),
		creatorTokensHeld: formatNumericString(launch.creatorTokensHeld),
		creatorTokenMovementDetails: launch.creatorTokenMovementDetails || "",
		totalTokenSupply: formatNumericString(launch.totalTokenSupply),
		sentToZeroAddress: launch.sentToZeroAddress, // Boolean for checkbox
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [actionMessage, setActionMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	// Helper function for numeric validation (reused)
	const validateNumericString = (value: string): boolean => {
		if (!value) return true; // Allow empty strings (optional fields)
		// Allows optional negative sign, digits, optional decimal point, digits
		return /^-?\d*(\.\d+)?$/.test(value);
	};

	const validateForm = (): boolean => {
		const newErrors: FormErrors = {};

		// Basic Validations (Keep as before)
		if (!formData.title.trim()) newErrors.title = "Title is required";
		if (formData.title.length > 256)
			newErrors.title = "Title must be less than 256 characters";
		if (!formData.launchpad.trim())
			newErrors.launchpad = "Launchpad is required";
		if (formData.launchpad.length > 256)
			newErrors.launchpad = "Launchpad must be less than 256 characters";
		if (!formData.url.trim()) newErrors.url = "URL is required";
		try {
			new URL(formData.url);
		} catch (e) {
			newErrors.url = "Please enter a valid URL";
		}
		if (!formData.description.trim())
			newErrors.description = "Description is required";
		if (!formData.launchedAt)
			newErrors.launchedAt = "Launched At date/time is required";

		// Rating Validation
		const ratingNum = Number.parseInt(formData.rating, 10);
		if (Number.isNaN(ratingNum) || ratingNum < -1 || ratingNum > 10) {
			newErrors.rating = "Rating must be an integer between -1 and 10";
		}

		// Summary/Analysis validation (optional - maybe just length check?)
		// if (!formData.summary.trim()) newErrors.summary = "Summary is required"; // Example
		// if (!formData.analysis.trim()) newErrors.analysis = "Analysis is required"; // Example

		// Validate optional numeric fields
		if (!validateNumericString(formData.creatorTokenHoldingPercentage)) {
			newErrors.creatorTokenHoldingPercentage = "Must be a valid number";
		}
		if (!validateNumericString(formData.creatorTokensHeld)) {
			newErrors.creatorTokensHeld = "Must be a valid number";
		}
		if (!validateNumericString(formData.totalTokenSupply)) {
			newErrors.totalTokenSupply = "Must be a valid number";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setActionMessage(null);

		if (!validateForm()) {
			setActionMessage({
				text: "Please fix the errors in the form",
				type: "error",
			});
			return;
		}

		setIsSubmitting(true);

		try {
			// Prepare data, converting boolean checkbox state
			const dataToSubmit = {
				...formData,
				sentToZeroAddress: formData.sentToZeroAddress.toString(), // Convert boolean to string for the action
			};
			await updateLaunch(launch.id, dataToSubmit);
			setActionMessage({
				text: "Launch updated successfully! Redirecting...",
				type: "success",
			});
			setTimeout(() => {
				router.push("/admin");
				router.refresh();
			}, 1000);
		} catch (error) {
			console.error("Error updating launch:", error);
			setActionMessage({
				text: `Error updating launch: ${error instanceof Error ? error.message : "Unknown error"}`,
				type: "error",
			});
			setIsSubmitting(false);
		}
	};

	// Update handleChange to handle checkbox
	const handleChange = (
		e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		const { name, value, type } = e.target;

		// Special handling for checkbox input
		const newValue =
			type === "checkbox" ? (e.target as HTMLInputElement).checked : value;

		setFormData((prev) => ({
			...prev,
			[name]: newValue,
		}));

		if (errors[name as keyof FormErrors]) {
			setErrors((prev) => ({ ...prev, [name]: undefined }));
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{actionMessage && (
				<div
					className={`mb-4 rounded-lg p-4 ${
						actionMessage.type === "success"
							? "bg-green-800 text-white"
							: "bg-red-800 text-white"
					}`}
				>
					{actionMessage.text}
				</div>
			)}

			{/* --- Basic Info --- */}
			<h2 className="border-gray-600 border-b pb-2 font-semibold text-gray-300 text-xl">
				Basic Information
			</h2>
			{/* Title, Launchpad, URL, ImageURL, LaunchedAt */}
			<div>
				<label htmlFor="title" className="mb-2 block font-medium text-gray-200">
					Title
				</label>
				<input
					type="text"
					id="title"
					name="title"
					value={formData.title}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.title ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.title && (
					<p className="mt-1 text-red-500 text-sm">{errors.title}</p>
				)}
			</div>
			{/* ... other basic fields (Launchpad, URL, Image URL, Launched At) ... */}
			<div>
				<label
					htmlFor="launchpad"
					className="mb-2 block font-medium text-gray-200"
				>
					Launchpad
				</label>
				<input
					type="text"
					id="launchpad"
					name="launchpad"
					value={formData.launchpad}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.launchpad ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.launchpad && (
					<p className="mt-1 text-red-500 text-sm">{errors.launchpad}</p>
				)}
			</div>

			<div>
				<label htmlFor="url" className="mb-2 block font-medium text-gray-200">
					URL
				</label>
				<input
					type="url"
					id="url"
					name="url"
					value={formData.url}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.url ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.url && (
					<p className="mt-1 text-red-500 text-sm">{errors.url}</p>
				)}
			</div>

			<div>
				<label
					htmlFor="imageUrl"
					className="mb-2 block font-medium text-gray-200"
				>
					Image URL (Optional)
				</label>
				<input
					type="url"
					id="imageUrl"
					name="imageUrl"
					value={formData.imageUrl}
					onChange={handleChange}
					className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-white"
				/>
			</div>
			<div>
				<label
					htmlFor="launchedAt"
					className="mb-2 block font-medium text-gray-200"
				>
					Launched At
				</label>
				<input
					type="datetime-local"
					id="launchedAt"
					name="launchedAt"
					value={formData.launchedAt}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.launchedAt ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.launchedAt && (
					<p className="mt-1 text-red-500 text-sm">{errors.launchedAt}</p>
				)}
			</div>

			{/* --- Description (Triggers Reanalysis) --- */}
			<h2 className="border-gray-600 border-b pt-6 pb-2 font-semibold text-gray-300 text-xl">
				Description
			</h2>
			<div>
				<label
					htmlFor="description"
					className="mb-2 block font-medium text-gray-200"
				>
					Description (Editing this field triggers AI reanalysis)
				</label>
				<textarea
					id="description"
					name="description"
					value={formData.description}
					onChange={handleChange}
					rows={15}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.description ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.description && (
					<p className="mt-1 text-red-500 text-sm">{errors.description}</p>
				)}
			</div>

			{/* --- LLM Generated Content (Manual Override) --- */}
			<h2 className="border-gray-600 border-b pt-6 pb-2 font-semibold text-gray-300 text-xl">
				AI Analysis (Manual Override)
			</h2>
			<p className="text-gray-400 text-sm">
				Note: Manual edits here will be overwritten if the Description field is
				changed (triggering AI reanalysis).
			</p>
			<div>
				<label
					htmlFor="summary"
					className="mb-2 block font-medium text-gray-200"
				>
					Summary
				</label>
				<textarea
					id="summary"
					name="summary"
					value={formData.summary}
					onChange={handleChange}
					rows={3}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.summary ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{/* Add error display if validation added */}
			</div>
			<div>
				<label
					htmlFor="analysis"
					className="mb-2 block font-medium text-gray-200"
				>
					Analysis
				</label>
				<textarea
					id="analysis"
					name="analysis"
					value={formData.analysis}
					onChange={handleChange}
					rows={10}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.analysis ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{/* Add error display if validation added */}
			</div>
			<div>
				<label
					htmlFor="rating"
					className="mb-2 block font-medium text-gray-200"
				>
					Rating (-1 to 10)
				</label>
				<input
					type="number"
					id="rating"
					name="rating"
					value={formData.rating}
					onChange={handleChange}
					min="-1"
					max="10"
					step="1"
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.rating ? "border-red-500" : "border-gray-600"
					}`}
				/>
				{errors.rating && (
					<p className="mt-1 text-red-500 text-sm">{errors.rating}</p>
				)}
			</div>

			{/* --- Tokenomics Data --- */}
			<h2 className="border-gray-600 border-b pt-6 pb-2 font-semibold text-gray-300 text-xl">
				Tokenomics Data
			</h2>
			{/* creatorTokenHoldingPercentage, creatorTokensHeld, totalTokenSupply, mainSellingAddress, creatorTokenMovementDetails, sentToZeroAddress */}
			<div>
				<label
					htmlFor="creatorTokenHoldingPercentage"
					className="mb-2 block font-medium text-gray-200"
				>
					Creator Token Holding %
				</label>
				<input
					type="text"
					inputMode="decimal"
					id="creatorTokenHoldingPercentage"
					name="creatorTokenHoldingPercentage"
					value={formData.creatorTokenHoldingPercentage}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.creatorTokenHoldingPercentage
							? "border-red-500"
							: "border-gray-600"
					}`}
					placeholder="e.g., 87.5 (leave blank if unknown)"
				/>
				{errors.creatorTokenHoldingPercentage && (
					<p className="mt-1 text-red-500 text-sm">
						{errors.creatorTokenHoldingPercentage}
					</p>
				)}
			</div>
			<div>
				<label
					htmlFor="creatorTokensHeld"
					className="mb-2 block font-medium text-gray-200"
				>
					Creator Tokens Held (Raw)
				</label>
				<input
					type="text"
					inputMode="numeric"
					id="creatorTokensHeld"
					name="creatorTokensHeld"
					value={formData.creatorTokensHeld}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.creatorTokensHeld ? "border-red-500" : "border-gray-600"
					}`}
					placeholder="e.g., 875000000 (leave blank if unknown)"
				/>
				{errors.creatorTokensHeld && (
					<p className="mt-1 text-red-500 text-sm">
						{errors.creatorTokensHeld}
					</p>
				)}
			</div>
			<div>
				<label
					htmlFor="totalTokenSupply"
					className="mb-2 block font-medium text-gray-200"
				>
					Total Token Supply (Raw)
				</label>
				<input
					type="text"
					inputMode="numeric"
					id="totalTokenSupply"
					name="totalTokenSupply"
					value={formData.totalTokenSupply}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.totalTokenSupply ? "border-red-500" : "border-gray-600"
					}`}
					placeholder="e.g., 1000000000 (leave blank if unknown)"
				/>
				{errors.totalTokenSupply && (
					<p className="mt-1 text-red-500 text-sm">{errors.totalTokenSupply}</p>
				)}
			</div>
			<div>
				<label
					htmlFor="mainSellingAddress"
					className="mb-2 block font-medium text-gray-200"
				>
					Main Selling/Pair Address
				</label>
				<input
					type="text"
					id="mainSellingAddress"
					name="mainSellingAddress"
					value={formData.mainSellingAddress}
					onChange={handleChange}
					className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-white"
					placeholder="e.g., 0x... (leave blank if none)"
				/>
			</div>
			<div>
				<label
					htmlFor="creatorTokenMovementDetails"
					className="mb-2 block font-medium text-gray-200"
				>
					Creator Token Movement Details
				</label>
				<textarea
					id="creatorTokenMovementDetails"
					name="creatorTokenMovementDetails"
					value={formData.creatorTokenMovementDetails}
					onChange={handleChange}
					rows={3}
					className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-white"
					placeholder="(Usually auto-generated, manual override possible)"
				/>
			</div>
			<div className="flex items-center gap-2">
				<input
					type="checkbox"
					id="sentToZeroAddress"
					name="sentToZeroAddress"
					checked={formData.sentToZeroAddress}
					onChange={handleChange}
					className="h-4 w-4 rounded border-gray-300 bg-gray-700 text-blue-600 focus:ring-blue-500"
				/>
				<label
					htmlFor="sentToZeroAddress"
					className="block font-medium text-gray-200"
				>
					Sent To Zero Address (Burned)?
				</label>
			</div>

			{/* --- Timestamps (Display Only) --- */}
			<h2 className="border-gray-600 border-b pt-6 pb-2 font-semibold text-gray-300 text-xl">
				Timestamps
			</h2>
			<div className="grid grid-cols-1 gap-4 text-gray-400 text-sm md:grid-cols-2">
				<p>Created: {format(launch.createdAt, "yyyy-MM-dd HH:mm")}</p>
				<p>
					Last Updated:{" "}
					{launch.updatedAt
						? format(launch.updatedAt, "yyyy-MM-dd HH:mm")
						: "N/A"}
				</p>
				<p>
					Basic Info Updated:{" "}
					{format(launch.basicInfoUpdatedAt, "yyyy-MM-dd HH:mm")}
				</p>
				<p>
					LLM Analysis Updated:{" "}
					{format(launch.llmAnalysisUpdatedAt, "yyyy-MM-dd HH:mm")}
				</p>
				<p>
					Token Stats Updated:{" "}
					{format(launch.tokenStatsUpdatedAt, "yyyy-MM-dd HH:mm")}
				</p>
			</div>

			{/* --- Actions --- */}
			<div className="flex gap-4 pt-8">
				<button
					type="submit"
					disabled={isSubmitting}
					className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Saving..." : "Save Changes"}
				</button>
				<button
					type="button"
					onClick={() => router.back()}
					disabled={isSubmitting}
					className="rounded bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
