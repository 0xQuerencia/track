import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <main className="landing not-found">
      <div>
        <Wordmark size="md" />
        <h1>Page not found</h1>
        <p className="lede">Check the address, or go back to the Command Center.</p>
        <Link className="signin-link" href="/">
          Back to the Command Center
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
        </Link>
      </div>
    </main>
  );
}
