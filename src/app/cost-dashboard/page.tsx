import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getCostDashboard } from "@/lib/costDashboard";
import { CostDashboardClient } from "@/components/CostDashboardClient";

export default async function CostDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const data = await getCostDashboard(session.user.id);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <CostDashboardClient
      data={data}
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
    />
  );
}
