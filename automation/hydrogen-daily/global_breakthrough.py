"""Daily cross-domain science and engineering breakthrough discovery."""
from __future__ import annotations

import html
import re
import sys
import time
import xml.etree.ElementTree as ET
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import quote, urlparse

import daily_report as base

GLOBAL_SOURCES = (
    ("arXiv · AI/机器学习", "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40"),
    ("arXiv · 机器人/计算机视觉", "https://export.arxiv.org/api/query?search_query=cat:cs.RO+OR+cat:cs.CV&sortBy=submittedDate&sortOrder=descending&max_results=40"),
    ("arXiv · 量子/材料/应用物理", "https://export.arxiv.org/api/query?search_query=cat:quant-ph+OR+cat:cond-mat.mtrl-sci+OR+cat:physics.app-ph&sortBy=submittedDate&sortOrder=descending&max_results=40"),
    ("Google News · 全球科技突破", "https://news.google.com/rss/search?q=(scientific+breakthrough+OR+engineering+breakthrough+OR+new+technology)+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · 芯片/航天/新能源/生物工程", "https://news.google.com/rss/search?q=(semiconductor+OR+space+technology+OR+battery+OR+biotechnology)+research+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
)
TECH_TERMS = (
    "breakthrough", "novel", "new method", "record", "first demonstration",
    "published", "researchers", "demonstrate", "prototype", "efficiency",
    "robot", "chip", "quantum", "battery", "solar", "fusion", "gene",
    "protein", "material", "semiconductor", "space", "ai", "artificial intelligence",
    "robotics", "catalyst", "energy", "device", "实验", "突破", "研究", "首次",
    "新型", "效率", "芯片", "机器人", "量子", "电池", "材料", "航天", "基因",
)
GLOBAL_BREAKTHROUGH_LIMIT = 3

NOISE_TERMS = ("stock price", "shares", "market outlook", "analyst rating", "funding round", "earnings")


def collect_breakthroughs(now: datetime | None = None) -> tuple[list[base.NewsItem], list[str]]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidates: list[base.NewsItem] = []
    warnings: list[str] = []
    for source, url in GLOBAL_SOURCES:
        request = urllib.request.Request(
            url, headers={"User-Agent": base.USER_AGENT, "Accept": "application/atom+xml, application/rss+xml, application/xml"}
        )
        try:
            with urllib.request.urlopen(request, timeout=22) as response:
                entries = base.parse_feed(response.read(4_000_000), source)
            candidates.extend(entries)
            print(f"Global technology source OK: {source}: {len(entries)} items")
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, ET.ParseError) as exc:
            warnings.append(f"Global technology source unavailable: {source} ({type(exc).__name__})")
            print(warnings[-1], file=sys.stderr)
        time.sleep(0.15)

    recent = base.filter_recent(candidates, now, window_hours=24)
    ranked = []
    for item in recent:
        summary = item.summary.strip()
        if not base.is_substantive_summary(summary):
            continue
        text = f"{item.title} {summary}".lower()
        if any(term in text for term in NOISE_TERMS):
            continue
        hits = sum(1 for term in TECH_TERMS if term in text)
        item.score = 4.0 + min(hits, 8) * 2.0
        if item.published:
            age = max(0.0, (now - item.published).total_seconds() / 3600)
            item.score += max(0.0, 4.0 - age / 6.0)
        if "arxiv" in item.source.lower():
            item.score += 2.0
        if item.image.startswith("https://"):
            item.score += 0.5
        ranked.append(item)
    unique = base.deduplicate(ranked)
    return unique[:GLOBAL_BREAKTHROUGH_LIMIT], warnings


def _topic_label(item: base.NewsItem) -> str:
    text = f"{item.title} {item.summary}".lower()
    topics = (
        (("robot", "机器人", "robotics"), "机器人"),
        (("chip", "semiconductor", "芯片"), "芯片与半导体"),
        (("quantum", "量子"), "量子科技"),
        (("battery", "电池", "energy storage"), "储能与电池"),
        (("space", "satellite", "航天", "火箭"), "航天科技"),
        (("gene", "protein", "biotech", "基因", "生物"), "生物工程"),
        (("material", "catalyst", "材料"), "先进材料"),
        (("artificial intelligence", "machine learning", " ai ", "大模型"), "人工智能"),
    )
    for terms, label in topics:
        if any(term in text for term in terms):
            return label
    return "前沿科学与工程"


def tiktok_script(item: base.NewsItem) -> str:
    title = item.title.rstrip("。.!?？")
    summary = base.clean_text(item.summary)
    excerpt = summary[:170]
    return (
        f"你知道吗？最近一项来自{item.source}的研究引起关注：{title}。"
        f"公开摘要提到：{excerpt}。它可能带来的意义是，为相关技术提供一种新的研究或工程路径。"
        "但要注意，论文结果、实验室原型、工程试点和商业化产品不是一回事；"
        "具体性能、成本和可规模化程度，还要看原始论文中的实验条件和后续独立验证。"
        "想持续了解科技进展，记得关注。"
    )


def render_breakthrough(item: base.NewsItem) -> str:
    image_html = ""
    if item.image.startswith("https://"):
        safe_image = html.escape(item.image, quote=True)
        image_html = (
            f'<p><a href="{safe_image}">查看来源图片</a></p>'
            f'<img src="{safe_image}" alt="原始来源提供的图片" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:10px 0;">'
        )
    safe_link = html.escape(item.link, quote=True)
    media_note = (
        "图片来自原始发布页；转载或发布前请核对页面版权、许可及署名要求。"
        if image_html else
        "本条未发现可确认授权的图片/视频素材。制作视频时优先使用论文图表（先核对许可）、机构新闻页明确可转载素材，或自行制作示意动画；不要默认可商用。"
    )
    script = html.escape(tiktok_script(item))
    return f"""
    <article style="border:1px solid #c8d9ea;border-radius:12px;padding:18px;margin:18px 0;background:#f7fbff;">
      <p style="margin:0 0 8px;color:#526273;font-size:12px;">全球科技每日突破 · {_topic_label(item)} · {html.escape(item.source)} · {html.escape(base._date_label(item.published))}</p>
      <h2 style="font-size:20px;line-height:1.45;margin:0 0 12px;color:#102a43;">{html.escape(item.title)}</h2>
      <p><strong>研究/工程进展摘要</strong></p>
      <p style="line-height:1.75;">{html.escape(item.summary)}</p>
      <p><strong>创新点与潜在意义</strong></p>
      <p style="line-height:1.75;">{html.escape("请以原始论文或机构公告中的方法、对照实验和量化结果为准。该进展可能为相关领域提供新的技术路径；当前摘要不足以独立确认其性能优势或产业影响。")}</p>
      <p><strong>技术成熟度与局限</strong></p>
      <p style="line-height:1.75;">{html.escape("本自动摘要未将论文/新闻报道推定为商业化成果。成熟度暂标记为“待核验”；需查看原文确认实验室验证、原型、试点或规模化阶段，以及样本量、测试条件、成本和独立复现情况。")}</p>
      <p><strong>图片/视频素材线索</strong></p>
      <p style="line-height:1.75;">{media_note}</p>
      {image_html}
      <p><strong>TikTok 约 60 秒口播稿（初稿）</strong></p>
      <p style="line-height:1.75;white-space:pre-line;">{script}</p>
      <p><strong>建议标签：</strong>#科技前沿 #科学突破 #工程技术 #科普 #Technology #Science</p>
      <p><a href="{safe_link}" style="color:#0866c6;">打开原始论文/报道</a></p>
    </article>"""


def build_section(items: list[base.NewsItem]) -> str:
    if not items:
        return (
            "<section><h2>全球科技每日突破</h2>"
            "<p>最近 24 小时未筛选到满足时间与摘要质量要求的全球科技突破。本期不编造内容；"
            "可查看下方来源采集提醒，下一次定时任务会继续检索。</p></section>"
        )
    return "<section><h2>全球科技每日突破</h2>" + "".join(render_breakthrough(item) for item in items) + "</section>"
