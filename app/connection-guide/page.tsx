import { ConnectionGuidePage } from "@/components/connection-guide-content";

export const metadata = {
  title: "Connection guide | CS2 RCON",
  description: "Connect your Counter-Strike 2 server through the website or start a lightweight local helper with one command.",
};

export default function ConnectionGuide() {
  return <ConnectionGuidePage />;
}
