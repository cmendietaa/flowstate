import { Dashboard } from "@/components/dashboard/dashboard";
import { getDashboardSeedData } from "@/lib/data/tasks";

export default async function Home() {
  const data = await getDashboardSeedData();

  return <Dashboard seedData={data} />;
}
