import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { ChatClient } from "@/components/ChatClient";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <ChatClient
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
    />
  );
}
