# Test recording

`vera-demo-recording.mov` — 56 seconds, 1600×1000, a fake developer screen
recording for exercising the scanner end to end.

Every credential in it is invented. They are structurally valid so the detector
fires on them, and they are checked against the engine before the video is
rendered. None of them is, or ever was, a real key.

## What Vera should report

| Time | Finding | Severity |
|------|---------|----------|
| 0:12 – 0:21 | OpenAI Project Key | Critical |
| 0:28 – 0:35 | Connection string with password | Critical |
| 0:36 – 0:41 | Stripe Publishable Key | Informational |
| 0:42 – 0:49 | GitHub Personal Access Token | Critical |

So: **3 things to fix**, plus one publishable key listed for completeness.

## What it must stay silent about

The other 34 seconds are decoys, each a thing that looks like a secret and is
not: `process.env.OPENAI_API_KEY`, `sk-your-api-key-here`,
`AKIAIOSFODNN7EXAMPLE`, a 40-character git SHA, a UUID, a semver, a localhost
address and a bundler filename with a content hash. Any finding outside the
four rows above is a false positive.

## Regenerating it

```bash
pip install Pillow && apt-get install -y ffmpeg
python3 testdata/make_demo_recording.py
```

The blinking cursor is deliberate: it changes a handful of pixels per frame, so
the perceptual-hash gate should still treat those frames as identical and skip
re-reading them.
