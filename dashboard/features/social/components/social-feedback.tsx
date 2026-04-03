"use client";

export interface SocialFeedbackProps {
  error: string;
  success: string;
}

export function SocialFeedback({ error, success }: SocialFeedbackProps) {
  return (
    <>
      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}
    </>
  );
}
