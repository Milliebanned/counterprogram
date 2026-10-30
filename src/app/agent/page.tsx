import type { Metadata } from "next";
import AgentConsole from "@/components/AgentConsole";

export const metadata: Metadata = {
  title: "Agent console · Counterprogram",
  description: "Describe your film and the agent picks the weekend your audience is free.",
};

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const { preset } = await searchParams;
  return <AgentConsole initialPreset={preset} />;
}
