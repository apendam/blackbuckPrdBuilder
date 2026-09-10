import { auth, signOut } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getConversation } from "@/lib/conversations";
import { ChatClient } from "@/components/ChatClient";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { id } = await params;
  const conversation = await getConversation(session.user.id!, id);
  if (!conversation) {
    notFound();
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <ChatClient
      conversationId={conversation.id}
      initialTitle={conversation.title}
      initialMessages={conversation.messages}
      initialPhaseState={{
        current: conversation.currentPhase,
        completed: conversation.completedPhases,
      }}
      initialSkeletonSections={conversation.skeletonSections}
      initialSkeletonHistory={conversation.skeletonHistory}
      initialSavedPrd={conversation.prdMarkdownPath}
      initialGoogleDocUrl={conversation.googleDocUrl}
      initialVerificationFindings={conversation.verificationFindings}
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
    />
  );
}
