import { getLaunches } from "~/server/queries";
import { AdminDashboard } from "./components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
	const launches = await getLaunches();

	return <AdminDashboard launches={launches} />;
}
