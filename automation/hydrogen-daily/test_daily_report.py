import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daily_report as report


class DailyReportTests(unittest.TestCase):
    def test_parse_rss_item(self):
        xml = b'''<?xml version="1.0"?><rss><channel><item>
        <title>New PEM fuel cell stack announced</title>
        <link>https://example.com/story</link>
        <description><![CDATA[<p>Company announced a new stack.</p>]]></description>
        <pubDate>Mon, 19 Oct 2026 00:00:00 GMT</pubDate>
        <enclosure url="https://example.com/image.jpg" type="image/jpeg" />
        <source>Example Industry News</source></item></channel></rss>'''
        items = report.parse_feed(xml, "Fixture")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].title, "New PEM fuel cell stack announced")
        self.assertIn("Company announced", items[0].summary)
        self.assertEqual(items[0].image, "https://example.com/image.jpg")
        self.assertEqual(items[0].source, "Example Industry News")

    def test_parse_atom_item(self):
        xml = b'''<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>Proton exchange membrane update</title><link href="https://example.com/atom" />
        <summary>Membrane durability study.</summary><updated>2026-10-19T01:00:00Z</updated>
        </entry></feed>'''
        items = report.parse_feed(xml, "Atom Source")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].link, "https://example.com/atom")
        self.assertIsNotNone(items[0].published)

    def test_classifies_membrane_news(self):
        item = report.NewsItem("New proton exchange membrane MEA", "https://x.test/a", "Test", datetime.now(timezone.utc), "PFSA membrane research")
        report.classify_and_score(item, datetime.now(timezone.utc))
        self.assertEqual(item.category, "质子交换膜与 MEA")

    def test_deduplicates_by_title_and_url(self):
        now = datetime.now(timezone.utc)
        rows = [
            report.NewsItem("Toyota announces new hydrogen fuel cell truck", "https://x.test/a?utm_source=feed", "A", now),
            report.NewsItem("Toyota announces new hydrogen fuel-cell truck", "https://y.test/b", "B", now),
            report.NewsItem("New catalyst durability research", "https://x.test/c", "C", now),
        ]
        for row in rows:
            report.classify_and_score(row, now)
        self.assertEqual(len(report.deduplicate(rows)), 2)

    def test_24_hour_filter_excludes_old_and_undated_items(self):
        now = datetime(2026, 10, 20, 0, 0, tzinfo=timezone.utc)
        recent = report.NewsItem("Recent story", "https://x.test/recent", "Test", now - timedelta(hours=23))
        old = report.NewsItem("Old story", "https://x.test/old", "Test", now - timedelta(hours=25))
        undated = report.NewsItem("Undated story", "https://x.test/undated", "Test", None)
        self.assertEqual(report.filter_recent([recent, old, undated], now), [recent])

    def test_selection_limits_to_five_without_inventing(self):
        now = datetime.now(timezone.utc)
        rows = [report.NewsItem(f"Fuel cell report {i}", f"https://x.test/{i}", "Test", now, "Stack technology") for i in range(7)]
        for row in rows:
            report.classify_and_score(row, now)
        self.assertEqual(len(report.select_top_news(rows)), 5)
        self.assertEqual(len(report.select_top_news(rows[:2])), 2)

    def test_report_escapes_untrusted_html(self):
        item = report.NewsItem("Unsafe <script>alert(1)</script> title", "https://example.com/a", "News", None, "Text with <b>tags</b>")
        item.editorial = report.deterministic_editorial(item)
        body = report.build_html([item], [], False, datetime.now(timezone.utc))
        self.assertNotIn("<script>alert(1)</script>", body)
        self.assertIn("&lt;script&gt;", body)


if __name__ == "__main__":
    unittest.main()
