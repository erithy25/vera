import React, { useEffect, useState } from "react";
import { KeyRound, EyeOff, ScanSearch } from "lucide-react";
import {
  detectorList,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  type DetectorInfo,
} from "../lib/scan";

/**
 * Detectors beyond the prefixed provider keys. These are recognised from
 * context rather than from a prefix, so they are not in `PATTERNS` and have to
 * be named here. Kept short and specific — a vague claim on this screen is
 * worse than no claim.
 */
const CONTEXTUAL = [
  {
    label: "Private keys",
    detail: "PEM blocks — RSA, OpenSSH, EC, DSA, PGP, PKCS#8.",
  },
  {
    label: "Connection strings",
    detail:
      "postgres://, mysql://, mongodb://, redis:// and friends, when a password sits in the URL.",
  },
  { label: "JSON Web Tokens", detail: "Three base64url segments with a plausible header." },
  {
    label: "Assigned secrets",
    detail:
      "PASSWORD=…, api_key: …, Bearer … — when the value looks random rather than word-like.",
  },
];

/**
 * What is deliberately ignored. This half of the screen matters as much as the
 * other: a scanner that flags every git SHA on a developer's screen gets turned
 * off after the second run.
 */
const IGNORED = [
  { label: "Tutorial placeholders", detail: "sk-your-api-key-here, <YOUR_TOKEN>, sk-ant-api03-xxxxxxxx" },
  { label: "Documented examples", detail: "AKIAIOSFODNN7EXAMPLE and the other values from official docs" },
  { label: "Environment references", detail: "process.env.OPENAI_API_KEY, $GITHUB_TOKEN, ${{ secrets.X }}" },
  { label: "Git SHAs and UUIDs", detail: "3c198ac, and the full 40- and 64-character forms" },
  { label: "Build output", detail: "main.a3f9b2c1.js, sha512- integrity hashes, data: URIs" },
  { label: "Ordinary screen noise", detail: "Version numbers, IP addresses, hex colours, timestamps, file paths" },
];

export const Detectors: React.FC = () => {
  const [detectors, setDetectors] = useState<DetectorInfo[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    detectorList()
      .then(setDetectors)
      .catch((err) => setError(String(err)));
  }, []);

  const byProvider = detectors.reduce<Record<string, DetectorInfo[]>>((acc, d) => {
    (acc[d.provider] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="w-full max-w-[860px] flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-serif text-[32px] text-text-primary leading-tight">
          What Vera looks for
        </h1>
        <p className="font-sans text-[14px] text-text-muted">
          The list below is read from the engine itself, not written out by hand, so it
          is always what actually runs.
        </p>
      </header>

      {error && (
        <p className="card-style px-5 py-4 font-sans text-[13px] text-text-muted">
          Could not read the detector list: {error}
        </p>
      )}

      <section className="card-style p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <KeyRound size={17} strokeWidth={1.5} className="text-text-muted" />
          <h2 className="font-serif text-[19px] text-text-primary">
            Provider keys
            {detectors.length > 0 && (
              <span className="font-sans text-[13px] text-text-faint"> · {detectors.length}</span>
            )}
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          {Object.entries(byProvider).map(([provider, items]) => (
            <div key={provider} className="flex flex-col gap-2">
              <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                {provider}
              </span>
              <div className="flex flex-col gap-1.5">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_STYLE[d.severity].dot}`}
                    />
                    <span className="font-sans text-[13px] text-text-primary flex-1">
                      {d.label}
                    </span>
                    <span
                      className={`font-sans text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[d.severity].chip}`}
                    >
                      {SEVERITY_LABEL[d.severity]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="font-sans text-[12px] text-text-faint leading-relaxed border-t border-border-hairline pt-4">
          Severity is about what the value can do, not how confident the match is. A
          publishable Stripe key is reported as informational because publishing it is
          the point; a live secret key is critical because it moves money.
        </p>
      </section>

      <section className="card-style p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <ScanSearch size={17} strokeWidth={1.5} className="text-text-muted" />
          <h2 className="font-serif text-[19px] text-text-primary">Found by context</h2>
        </div>
        <div className="flex flex-col gap-3">
          {CONTEXTUAL.map((c) => (
            <div key={c.label} className="flex flex-col gap-0.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                {c.label}
              </span>
              <span className="font-sans text-[12px] text-text-muted leading-relaxed">
                {c.detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card-style p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <EyeOff size={17} strokeWidth={1.5} className="text-text-muted" />
          <h2 className="font-serif text-[19px] text-text-primary">
            Deliberately ignored
          </h2>
        </div>
        <p className="font-sans text-[13px] text-text-muted leading-relaxed -mt-2">
          You record tutorials. Your screen is covered in things that look like secrets
          and are not. A tool that flags all of them is one you stop opening.
        </p>
        <div className="flex flex-col gap-3">
          {IGNORED.map((i) => (
            <div key={i.label} className="flex flex-col gap-0.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                {i.label}
              </span>
              <span className="font-mono text-[11px] text-text-muted leading-relaxed">
                {i.detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card-style p-6 flex flex-col gap-3">
        <h2 className="font-serif text-[19px] text-text-primary">
          Why it survives bad OCR
        </h2>
        <p className="font-sans text-[13px] text-text-muted leading-relaxed">
          Text read off a video is never read correctly. Depending on the font and the
          resolution, <span className="font-mono text-[12px]">sk-proj-AbC1</span> comes
          back as <span className="font-mono text-[12px]">sk-pr0j-AbCl</span> or{" "}
          <span className="font-mono text-[12px]">5k-proj-A6C1</span>. An exact pattern —
          what gitleaks and trufflehog use on files — finds none of those.
        </p>
        <p className="font-sans text-[13px] text-text-muted leading-relaxed">
          So Vera splits every pattern in two. The prefix is matched loosely, allowing
          for the glyphs that monospace fonts genuinely confuse. The body is never
          matched exactly at all — only its length, its character set and how random it
          is. A single misread character changes none of those three, which is exactly
          why the key is still found.
        </p>
      </section>
    </div>
  );
};
