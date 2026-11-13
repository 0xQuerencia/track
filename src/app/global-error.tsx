"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="landing not-found">
          <div>
            <h1>Something went wrong</h1>
            <p className="lede">{error.message || "Unexpected error."}</p>
            <button type="button" onClick={() => reset()}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
