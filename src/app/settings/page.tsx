import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserModelSettings } from "@/lib/modelSettings";
import { SettingsClient } from "@/components/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const settings = await getUserModelSettings(session.user.id);
  return <SettingsClient initialSettings={settings} userEmail={session.user.email ?? ""} />;
}
