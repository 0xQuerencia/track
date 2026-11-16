import { Page } from "@/components/track/page";
import { AssistantPanel } from "./panel";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <Page kicker="Assistant" title="Talk to Track" lede="Your brief first, then tell me what you are about to do and I will handle it.">
      <AssistantPanel />
    </Page>
  );
}
