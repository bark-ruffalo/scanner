"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createLaunch } from "~/app/admin/new/actions";

type FormErrors = {
	title?: string;
	launchpad?: string;
	url?: string;
	description?: string;
	launchedAt?: string;
	// Add errors for new numeric fields if needed
	creatorTokenHoldingPercentage?: string;
	creatorTokensHeld?: string;
	totalTokenSupply?: string;
	// Removed rating error field
};

export function NewLaunchForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [formData, setFormData] = useState({
		title: "",
		launchpad: "",
		url: "",
		description: "",
		imageUrl: "",
		launchedAt: "",
		mainSellingAddress: "",
		// Initialize new tokenomics fields
		creatorTokenHoldingPercentage: "",
		creatorTokensHeld: "",
		totalTokenSupply: "",
		// Removed rating field
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [actionMessage, setActionMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	// Helper function for numeric validation
	const validateNumericString = (value: string): boolean => {
		if (!value) return true; // Allow empty strings (optional fields)
		return /^\d+(\.\d+)?$/.test(value); // Basic check for positive number
	};

	const validateForm = (): boolean => {
		const newErrors: FormErrors = {};

		// Validate title
		if (!formData.title.trim()) {
			newErrors.title = "Title is required";
		} else if (formData.title.length > 256) {
			newErrors.title = "Title must be less than 256 characters";
		}

		// Validate launchpad (optional)
		if (formData.launchpad.length > 256) {
			newErrors.launchpad = "Launchpad must be less than 256 characters";
		}

		// Validate URL
		if (!formData.url.trim()) {
			newErrors.url = "URL is required";
		} else {
			try {
				new URL(formData.url);
			} catch (e) {
				newErrors.url = "Please enter a valid URL";
			}
		}

		// Validate description
		if (!formData.description.trim()) {
			newErrors.description = "Description is required";
		}

		// Validate launchedAt
		if (!formData.launchedAt) {
			newErrors.launchedAt = "Launched At date/time is required";
		}

		// Validate optional numeric fields
		if (!validateNumericString(formData.creatorTokenHoldingPercentage)) {
			newErrors.creatorTokenHoldingPercentage =
				"Must be a valid positive number";
		}
		if (!validateNumericString(formData.creatorTokensHeld)) {
			newErrors.creatorTokensHeld = "Must be a valid positive number";
		}
		if (!validateNumericString(formData.totalTokenSupply)) {
			newErrors.totalTokenSupply = "Must be a valid positive number";
		}
		// Removed rating validation

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setActionMessage(null);

		if (!validateForm()) {
			setActionMessage({
				text: "Please fix the errors in the form.",
				type: "error",
			});
			return;
		}

		setIsSubmitting(true);

		try {
			await createLaunch(formData);
			setActionMessage({
				text: "Launch created successfully! Redirecting...",
				type: "success",
			});
			setTimeout(() => {
				router.push("/admin");
				router.refresh();
			}, 1500);
		} catch (error) {
			console.error("Error creating launch:", error);
			setActionMessage({
				text: `Error creating launch: ${error instanceof Error ? error.message : "Unknown error"}`,
				type: "error",
			});
			setIsSubmitting(false);
		}
	};

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
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

			{/* --- Form Fields --- */}
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

			<div>
				<label
					htmlFor="launchpad"
					className="mb-2 block font-medium text-gray-200"
				>
					Launchpad (Optional, defaults to 'added manually')
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
					placeholder="e.g., VIRTUALS Protocol (Base)"
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
					placeholder="https://..."
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

			<div>
				<label
					htmlFor="mainSellingAddress"
					className="mb-2 block font-medium text-gray-200"
				>
					Main Selling/Pair Address (Optional)
				</label>
				<input
					type="text"
					id="mainSellingAddress"
					name="mainSellingAddress"
					value={formData.mainSellingAddress}
					onChange={handleChange}
					className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-white"
					placeholder="e.g., 0x..."
				/>
			</div>

			{/* --- Optional Tokenomics Fields --- */}
			<div>
				<label
					htmlFor="creatorTokenHoldingPercentage"
					className="mb-2 block font-medium text-gray-200"
				>
					Creator Token Holding % (Optional)
				</label>
				<input
					type="text" // Use text for potentially large numbers / decimals
					inputMode="decimal" // Hint for mobile keyboards
					id="creatorTokenHoldingPercentage"
					name="creatorTokenHoldingPercentage"
					value={formData.creatorTokenHoldingPercentage}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.creatorTokenHoldingPercentage
							? "border-red-500"
							: "border-gray-600"
					}`}
					placeholder="e.g., 87.5"
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
					Creator Tokens Held (Raw Amount) (Optional)
				</label>
				<input
					type="text" // Use text for potentially very large numbers
					inputMode="numeric" // Hint for mobile keyboards
					id="creatorTokensHeld"
					name="creatorTokensHeld"
					value={formData.creatorTokensHeld}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.creatorTokensHeld ? "border-red-500" : "border-gray-600"
					}`}
					placeholder="e.g., 875000000"
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
					Total Token Supply (Raw Amount) (Optional)
				</label>
				<input
					type="text" // Use text for potentially very large numbers
					inputMode="numeric" // Hint for mobile keyboards
					id="totalTokenSupply"
					name="totalTokenSupply"
					value={formData.totalTokenSupply}
					onChange={handleChange}
					className={`w-full rounded-lg border bg-gray-700 p-2 text-white ${
						errors.totalTokenSupply ? "border-red-500" : "border-gray-600"
					}`}
					placeholder="e.g., 1000000000"
				/>
				{errors.totalTokenSupply && (
					<p className="mt-1 text-red-500 text-sm">{errors.totalTokenSupply}</p>
				)}
			</div>
			{/* --- End Optional Tokenomics Fields --- */}

			<div>
				<label
					htmlFor="description"
					className="mb-2 block font-medium text-gray-200"
				>
					Description (Used for AI Analysis)
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

			<div className="flex gap-4 pt-4">
				<button
					type="submit"
					disabled={isSubmitting}
					className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Creating..." : "Create Launch"}
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
