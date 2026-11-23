"""python3 -m unittest agents.promo.test_promo   (no network: the writer is forced to fallback or faked)"""
from __future__ import annotations

import unittest

from agents import memory as mem
from agents.promo.promo import LIMITS, Promos, Writer, segments, validate


def promos(writer=None) -> Promos:
    w = writer or Writer()
    if writer is None:
        w.key = None
    return Promos(mem.Memory(db_path=""), w)


class FakeWriter(Writer):
    def __init__(self, lines):
        super().__init__()
        self.key, self._lines = "fake", lines

    def write(self, seg, facts, state, moment):
        return validate(self._lines, [seg], {seg[0]: facts}, LIMITS[moment][0])


class PromoTest(unittest.TestCase):
    def test_pre_both_speakers_cite_memory(self):
        out = promos().promo({"moment": "pre", "speaker": "mae", "opponent": "silas", "match_state": {}})
        self.assertEqual(out["meta"]["source"], "fallback")
        for sp in ("mae", "silas"):
            mine = [l for l in out["lines"] if l["speaker"] == sp]
            self.assertTrue(2 <= len(mine) <= 3)
            self.assertTrue(any(l["cites"] for l in mine), mine)
        # mae's grudge row (m9 low blow) is the line she quotes
        self.assertIn("relationships.mae>silas", [c for l in out["lines"] for c in l["cites"]])

    def test_mid_is_one_short_line_quoting_a_habit(self):
        out = promos().promo({"moment": "mid", "speaker": "kane", "opponent": "vex",
                              "match_state": {"players": {"vex": "p1"}}})
        (line,) = out["lines"]
        self.assertLessEqual(len(line["text"].split()), 12)
        self.assertEqual(line["cites"], ["habits.p1/opening/strike"])
        self.assertIn("14", line["text"])

    def test_post_winner_first_then_loser(self):
        out = promos().promo({"moment": "post", "speaker": "vex", "opponent": "silas", "match_state": {"winner": "silas"}})
        self.assertEqual([l["speaker"] for l in out["lines"]], ["silas", "silas", "vex", "vex"])

    def test_llm_line_with_invented_cite_falls_back(self):
        bad = [{"speaker": "kane", "text": "Down you go.", "cites": ["habits.made/up/row"]}]
        out = promos(FakeWriter(bad)).promo({"moment": "mid", "speaker": "kane", "opponent": "vex",
                                             "match_state": {"players": {"vex": "p1"}}})
        self.assertEqual(out["meta"]["source"], "fallback")
        self.assertIn("no valid cite", out["meta"]["error"])

    def test_llm_lines_are_clipped_and_kept(self):
        long = " ".join(["word"] * 40)
        good = [{"speaker": "kane", "text": long, "cites": ["habits.p1/opening/strike"]}]
        out = promos(FakeWriter(good)).promo({"moment": "mid", "speaker": "kane", "opponent": "vex",
                                              "match_state": {"players": {"vex": "p1"}}})
        self.assertEqual(out["meta"]["source"], "openai")
        self.assertLessEqual(len(out["lines"][0]["text"].split()), LIMITS["mid"][0])

    def test_bad_moment_rejected(self):
        with self.assertRaises(ValueError):
            segments({"moment": "intermission", "speaker": "a", "opponent": "b"})


if __name__ == "__main__":
    unittest.main()
