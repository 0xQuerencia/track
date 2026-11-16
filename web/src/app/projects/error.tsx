"use client";

export default function ProjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="tk-page" id="main">
      <p className="tk-empty" role="alert">
        Projects could not be loaded. Nothing was changed.
      </p>
      <button type="button" className="tk-button tk-primary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
