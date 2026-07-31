//! How small text can get before a scan stops being worth anything.
//!
//! Every other piece of advice about recording a screen is opinion. This one is
//! measured, and it is the one thing Vera knows that a blog post does not.
//!
//! ## Where the numbers come from
//!
//! The project's own test recording (`testdata/vera-demo-recording.mov`,
//! 1600x1000, four planted credentials, 21px monospace) was put through the real
//! pipeline at several scales — the frame-selection picks the frames, OCR reads
//! them, the engine decides what is a finding:
//!
//! | Recording           | Glyphs   | Found |
//! |---------------------|----------|-------|
//! | as recorded (100 %) | 21.0 px  | 4 / 4 |
//! | re-encoded soft     | 21.0 px  | 4 / 4 |
//! | upscaled to 4K      | 42.0 px  | 4 / 4 |
//! | scaled to 50 %      | 10.5 px  | 2 / 4 |
//! | scaled to 35 %      |  7.4 px  | 0 / 4 |
//!
//! A second run rendered the dry-run canary as a single clean line — no video
//! compression, no competing text — and read it back at each size:
//!
//! | 26 px | 21 px | 15 px | 13 px | 10 px | 8 px | 6 px |
//! |-------|-------|-------|-------|-------|------|------|
//! | found | found | found | found | found | found| lost |
//!
//! The two disagree, and the disagreement is the useful part: one clean line
//! survives well past the size at which a real recording starts losing
//! credentials. A recording has compression, movement and other text competing
//! for the reader's attention; a rendered line has none of that. So the bands
//! are drawn from the video run, which is the realistic one, and the floor is
//! drawn from the line run, which is the only place either method was ever
//! observed to fail outright.
//!
//! An earlier version of this file put that floor at 10 px. The canary run
//! falsified it — 8 px was read back and reported — so it moved to 8. Claiming
//! text is unreadable when it demonstrably is not is the same class of mistake
//! as the opposite one, just quieter.
//!
//! ## The caveat the bands are chosen to absorb
//!
//! Both runs used Tesseract, because that is what runs on a build machine
//! without macOS. Apple's Vision — what Vera actually uses — is meaningfully
//! better on small text, so the real cliff is *lower* than these numbers say.
//! `Comfortable` therefore begins above the highest size at which anything was
//! ever missed, and `Marginal` is worded as a warning rather than a verdict.
//!
//! Being wrong in this direction costs a user one unnecessary re-record. Being
//! wrong in the other direction costs them a leaked key.

/// The key the dry run asks you to put on screen.
///
/// It is shaped exactly like a real OpenAI project key and opens nothing — the
/// body is random, and it was generated here rather than issued by anyone.
///
/// It cannot contain the word "fake", "test", "example" or "dummy, however
/// reassuring that would be to read: `negative.rs` correctly discards anything
/// carrying a placeholder marker, so a self-labelling canary would be filtered
/// out and the dry run would report "your recording is unreadable" to someone
/// whose recording was perfect. The safety comes from the value being random,
/// not from it announcing itself.
pub const DRY_RUN_CANARY: &str = "sk-proj-VERAdryrun7Qx4Vb2Zm9Ld3Kt6HsW8";

/// What a scan can be expected to do at a given glyph size.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Legibility {
    /// Every credential that is on screen should be found.
    Comfortable,
    /// Some will be found and some will not. Not a size to rely on.
    Marginal,
    /// Below what any reader recovers. A scan here proves nothing.
    Unreadable,
}

impl Legibility {
    pub fn as_str(&self) -> &'static str {
        match self {
            Legibility::Comfortable => "comfortable",
            Legibility::Marginal => "marginal",
            Legibility::Unreadable => "unreadable",
        }
    }

    /// The sentence the app shows. Written to be true rather than reassuring:
    /// the marginal case says what it does not know.
    pub fn summary(&self) -> &'static str {
        match self {
            Legibility::Comfortable => {
                "Text this size reads back cleanly. A scan of this recording means something."
            }
            Legibility::Marginal => {
                "Text this size is where readers start dropping characters. Some credentials \
                 would be found and some would not — a clean result here would not prove much."
            }
            Legibility::Unreadable => {
                "Text this size cannot be read back at all. Vera would report nothing, and that \
                 would say nothing about what is on screen."
            }
        }
    }
}

/// Above this many pixels per glyph, nothing was ever observed to be missed.
pub const COMFORTABLE_PX: f64 = 15.0;
/// Below this, text was observed to be lost outright rather than merely damaged.
pub const UNREADABLE_PX: f64 = 8.0;

/// Judge a glyph height, in pixels as they exist in the finished file.
pub fn judge(glyph_px: f64) -> Legibility {
    if glyph_px >= COMFORTABLE_PX {
        Legibility::Comfortable
    } else if glyph_px >= UNREADABLE_PX {
        Legibility::Marginal
    } else {
        Legibility::Unreadable
    }
}

/// A plan for a recording, and what it does to the text in it.
#[derive(Debug, Clone, Copy)]
pub struct RecordingPlan {
    /// The point size the editor or terminal is set to, as the user reads it in
    /// its preferences.
    pub font_points: f64,
    /// The display's backing scale — 2.0 on every Retina Mac, 1.0 otherwise.
    /// A 13pt font on a 2x display is 26 device pixels tall before anything else
    /// happens, which is why Retina users get away with sizes that would be lost
    /// on an external 1080p monitor.
    pub display_scale: f64,
    /// Height of the captured area, in device pixels.
    pub capture_height_px: u32,
    /// Height of the file that will actually be published. Equal to
    /// `capture_height_px` when nothing is re-encoded smaller.
    pub export_height_px: u32,
}

/// What a plan does to the smallest text in the recording.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct PlanVerdict {
    /// Glyph height in the finished file.
    pub glyph_px: f64,
    /// Glyph height before any export downscaling, for comparison.
    pub glyph_px_before_export: f64,
    /// How much the export shrinks the picture. 1.0 means it does not.
    pub export_ratio: f64,
    pub legibility: Legibility,
    /// True when the plan would be fine but the export is what ruins it — the
    /// single most common way a good recording becomes a useless one.
    pub export_is_the_problem: bool,
    /// The sentence to show. Carried on the verdict so the wording lives beside
    /// the measurement it describes, rather than being rewritten in the UI.
    pub summary: &'static str,
}

/// Work out what a recording plan does to its own text.
///
/// Degenerate inputs return the most cautious answer rather than a panic or a
/// NaN: a zero height is a probe that failed, and a probe that failed must not
/// be presented as a clean bill of health.
pub fn evaluate(plan: RecordingPlan) -> PlanVerdict {
    let before = plan.font_points.max(0.0) * plan.display_scale.max(0.0);

    let ratio = if plan.capture_height_px == 0 || plan.export_height_px == 0 {
        1.0
    } else {
        f64::from(plan.export_height_px) / f64::from(plan.capture_height_px)
    };
    // Exporting *larger* does not invent detail, so scaling up is treated as
    // no change rather than as an improvement.
    let effective_ratio = ratio.min(1.0);

    let after = before * effective_ratio;
    let legibility = judge(after);

    PlanVerdict {
        glyph_px: after,
        glyph_px_before_export: before,
        export_ratio: effective_ratio,
        legibility,
        export_is_the_problem: judge(before) == Legibility::Comfortable
            && legibility != Legibility::Comfortable,
        summary: legibility.summary(),
    }
}

/// The largest export height that still keeps the text comfortable.
///
/// This is the actionable half: telling someone their plan is bad without
/// telling them the number that would fix it is only half an answer.
pub fn smallest_safe_export_height(plan: RecordingPlan) -> Option<u32> {
    let before = plan.font_points.max(0.0) * plan.display_scale.max(0.0);
    if before <= 0.0 || plan.capture_height_px == 0 {
        return None;
    }
    if before < COMFORTABLE_PX {
        // No export size helps: the text is already too small at full size.
        return None;
    }
    let needed_ratio = COMFORTABLE_PX / before;
    Some((f64::from(plan.capture_height_px) * needed_ratio).ceil() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(font: f64, scale: f64, capture: u32, export: u32) -> RecordingPlan {
        RecordingPlan {
            font_points: font,
            display_scale: scale,
            capture_height_px: capture,
            export_height_px: export,
        }
    }

    #[test]
    fn the_canary_is_something_the_engine_actually_finds() {
        // The whole dry run rests on this. If the canary stops being detected —
        // because it was edited, or because a pattern or a negative filter
        // changed — then Vera would tell a user with a perfect recording that
        // their setup cannot be read, which is the most damaging thing this
        // feature could possibly say.
        let findings = crate::detect_in_text(DRY_RUN_CANARY);
        let hit = findings
            .iter()
            .find(|f| f.pattern_id == "openai_project")
            .expect("the dry-run canary is no longer detected as an OpenAI project key");
        assert!(
            hit.confidence > 0.9,
            "the canary should be an easy, unambiguous hit; it scored {}",
            hit.confidence
        );
        assert!(
            !hit.preview.contains("VERAdryrun"),
            "even the canary must be masked before it crosses the IPC boundary"
        );
    }

    #[test]
    fn the_canary_carries_no_placeholder_marker() {
        // negative.rs discards anything containing "fake", "example", "dummy"
        // and friends. A canary that named itself would be filtered out, and the
        // dry run would fail for the one reason a user could never diagnose.
        let lower = DRY_RUN_CANARY.to_ascii_lowercase();
        for marker in ["fake", "example", "sample", "dummy", "your", "here", "demo", "notreal"] {
            assert!(
                !lower.contains(marker),
                "the canary contains the placeholder marker {marker:?}; the engine will \
                 correctly ignore it and the dry run will lie"
            );
        }
    }

    #[test]
    fn the_bands_match_what_was_measured() {
        // From the video run: 21px found 4/4, 10.5px found 2/4, 7.4px found 0/4.
        assert_eq!(judge(21.0), Legibility::Comfortable);
        assert_eq!(judge(10.5), Legibility::Marginal);
        assert_eq!(judge(7.4), Legibility::Unreadable);
    }

    #[test]
    fn nothing_that_was_read_back_is_called_unreadable() {
        // The canary run read every one of these sizes back and the engine
        // reported the key. Calling any of them unreadable would be a claim the
        // measurement already falsified — which is how the floor moved from 10
        // to 8 in the first place.
        for px in [26.0, 21.0, 15.0, 13.0, 10.0, 8.0] {
            assert_ne!(
                judge(px),
                Legibility::Unreadable,
                "{px}px was read back and reported; it cannot be called unreadable"
            );
        }
        // 6px was the one size that came back as noise.
        assert_eq!(judge(6.0), Legibility::Unreadable);
    }

    #[test]
    fn a_retina_mac_at_a_normal_font_is_fine() {
        // 13pt in Terminal on any Retina Mac, recorded and published natively.
        let v = evaluate(plan(13.0, 2.0, 2234, 2234));
        assert_eq!(v.legibility, Legibility::Comfortable);
        assert_eq!(v.glyph_px, 26.0);
        assert!(!v.export_is_the_problem);
    }

    #[test]
    fn the_same_recording_exported_to_1080p_is_the_common_disaster() {
        // The exact case this module exists for: a recording that would have
        // been fine, ruined on the way out.
        let v = evaluate(plan(13.0, 2.0, 2234, 1080));
        assert_eq!(v.legibility, Legibility::Marginal);
        assert!(v.export_is_the_problem, "the export has to be named as the cause");
        assert!(v.glyph_px < v.glyph_px_before_export);
    }

    #[test]
    fn a_tiny_font_is_not_the_exports_fault() {
        let v = evaluate(plan(6.0, 1.0, 1080, 1080));
        assert_eq!(v.legibility, Legibility::Unreadable);
        assert!(
            !v.export_is_the_problem,
            "nothing was exported smaller; blaming the export would send the user to fix the wrong thing"
        );
    }

    #[test]
    fn exporting_larger_does_not_invent_detail() {
        let same = evaluate(plan(9.0, 1.0, 1000, 1000));
        let upscaled = evaluate(plan(9.0, 1.0, 1000, 4000));
        assert_eq!(same.glyph_px, upscaled.glyph_px);
        assert_eq!(upscaled.export_ratio, 1.0);
    }

    #[test]
    fn a_failed_probe_never_reads_as_a_clean_bill_of_health() {
        // Zero is what a probe that could not answer returns. It must not come
        // back as "comfortable".
        assert_eq!(evaluate(plan(0.0, 2.0, 2234, 2234)).legibility, Legibility::Unreadable);
        assert_eq!(evaluate(plan(13.0, 0.0, 2234, 2234)).legibility, Legibility::Unreadable);
        // A zero capture height cannot produce a ratio; the font alone decides.
        let v = evaluate(plan(13.0, 2.0, 0, 1080));
        assert_eq!(v.export_ratio, 1.0);
        assert_eq!(v.legibility, Legibility::Comfortable);
    }

    #[test]
    fn it_says_what_export_size_would_have_worked() {
        let p = plan(13.0, 2.0, 2234, 1080);
        let safe = smallest_safe_export_height(p).expect("26px of glyph leaves room to shrink");
        // 15/26 of 2234 is 1289; anything at or above that is comfortable.
        assert_eq!(safe, 1289);
        assert_eq!(
            evaluate(RecordingPlan { export_height_px: safe, ..p }).legibility,
            Legibility::Comfortable
        );
        assert_eq!(
            evaluate(RecordingPlan { export_height_px: safe - 1, ..p }).legibility,
            Legibility::Marginal
        );
    }

    #[test]
    fn there_is_no_safe_export_when_the_font_is_already_too_small() {
        assert!(smallest_safe_export_height(plan(7.0, 1.0, 1080, 1080)).is_none());
        assert!(smallest_safe_export_height(plan(0.0, 2.0, 2234, 2234)).is_none());
    }
}
