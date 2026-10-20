import sys
import unittest
from unittest import mock
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daily_report as base
import global_breakthrough as global_report


class GlobalBreakthroughTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 20, 1, 0, tzinfo=timezone.utc)

    def test_selects_recent_substantive_technical_item(self):
        item = base.NewsItem(
            "Researchers demonstrate a new quantum processor architecture",
            "https://arxiv.org/abs/2610.12345",
            "arXiv · 量子/材料/应用物理",
            self.now,
            "Researchers demonstrate a new quantum processor architecture with a new method "
            "and report experimental measurements under controlled laboratory conditions.",
        )
        old = base.NewsItem(
            "Old battery research",
            "https://example.org/old",
            "Research",
            self.now.replace(day=18),
            "Researchers report a battery research result with detailed experimental measurements.",
        )
        # Ranking and the rolling date gate are tested independently of network access.
        ranked = []
        for row in (item, old):
            if base.filter_recent([row], self.now):
                text = f"{row.title} {row.summary}".lower()
                row.score = 4 + sum(2 for term in global_report.TECH_TERMS if term in text)
                ranked.append(row)
        self.assertEqual(base.deduplicate(ranked), [item])

    def test_collector_parses_rss_and_selects_one_recent_item(self):
        xml = b"""<?xml version="1.0"?><rss><channel><item>
        <title>Researchers demonstrate a new quantum processor</title>
        <link>https://example.org/quantum-paper</link>
        <description>Researchers demonstrate a new quantum processor architecture and report
        experimental measurements under controlled laboratory conditions in a peer-reviewed study.</description>
        <pubDate>Tue, 20 Oct 2026 00:30:00 GMT</pubDate>
        <source>University research office</source>
        </item></channel></rss>"""
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = xml
        with mock.patch.object(global_report, "GLOBAL_SOURCES", (("Test source", "https://example.org/feed"),)), \
             mock.patch.object(global_report.urllib.request, "urlopen", return_value=response), \
             mock.patch.object(global_report.time, "sleep"):
            selected, warnings = global_report.collect_breakthroughs(self.now)
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].link, "https://example.org/quantum-paper")
        self.assertEqual(warnings, [])

    def test_collector_returns_multiple_ranked_breakthroughs(self):
        rows = [
            base.NewsItem(f"New {topic} breakthrough demonstration", f"https://example.org/{topic}", "Research",
                          self.now, f"Researchers demonstrate a new {topic} technology with experimental measurements "
                          "and report a new method under controlled laboratory conditions.")
            for topic in ("quantum", "robotics", "battery", "semiconductor")
        ]
        with mock.patch.object(global_report, "GLOBAL_SOURCES", ()), \
             mock.patch.object(global_report.base, "filter_recent", return_value=rows), \
             mock.patch.object(global_report.base, "deduplicate", side_effect=lambda items: sorted(items, key=lambda x: x.score, reverse=True)):
            selected, warnings = global_report.collect_breakthroughs(self.now)
        self.assertEqual(len(selected), global_report.GLOBAL_BREAKTHROUGH_LIMIT)
        self.assertEqual(len({item.link for item in selected}), 3)
        self.assertEqual(warnings, [])

    def test_shortlist_prefers_distinct_topics_before_backfilling(self):
        rows = [
            base.NewsItem("Quantum processor advance", "https://example.org/q1", "Research", self.now,
                          "A substantive quantum processor experiment reports measured performance."),
            base.NewsItem("Quantum material advance", "https://example.org/q2", "Research", self.now,
                          "A substantive quantum materials experiment reports measured performance."),
            base.NewsItem("Robotics advance", "https://example.org/r", "Research", self.now,
                          "A substantive robot experiment reports measured performance."),
            base.NewsItem("Battery advance", "https://example.org/b", "Research", self.now,
                          "A substantive battery experiment reports measured performance."),
        ]
        for index, item in enumerate(rows):
            item.score = 20 - index
        with (
            mock.patch.object(global_report, "GLOBAL_SOURCES", ()),
            mock.patch.object(global_report.base, "filter_recent", return_value=rows),
            mock.patch.object(global_report.base, "deduplicate", side_effect=lambda items: sorted(items, key=lambda x: x.score, reverse=True)),
        ):
            selected, warnings = global_report.collect_breakthroughs(self.now)
        self.assertEqual([global_report._topic_label(item) for item in selected], ["量子科技", "机器人", "储能与电池"])
        self.assertEqual(warnings, [])

    def test_build_section_renders_each_selected_breakthrough(self):
        rows = [
            base.NewsItem(f"Breakthrough {index}", f"https://example.org/{index}", "Research",
                          self.now, "A sufficiently substantive summary describing experimental results.")
            for index in range(3)
        ]
        section = global_report.build_section(rows)
        self.assertEqual(section.count("<article"), 3)

    def test_malformed_feed_is_reported_and_skipped(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"<rss><broken>"
        with mock.patch.object(global_report, "GLOBAL_SOURCES", (("Broken source", "https://example.org/feed"),)), \
             mock.patch.object(global_report.urllib.request, "urlopen", return_value=response), \
             mock.patch.object(global_report.time, "sleep"):
            selected, warnings = global_report.collect_breakthroughs(self.now)
        self.assertEqual(selected, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("Broken source", warnings[0])

    def test_render_includes_source_script_and_maturity_caveat(self):
        item = base.NewsItem(
            "A new <quantum> device",
            "https://example.org/paper?a=1&b=2",
            "University research",
            self.now,
            "Researchers demonstrate a new device in laboratory experiments and report measured performance.",
        )
        rendered = global_report.render_breakthrough(item)
        self.assertIn("TikTok 约 60 秒口播稿", rendered)
        self.assertIn("成熟度判断", rendered)
        self.assertIn("实验室验证", rendered)
        self.assertIn("&lt;quantum&gt;", rendered)
        self.assertIn("https://example.org/paper?a=1&amp;b=2", rendered)

    def test_empty_section_does_not_invent_a_breakthrough(self):
        section = global_report.build_section([])
        self.assertIn("未筛选到", section)
        self.assertNotIn("虚构", section)

    def test_topic_label_identifies_robotics(self):
        item = base.NewsItem(
            "New robot manipulation method",
            "https://example.org/robot",
            "Research",
            self.now,
            "Researchers demonstrate robotics experiments.",
        )
        self.assertEqual(global_report._topic_label(item), "机器人")


    def test_global_section_reports_independent_selected_count(self):
        rows = [
            base.NewsItem(f"New technology result {index}", f"https://example.org/{index}",
                          "Research", self.now, "Researchers demonstrate a new method with measured experimental results.")
            for index in range(2)
        ]
        section = global_report.build_section(rows)
        self.assertIn('data-global-technology-selected="2"', section)
        self.assertIn("独立入选 2 条", section)
        self.assertEqual(section.count("<article"), 2)

    def test_gemini_retries_transient_503_then_succeeds(self):
        import json
        import urllib.error
        item = base.NewsItem(
            "A fuel cell catalyst result", "https://example.org/catalyst", "Research", self.now,
            "Researchers report catalyst measurements from controlled laboratory experiments.",
            category="基础材料与催化剂",
        )
        error = urllib.error.HTTPError(
            "https://example.org", 503, "Service Unavailable", {"Retry-After": "0"}, None
        )
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({
            "candidates": [{"content": {"parts": [{"text": json.dumps({
                "items": [{"id": "0", "zh_title": "title"}]
            })}]}}]
        }).encode("utf-8")
        with (
            mock.patch.object(base, "discover_gemini_models", return_value=["models/gemini-primary"]),
            mock.patch.object(base.urllib.request, "urlopen", side_effect=[error, response]) as urlopen,
            mock.patch.object(base.time, "sleep"),
        ):
            self.assertTrue(base.enrich_with_gemini([item], "test-key", max_attempts=2))
        self.assertEqual(urlopen.call_count, 2)
        self.assertEqual(item.editorial["zh_title"], "title")

    def test_gemini_fails_over_to_another_available_flash_model(self):
        import json
        import urllib.error
        item = base.NewsItem(
            "A fuel cell catalyst result", "https://example.org/catalyst", "Research", self.now,
            "Researchers report catalyst measurements from controlled laboratory experiments.",
            category="基础材料与催化剂",
        )
        unavailable = urllib.error.HTTPError(
            "https://example.org", 503, "Service Unavailable", {"Retry-After": "0"}, None
        )
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({
            "candidates": [{"content": {"parts": [{"text": json.dumps({
                "items": [{"id": "0", "zh_title": "fallback-model-title"}]
            })}]}}]
        }).encode("utf-8")
        with (
            mock.patch.object(base, "discover_gemini_models", return_value=["models/gemini-primary", "models/gemini-fallback"]),
            mock.patch.object(base.urllib.request, "urlopen", side_effect=[unavailable, unavailable, response]) as urlopen,
            mock.patch.object(base.time, "sleep"),
        ):
            self.assertTrue(base.enrich_with_gemini([item], "test-key", max_attempts=2))
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual(item.editorial["zh_title"], "fallback-model-title")
        self.assertIn("models/gemini-fallback:generateContent", urlopen.call_args.args[0].full_url)

    def test_gemini_model_discovery_filters_unsupported_and_audio_models(self):
        import json
        first = mock.MagicMock()
        first.__enter__.return_value.read.return_value = json.dumps({
            "models": [
                {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/gemini-2.5-flash-preview-tts", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
                {"name": "models/gemini-pro", "supportedGenerationMethods": ["generateContent"]},
            ],
            "nextPageToken": "next",
        }).encode("utf-8")
        second = mock.MagicMock()
        second.__enter__.return_value.read.return_value = json.dumps({
            "models": [
                {"name": "models/gemini-3.8-flash-lite", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/gemini-live-flash", "supportedGenerationMethods": ["generateContent"]},
            ]
        }).encode("utf-8")
        with mock.patch.object(base.urllib.request, "urlopen", side_effect=[first, second]):
            self.assertEqual(
                base.discover_gemini_models("test-key", "gemini-configured"),
                ["models/gemini-2.5-flash", "models/gemini-3.8-flash-lite"],
            )

    def test_topic_label_does_not_misclassify_heterogeneous_as_gene(self):
        item = base.NewsItem(
            "A boundary integral method for electron repulsion integrals in heterogeneous dielectric environments",
            "https://example.org/physics",
            "Research",
            self.now,
            "A computational method for electronic structure in heterogeneous dielectric media.",
        )
        self.assertNotEqual(global_report._topic_label(item), "生物工程")

if __name__ == "__main__":
    unittest.main()
