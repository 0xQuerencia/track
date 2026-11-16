import Link from "next/link";
import { Panel } from "@/components/track/page";
import type { LinkView } from "@/lib/link-types";

/** Notes whose bodies refer to this one with [[...]]. Shown as a list, newest first. */
export function Backlinks({ links }: { links: LinkView[] }) {
  const notes = links.filter((link) => link.direction === "in" && link.type === "notes");
  return (
    <Panel title="Backlinks" description="Notes that refer to this one with [[…]].">
      {notes.length === 0 ? (
        <p className="tk-empty-small">No other note refers to this one yet.</p>
      ) : (
        <ul className="tk-list kn-backlinks">
          {notes.map((link) => (
            <li key={link.id}>
              {link.href ? <Link href={link.href}>{link.title}</Link> : <span>{link.title}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
