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
        self.assertIn("技术成熟度与局限", rendered)
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


if __name__ == "__main__":
    unittest.main()
