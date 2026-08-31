import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { KnowledgeBaseClient } from "@/components/KnowledgeBaseClient";

export default async function KnowledgeBasePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <KnowledgeBaseClient
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
    />
  );
}
