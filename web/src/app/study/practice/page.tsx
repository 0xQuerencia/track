import Link from "next/link";
import { getDb } from "@/lib/db";
import { imageIdsFor } from "@/lib/qv/images";
import { MODE_LABEL } from "@/lib/qv/constants";
import { getSession, sessionQuestions, sessionSummary } from "@/lib/qv/session";
import "@/styles/qvault.css";
import { Runner, type RunnerQuestion } from "./runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PracticePage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.session) ? params.session[0] : params.session;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const id = Number(raw);
  const db = getDb();
  const session = Number.isInteger(id) && id > 0 ? getSession(id, db) : null;

  if (!session) {
    return (
      <main className="qv-practice" id="main">
        <h1>Practice</h1>
        <p role={error ? "alert" : undefined}>{error ?? "That session was not found."}</p>
        <Link className="tk-button" href="/study?tab=review">Back to Study</Link>
      </main>
    );
  }
  if (session.status !== "active") {
    const s = sessionSummary(session.id, db);
    return (
      <main className="qv-practice" id="main">
        <h1>Session finished</h1>
        <p>{s.answered} answered · {s.green} green, {s.yellow} yellow, {s.red} red{s.accuracyPct !== null ? ` · ${s.accuracyPct}% green` : ""} · {s.minutes} min</p>
        <Link className="tk-button tk-primary" href="/study?tab=review">Back to Study</Link>
      </main>
    );
  }
  const questions: RunnerQuestion[] = sessionQuestions(session, db).map((q) => ({
    id: q.id, text: q.text, chapter: q.chapter_name, topic: q.topic, state: q.state, difficulty: q.difficulty, source: q.source,
    images: imageIdsFor(q.id, db), answer: q.correct_answer, solution: q.solution, hint: q.notes,
  }));
  return (
    <main className="qv-practice" id="main">
      <Runner
        sessionId={session.id}
        modeLabel={MODE_LABEL[session.mode]}
        questions={questions}
        startIndex={Math.min(session.position, questions.length)}
        startSeconds={session.seconds}
        limitSeconds={session.mode === "timed" && session.filter.timedMinutes ? session.filter.timedMinutes * 60 : null}
      />
    </main>
  );
}
