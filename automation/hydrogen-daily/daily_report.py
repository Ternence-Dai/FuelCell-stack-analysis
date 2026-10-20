#!/usr/bin/env python3
"""Build and optionally email a daily global hydrogen fuel-cell industry brief.

Uses Python's standard library only. Public RSS content is the factual source of
record. Gemini enrichment is optional and is constrained to the supplied feed
content; without an API key, a transparent rule-based editorial fallback is used.
"""
from __future__ import annotations

import difflib
import global_breakthrough
import email.utils
import html
import json
import os
import re
import smtplib
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.headerregistry import Address
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo
from urllib.parse import urlparse

TZ = ZoneInfo("Asia/Singapore")
USER_AGENT = "Ternence-Hydrogen-Industry-Intelligence/1.0 (+https://github.com/Ternence-Dai/FuelCell-stack-analysis)"

RSS_SOURCES: tuple[tuple[str, str], ...] = (
    ("FuelCellsWorks", "https://fuelcellsworks.com/feed/"),
    ("Google News · 全球氢燃料电池", "https://news.google.com/rss/search?q=hydrogen+fuel+cell+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · PEM、膜电极与催化剂", "https://news.google.com/rss/search?q=PEM+fuel+cell+membrane+catalyst+MEA+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · 电堆与双极板", "https://news.google.com/rss/search?q=fuel+cell+stack+bipolar+plate+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · 氢气制储运与加注", "https://news.google.com/rss/search?q=hydrogen+production+storage+transport+refueling+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · 商业化与应用", "https://news.google.com/rss/search?q=fuel+cell+commercialization+vehicle+stationary+power+when%3A1d&hl=en-US&gl=US&ceid=US:en"),
    ("Google News · 欧洲氢能产业", "https://news.google.com/rss/search?q=hydrogen+fuel+cell+industry+Europe+when%3A1d&hl=en-GB&gl=GB&ceid=GB:en"),
    ("Google News · 亚洲氢能产业", "https://news.google.com/rss/search?q=hydrogen+fuel+cell+industry+Asia+when%3A1d&hl=en-SG&gl=SG&ceid=SG:en"),
)

CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
    "基础材料与催化剂": (
        "catalyst", "platinum", "pt catalyst", "carbon support", "carbon paper",
        "gas diffusion layer", "gdl", "ionomer", "electrode", "anode", "cathode",
        "催化剂", "铂", "碳纸", "气体扩散层", "离聚物", "阳极", "阴极", "基础材料",
    ),
    "质子交换膜与 MEA": (
        "proton exchange membrane", "pem membrane", "membrane electrode assembly", "mea",
        "pfsa", "nafion", "膜电极", "质子交换膜", "质子膜", "膜材料",
    ),
    "双极板与电堆": (
        "bipolar plate", "flow field", "fuel cell stack", "stack assembly", "stack power",
        "graphite plate", "metal plate", "双极板", "流道", "电堆", "堆芯",
    ),
    "系统集成与应用": (
        "fuel cell system", "system integration", "power system", "backup power",
        "stationary power", "heavy-duty truck", "bus", "marine", "aviation", "vehicle",
        "系统集成", "燃料电池系统", "备用电源", "重卡", "船舶", "航空", "车辆",
    ),
    "氢气制备、储运与加注": (
        "hydrogen production", "electrolyzer", "electrolysis", "hydrogen storage",
        "hydrogen transport", "hydrogen carrier", "liquid hydrogen", "pipeline",
        "refueling station", "hydrogen station", "compressed hydrogen", "ammonia",
        "制氢", "电解槽", "储氢", "运氢", "液氢", "输氢", "加氢站", "氨",
    ),
    "氢基燃料及交通航空应用": (
        "sustainable aviation fuel", "aviation fuel", "hydrogen-based aviation fuel",
        "e-saf", "e-fuel", "synthetic fuel", "hydrogen-based aviation",
        "hydrogen-derived fuel", "green aviation fuel", "green hydrogen-based", "氢基燃料",
        "可持续航空燃料", "合成燃料",
    ),
    "产业化、政策与投资": (
        "investment", "commercialization", "commercial deployment", "mass production",
        "production facility", "order", "contract", "subsidy", "policy", "funding",
        "投资", "商业化", "量产", "订单", "合同", "补贴", "政策", "融资", "项目落地",
    ),
}

CATEGORY_INSIGHTS = {
    "基础材料与催化剂": (
        "重点核对催化剂组成、贵金属载量、载体稳定性及材料测试条件；若来源没有披露数值，不推定性能提升幅度。",
        "可能影响膜电极成本、耐久性及供应链安全，需结合批量制备能力和一致性验证判断产业价值。",
        "可关注催化层配方、贵金属利用率、碳载体腐蚀和批次一致性，并将可核验参数纳入材料数据库。",
    ),
    "质子交换膜与 MEA": (
        "重点关注膜电导率、气体渗透、化学/机械稳定性、湿度窗口和 MEA 制备工艺；来源未披露的指标应标为未披露。",
        "膜与 MEA 的性能及制造良率会传导至电堆功率密度、寿命和系统成本。",
        "建议追踪膜厚、面电阻、氢气交叉渗透、加速老化条件及膜电极热压/涂布工艺。",
    ),
    "双极板与电堆": (
        "重点查看流场结构、板材/涂层、电接触电阻、耐腐蚀性、密封方案及堆级测试边界。",
        "双极板和电堆制造一致性直接关联压降、热/水管理、功率密度与规模化成本。",
        "可对照流道压降、接触电阻、冷却均匀性、单片一致性和堆级耐久性建立验证矩阵。",
    ),
    "系统集成与应用": (
        "重点区分电堆指标与系统净输出，核对额定功率、效率口径、动态响应、环境条件和耐久测试边界。",
        "应用场景决定系统架构、储氢方案、热管理和运维要求，商业示范不等同于成熟规模化。",
        "建议记录系统净功率、氢耗、启停/负载循环、环境适应性和维护周期，避免将电堆参数误作系统参数。",
    ),
    "氢气制备、储运与加注": (
        "重点核对氢气纯度、压力/温度、储运形式、能耗边界及安全标准，区分规划产能与实际运行数据。",
        "氢源成本、交付能力和加注网络会决定燃料电池项目的全生命周期经济性及可部署范围。",
        "建议把氢气纯度、供氢压力、流量稳定性、加注协议和现场供氢成本纳入系统边界条件。",
    ),
    "氢基燃料及交通航空应用": (
        "重点核对燃料路径、氢源属性、合成过程能耗、生命周期排放边界及最终用户承购安排；不可将氢基燃料项目等同于燃料电池部署。",
        "氢基燃料可能拉动可再生氢需求，但其转化效率、成本和基础设施要求与 PEM 燃料电池不同。",
        "对电堆研发的直接关联有限；可作为上游氢需求和竞争性应用跟踪，不应据此推导电堆订单或性能路线。",
    ),
    "产业化、政策与投资": (
        "重点区分签约、获批、开工、投产和实际交付等阶段，并核对公告中的投资额、产能与时间口径。",
        "政策、资本开支和订单可能改变供应链布局，但公告目标不能直接视作已实现出货或收入。",
        "建议追踪项目节点、设计产能、实际产量、客户验收和本地供应链配套，判断商业化兑现程度。",
    ),
}


@dataclass
class NewsItem:
    title: str
    link: str
    source: str
    published: datetime | None
    summary: str = ""
    image: str = ""
    category: str = "产业化、政策与投资"
    score: float = 0.0
    editorial: dict[str, str] = field(default_factory=dict)


def clean_text(raw: str) -> str:
    raw = html.unescape(raw or "")
    raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].split(":")[-1].lower()


def _child_text(element: ET.Element, names: set[str]) -> str:
    for child in list(element):
        if _local_name(child.tag) in names:
            text = " ".join(t.strip() for t in child.itertext() if t and t.strip())
            if text:
                return text
    return ""


def _parse_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _extract_image(element: ET.Element, summary_raw: str) -> str:
    for node in element.iter():
        name = _local_name(node.tag)
        if name in {"content", "thumbnail", "enclosure"}:
            url = node.attrib.get("url", "")
            media_type = node.attrib.get("type", "")
            if url.startswith("https://") and (name != "enclosure" or not media_type or media_type.startswith("image/")):
                return url
    match = re.search(r'''(?:src|data-src)=["'](https?://[^"']+)["']''', summary_raw, re.I)
    return html.unescape(match.group(1)) if match else ""


class _ArticleHTMLParser(HTMLParser):
    """Extract conservative article metadata without adding third-party dependencies."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.paragraphs: list[str] = []
        self._in_p = False
        self._current_p: list[str] = []
        self._in_title = False
        self.title_parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "meta":
            key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            value = (attrs.get("content") or "").strip()
            if key and value:
                self.meta.setdefault(key, value)
        elif tag.lower() == "p":
            self._in_p = True
            self._current_p = []
        elif tag.lower() == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == "p" and self._in_p:
            text = clean_text(" ".join(self._current_p))
            if len(text) >= 45:
                self.paragraphs.append(text)
            self._in_p = False
            self._current_p = []
        elif tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_p:
            self._current_p.append(data)
        if self._in_title:
            self.title_parts.append(data)


def hydrate_article(item: NewsItem) -> None:
    """Fill missing RSS summaries and metadata from the publisher page when accessible."""
    request = urllib.request.Request(
        item.link,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            body = response.read(1_500_000)
            content_type = response.headers.get("Content-Type", "")
        if "html" not in content_type.lower() and not body.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            return
        parser = _ArticleHTMLParser()
        parser.feed(body.decode("utf-8", errors="replace"))
        meta = parser.meta
        if not item.summary or "comprehensive up-to-date news coverage" in item.summary.lower():
            description = (
                meta.get("og:description") or meta.get("description")
                or meta.get("twitter:description") or ""
            )
            candidate_summary = clean_text(description) if description else " ".join(parser.paragraphs[:5])
            if candidate_summary and "comprehensive up-to-date news coverage" not in candidate_summary.lower():
                item.summary = candidate_summary[:1800]
        if not item.image:
            candidate_image = meta.get("og:image") or meta.get("twitter:image") or ""
            if candidate_image.startswith("https://"):
                item.image = candidate_image
        date_value = (
            meta.get("article:published_time") or meta.get("datepublished")
            or meta.get("pubdate") or meta.get("publishdate") or ""
        )
        parsed_date = _parse_date(date_value)
        if parsed_date:
            # Prefer the publisher's explicit original publication timestamp over an RSS refresh date.
            item.published = parsed_date
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        print(f"Article page enrichment unavailable: {urlparse(item.link).netloc} ({type(exc).__name__}).")


def parse_feed(xml_bytes: bytes, feed_name: str) -> list[NewsItem]:
    root = ET.fromstring(xml_bytes)
    elements = [node for node in root.iter() if _local_name(node.tag) in {"item", "entry"}]
    result: list[NewsItem] = []
    for entry in elements:
        title = clean_text(_child_text(entry, {"title"}))
        if not title:
            continue
        link = ""
        for child in list(entry):
            if _local_name(child.tag) == "link":
                link = child.attrib.get("href", "") or (child.text or "").strip()
                if child.attrib.get("rel", "alternate") in {"alternate", ""}:
                    break
        if not link:
            link = _child_text(entry, {"guid", "id"})
        if not link.startswith(("https://", "http://")):
            continue
        summary_raw = _child_text(entry, {"description", "summary", "encoded", "content"})
        summary = clean_text(summary_raw)[:3500]
        summary_lower = summary.lower()
        if (
            _norm_title(summary) == _norm_title(title)
            or "comprehensive up-to-date news coverage" in summary_lower
            or "aggregated from sources all over the world by google news" in summary_lower
        ):
            summary = ""
        published_text = _child_text(entry, {"pubdate", "published", "updated", "date", "issued"})
        source = _child_text(entry, {"source", "creator", "author"}) or feed_name
        image_url = _extract_image(entry, summary_raw)
        result.append(NewsItem(
            title=title[:500], link=link, source=clean_text(source)[:120],
            published=_parse_date(clean_text(published_text)), summary=summary,
            image=image_url,
        ))
    return result


def _url_publication_day(link: str):
    """Read an explicit YYYY/MM/DD date embedded in an article URL, when present."""
    path = urlparse(link).path
    match = re.search(r"/(20\d{2})/(\d{1,2})/(\d{1,2})(?:/|$)", path)
    if not match:
        return None
    try:
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3))).date()
    except ValueError:
        return None


def filter_recent(items: Iterable[NewsItem], now: datetime, window_hours: int = 24) -> list[NewsItem]:
    """Keep timestamped items in the rolling window; reject URL dates that prove a repost is old."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    cutoff = now.astimezone(timezone.utc) - timedelta(hours=window_hours)
    kept = []
    for item in items:
        if item.published is None or item.published < cutoff:
            continue
        url_day = _url_publication_day(item.link)
        if url_day is not None and url_day < cutoff.date():
            continue
        kept.append(item)
    return kept


def collect_news(now: datetime | None = None) -> tuple[list[NewsItem], list[str]]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    all_items: list[NewsItem] = []
    warnings: list[str] = []
    for name, url in RSS_SOURCES:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"})
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read(4_000_000)
            parsed = parse_feed(body, name)
            all_items.extend(parsed)
            print(f"RSS OK: {name}: {len(parsed)} items")
        except (urllib.error.URLError, TimeoutError, ET.ParseError, ValueError) as exc:
            warning = f"RSS source unavailable: {name} ({type(exc).__name__})"
            warnings.append(warning)
            print(warning, file=sys.stderr)
        time.sleep(0.2)

    undated_count = sum(1 for item in all_items if item.published is None)
    if undated_count:
        warnings.append(f"Excluded {undated_count} RSS item(s) without publication timestamps from the 24-hour window.")
    recent = filter_recent(all_items, now, window_hours=24)
    for item in recent:
        classify_and_score(item, now)
    unique = deduplicate(recent)
    return unique, warnings


def classify_and_score(item: NewsItem, now: datetime) -> None:
    text = f"{item.title} {item.summary}".lower()
    category_hits: list[tuple[int, str]] = []
    for category, terms in CATEGORY_TERMS.items():
        hits = sum(1 for term in terms if term in text)
        if hits:
            category_hits.append((hits, category))
    if category_hits:
        item.category = max(category_hits, key=lambda row: row[0])[1]
    else:
        item.category = "产业化、政策与投资"
    item.score = 3.0 + sum(min(hits, 4) * 2.0 for hits, _ in category_hits)
    if item.published:
        age = max(0.0, (now - item.published).total_seconds() / 3600)
        item.score += 5.0 if age <= 24 else 3.0 if age <= 72 else 0.5
    else:
        item.score -= 1.0
    if "fuelcellsworks" in item.source.lower():
        item.score += 2.0
    if not item.summary.strip():
        item.score -= 6.0
    noise_terms = (
        "stock price", "share price", "analyst rating", "price target",
        "negative sentiment", "market weakness", "shares slide", "stock outlook",
    )
    if any(term in text for term in noise_terms):
        item.score -= 25.0
    if len(item.summary) > 120:
        item.score += 1.0
    if len(item.title) < 18:
        item.score -= 1.0


def _norm_title(value: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", value.lower())


def deduplicate(items: Iterable[NewsItem]) -> list[NewsItem]:
    ranked = sorted(items, key=lambda item: item.score, reverse=True)
    kept: list[NewsItem] = []
    links: set[str] = set()
    normalized_titles: list[str] = []
    for item in ranked:
        url_key = item.link.split("?", 1)[0].rstrip("/").lower()
        title_key = _norm_title(item.title)
        if url_key in links:
            continue
        if any(difflib.SequenceMatcher(None, title_key, prior).ratio() >= 0.88 for prior in normalized_titles):
            continue
        links.add(url_key)
        normalized_titles.append(title_key)
        kept.append(item)
    return kept


def select_top_news(items: list[NewsItem], limit: int = 5, minimum: int = 3) -> list[NewsItem]:
    ranked = sorted(items, key=lambda item: item.score, reverse=True)
    selected: list[NewsItem] = []
    counts: dict[str, int] = {}
    for item in ranked:
        if len(selected) >= limit:
            break
        if counts.get(item.category, 0) >= 2:
            continue
        selected.append(item)
        counts[item.category] = counts.get(item.category, 0) + 1
    if len(selected) < min(minimum, len(ranked)):
        selected_ids = {id(item) for item in selected}
        for item in ranked:
            if len(selected) >= min(limit, len(ranked)):
                break
            if id(item) not in selected_ids:
                selected.append(item)
    return selected


def is_substantive_summary(summary: str) -> bool:
    """Require a factual summary; reject empty text and generic aggregator boilerplate."""
    value = clean_text(summary)
    lower = value.lower()
    if len(value) < 45:
        return False
    if "comprehensive up-to-date news coverage" in lower:
        return False
    if "aggregated from sources all over the world by google news" in lower:
        return False
    return True


def deterministic_editorial(item: NewsItem) -> dict[str, str]:
    tech, impact, relevance = CATEGORY_INSIGHTS[item.category]
    fact = item.summary or "RSS 来源未提供可用摘要；本条仅保留原始标题、来源和链接，需打开原文核验。"
    return {
        "zh_title": item.title,
        "facts": fact,
        "tech": tech,
        "impact": impact,
        "stack_relevance": relevance,
        "uncertainty": "本版未调用语言模型；事实部分仅转录 RSS 摘要，技术分析为分类提示。关键数据、参数和结论请以原始报道为准。",
    }


def _extract_response_text(data: dict) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts)
    if not text.strip():
        raise ValueError("Gemini returned empty text")
    return text.strip()


def enrich_with_gemini(items: list[NewsItem], api_key: str, model: str = "gemini-3.8-flash") -> bool:
    if not api_key or not items:
        return False
    payload_items = [{
        "id": str(index), "source": item.source, "date": item.published.astimezone(TZ).isoformat() if item.published else "not supplied",
        "title": item.title, "category": item.category, "rss_summary": item.summary[:1800], "url": item.link,
    } for index, item in enumerate(items)]
    prompt = (
        "你是氢燃料电池产业研究编辑。请仅根据下列 RSS 原始材料为每条新闻写中文专业简报。"
        "不得联网补充，不得臆造数字、公司动作、技术参数、产品性能、因果关系或发布时间；"
        "RSS 未披露的信息必须明确写‘来源未披露/需查原文’，不能推断成事实。"
        "区分新闻事实与编辑分析。对电堆研发的建议须标注为研究参考，不可伪装成报道事实。"
        "只返回合法 JSON，结构为 {\"items\":[{\"id\":\"0\",\"zh_title\":\"...\","
        "\"facts\":\"...\",\"tech\":\"...\",\"impact\":\"...\","
        "\"stack_relevance\":\"...\",\"uncertainty\":\"...\"}]}。"
        "facts 写新闻事实/来源摘要；tech 写技术解读；impact 写产业链影响；"
        "stack_relevance 写对 PEM 燃料电池电堆研发的参考；uncertainty 写资料局限。\n\n"
        + json.dumps(payload_items, ensure_ascii=False)
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model, safe='')}:generateContent"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": api_key, "User-Agent": USER_AGENT}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_data = json.loads(response.read().decode("utf-8"))
        generated = _extract_response_text(response_data)
        parsed = json.loads(generated)
        by_id = {str(row.get("id")): row for row in parsed.get("items", []) if isinstance(row, dict)}
        for index, item in enumerate(items):
            row = by_id.get(str(index))
            if not row:
                item.editorial = deterministic_editorial(item)
                continue
            fallback = deterministic_editorial(item)
            item.editorial = {
                key: clean_text(str(row.get(key, "")))[:5000] or fallback[key]
                for key in ("zh_title", "facts", "tech", "impact", "stack_relevance", "uncertainty")
            }
        return True
    except urllib.error.HTTPError as exc:
        # Log only the HTTP status; never print request headers, API keys, or response bodies.
        print(f"Gemini API rejected the request (HTTP {exc.code}); using transparent RSS fallback.", file=sys.stderr)
        return False
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"Gemini enrichment unavailable; using transparent RSS fallback ({type(exc).__name__}).", file=sys.stderr)
        return False


def _date_label(value: datetime | None) -> str:
    return value.astimezone(TZ).strftime("%Y-%m-%d %H:%M SGT") if value else "来源未提供发布时间"


def build_html(items: list[NewsItem], warnings: list[str], enriched: bool, now: datetime | None = None, breakthroughs: list[NewsItem] | None = None) -> str:
    now_local = (now or datetime.now(timezone.utc)).astimezone(TZ)
    cards: list[str] = []
    for index, item in enumerate(items, 1):
        editorial = item.editorial or deterministic_editorial(item)
        image_html = ""
        if item.image.startswith("https://"):
            image_html = (
                f'<p><a href="{html.escape(item.image, quote=True)}">查看来源图片</a></p>'
                f'<img src="{html.escape(item.image, quote=True)}" alt="来源图片" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:10px 0;">'
            )
        source_link = html.escape(item.link, quote=True)
        cards.append(f"""
        <article style="border:1px solid #dbe3ea;border-radius:12px;padding:18px;margin:18px 0;background:#ffffff;">
          <p style="margin:0 0 8px;color:#526273;font-size:12px;">精选 {index} · {html.escape(item.category)} · {html.escape(item.source)} · {html.escape(_date_label(item.published))}</p>
          <h2 style="font-size:19px;line-height:1.45;margin:0 0 12px;color:#102a43;">{html.escape(editorial['zh_title'])}</h2>
          <p style="margin:0 0 8px;"><strong>新闻事实</strong></p>
          <p style="line-height:1.75;margin:0 0 13px;">{html.escape(editorial['facts'])}</p>
          <p style="margin:0 0 8px;"><strong>技术解读</strong></p>
          <p style="line-height:1.75;margin:0 0 13px;">{html.escape(editorial['tech'])}</p>
          <p style="margin:0 0 8px;"><strong>产业链影响</strong></p>
          <p style="line-height:1.75;margin:0 0 13px;">{html.escape(editorial['impact'])}</p>
          <p style="margin:0 0 8px;"><strong>对燃料电池电堆研发的参考</strong></p>
          <p style="line-height:1.75;margin:0 0 13px;">{html.escape(editorial['stack_relevance'])}</p>
          <p style="margin:0 0 8px;color:#526273;font-size:13px;"><strong>信息局限：</strong>{html.escape(editorial['uncertainty'])}</p>
          {image_html}
          <p style="margin:12px 0 0;"><a href="{source_link}" style="color:#0866c6;">阅读原始报道与来源</a></p>
        </article>
        """)
    warning_html = ""
    if warnings:
        warning_html = "<p style='color:#8a5200;background:#fff7e6;padding:10px;border-radius:8px;'><strong>采集提醒：</strong>部分 RSS 来源本次不可用，已跳过，未编造补齐。</p>"
    mode_note = "已使用 Gemini 对 RSS 材料进行中文编辑；分析严格受所提供来源内容约束。" if enriched else "未配置或暂不可用的 AI API：事实区保留 RSS 原始摘要，分析区使用透明的规则化技术提示；没有补造事实。"
    empty = "<p>最近 24 小时内没有采集到可用新闻。系统未编造新闻，也不会发送空白日报。</p>" if not cards else "".join(cards)
    global_section = global_breakthrough.build_section(breakthroughs or [])
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head>
    <body style="margin:0;padding:20px;background:#f3f6f9;font-family:Arial,'Microsoft YaHei',sans-serif;color:#243b53;">
      <main style="max-width:820px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;">
        <header style="padding:8px 0 18px;border-bottom:2px solid #d8e2ec;">
          <p style="margin:0 0 8px;color:#627d98;font-size:12px;letter-spacing:1px;">GLOBAL SCIENCE & ENGINEERING + HYDROGEN INTELLIGENCE</p>
          <h1 style="font-size:25px;margin:0 0 8px;color:#102a43;">全球科技突破与氢燃料电池产业每日情报</h1>
          <p style="margin:0;color:#627d98;">{now_local.strftime('%Y年%m月%d日')} · 新加坡时间 {now_local.strftime('%H:%M')} · 精选 {len(items)} 条</p>
        </header>
        <p style="line-height:1.7;">覆盖基础材料、催化剂、质子交换膜、MEA、双极板、电堆、系统集成、氢气制储运及商业化。优先采用近期消息，并保留原始报道链接。</p>
        {warning_html}
        <p style="font-size:12px;color:#627d98;">编辑方式：{html.escape(mode_note)}</p>
        {global_section}
        <h2>全球氢燃料电池产业情报</h2>
        {empty}
        <footer style="border-top:1px solid #d8e2ec;margin-top:24px;padding-top:14px;color:#627d98;font-size:12px;line-height:1.7;">
          本日报由自动化程序采集公开 RSS 信息。新闻事实以原文为准；技术分析属于研究参考，不替代原始测试数据或正式技术验证。<br>
          未取得明确图片来源时不展示图片；没有足够可靠的新闻时不凑数。
        </footer>
      </main>
    </body></html>"""


def mask_email(address: str) -> str:
    """Mask an email address for public Actions logs while retaining a useful suffix."""
    value = (address or "").strip()
    if "@" not in value:
        return "<invalid-or-non-email-address>"
    local, domain = value.rsplit("@", 1)
    visible = local[-5:] if len(local) > 5 else local[:1]
    masked = ("*" * max(0, len(local) - len(visible))) + visible
    return f"{masked}@{domain}"


def send_email(subject: str, html_body: str) -> None:
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    recipient = os.environ.get("REPORT_RECIPIENT", "").strip()
    host = os.environ.get("SMTP_HOST", "smtp.163.com").strip()
    port = int(os.environ.get("SMTP_PORT", "465"))
    if not username or not password or not recipient:
        raise RuntimeError("Missing SMTP_USERNAME, SMTP_PASSWORD, or REPORT_RECIPIENT repository secrets.")
    parsed_recipient = email.utils.parseaddr(recipient)[1]
    if not parsed_recipient or parsed_recipient != recipient or "@" not in parsed_recipient:
        raise RuntimeError("REPORT_RECIPIENT must contain one valid email address.")
    print(f"SMTP sender configured: {mask_email(username)}")
    print(f"SMTP recipient configured: {mask_email(recipient)}")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = Address(display_name="全球氢燃料电池产业每日情报", addr_spec=username)
    message["To"] = recipient
    message.set_content("请使用支持 HTML 的邮件客户端查看本期全球氢燃料电池产业每日情报。")
    message.add_alternative(html_body, subtype="html")
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context, timeout=35) as server:
        server.login(username, password)
        refused = server.send_message(message)
    if refused:
        refused_targets = ", ".join(mask_email(item) for item in refused)
        raise RuntimeError(f"SMTP refused recipient(s): {refused_targets}")
    print(f"SMTP relay accepted the envelope recipient: {mask_email(recipient)}")


def main() -> int:
    mode = os.environ.get("REPORT_MODE", "preview").strip().lower()
    if mode not in {"preview", "send"}:
        raise ValueError("REPORT_MODE must be preview or send")
    print(f"Configured SMTP sender: {mask_email(os.environ.get('SMTP_USERNAME', ''))}")
    print(f"Configured report recipient: {mask_email(os.environ.get('REPORT_RECIPIENT', ''))}")
    now = datetime.now(timezone.utc)
    items, warnings = collect_news(now)
    breakthroughs, breakthrough_warnings = global_breakthrough.collect_breakthroughs(now)
    warnings.extend(breakthrough_warnings)
    for breakthrough in breakthroughs:
        global_breakthrough.base.hydrate_article(breakthrough)
    # Enrich a wider shortlist so weak or stock-only stories can be replaced by substantive reporting.
    selected = select_top_news(items, limit=8, minimum=5)
    for item in selected:
        hydrate_article(item)
    # Re-apply the 24-hour gate after publisher metadata has had a chance to correct RSS dates.
    selected = filter_recent(selected, now, window_hours=24)
    # Do not pad the digest with title-only stories or aggregator boilerplate.
    selected = [item for item in selected if is_substantive_summary(item.summary)]
    for item in selected:
        classify_and_score(item, now)
        item.editorial = {}
    selected = select_top_news(selected, limit=5, minimum=3)
    if not selected and not breakthroughs:
        raise RuntimeError("No usable hydrogen news or global science breakthrough was found in the last 24 hours; email was not sent.")

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
    enriched = enrich_with_gemini(selected, api_key, model) if api_key else False
    for item in selected:
        if not item.editorial:
            item.editorial = deterministic_editorial(item)

    local_now = now.astimezone(TZ)
    date_tag = local_now.strftime("%Y-%m-%d")
    subject = f"全球科技突破与氢燃料电池产业每日情报 {date_tag}"
    html_body = build_html(selected, warnings, enriched, now, breakthroughs)
    output = Path("dist/hydrogen-industry-daily-report.html")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html_body, encoding="utf-8")
    print(f"Selected {len(selected)} news item(s); Gemini enrichment: {'yes' if enriched else 'no'}.")
    print(f"HTML report written to {output}.")
    if mode == "send":
        send_email(subject, html_body)
        print("Email sent successfully via SMTP.")
    else:
        print("Preview mode: no email was sent.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # Fail visibly in Actions without printing secret values.
        print(f"Daily report failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
