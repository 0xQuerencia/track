import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/wordmark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Track" };

export default function LoginPage() {
  return (
    <main className="tk-login">
      <div className="tk-login-card">
        <h1 aria-label="Track">
          <Wordmark size="md" />
        </h1>
        <p className="tk-lede">Your personal life operating system.</p>
        <LoginForm />
      </div>
    </main>
  );
}
