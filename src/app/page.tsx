import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { listConversations } from "@/lib/conversations";
import { DashboardClient } from "@/components/DashboardClient";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  const [drafts, completed, archived] = await Promise.all([
    listConversations(session.user.id!, ["draft"]),
    listConversations(session.user.id!, ["completed"]),
    listConversations(session.user.id!, ["archived"]),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <DashboardClient
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
      initialDrafts={drafts}
      initialCompleted={completed}
      initialArchived={archived}
    />
  );
}
