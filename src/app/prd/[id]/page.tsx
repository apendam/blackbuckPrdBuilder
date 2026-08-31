import { auth, signOut } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getConversation, getVersionChain } from "@/lib/conversations";
import { readPrdMarkdown } from "@/lib/knowledgeBase";
import { PrdViewerClient } from "@/components/PrdViewerClient";

export default async function PrdPage({
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
  if (!conversation.prdMarkdownPath) {
    redirect(`/chat/${id}`);
  }

  let content: string;
  try {
    content = readPrdMarkdown(conversation.prdMarkdownPath);
  } catch {
    content = "_(PRD file is missing on disk)_";
  }

  const versions = await getVersionChain(session.user.id!, id);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <PrdViewerClient
      conversation={conversation}
      content={content}
      versions={versions}
      userName={session.user.name}
      userEmail={session.user.email}
      signOutAction={handleSignOut}
    />
  );
}
