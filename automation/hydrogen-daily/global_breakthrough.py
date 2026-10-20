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
    # Diversify the compact daily shortlist before backfilling repeated topics.
    selected: list[base.NewsItem] = []
    deferred: list[base.NewsItem] = []
    seen_topics: set[str] = set()
    for item in unique:
        topic = _topic_label(item)
        if topic in seen_topics:
            deferred.append(item)
            continue
        selected.append(item)
        seen_topics.add(topic)
        if len(selected) == GLOBAL_BREAKTHROUGH_LIMIT:
            break
    if len(selected) < GLOBAL_BREAKTHROUGH_LIMIT:
        selected.extend(deferred[:GLOBAL_BREAKTHROUGH_LIMIT - len(selected)])
    return selected, warnings


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
        # Match English biomedical keywords as whole words: "gene" must not
        # classify "heterogeneous dielectric" research as biotechnology.
        if any(
            (term in text) if any(ord(char) > 127 for char in term)
            else re.search(r"\b" + re.escape(term) + r"\b", text) is not None
            for term in terms
        ):
            return label
    return "前沿科学与工程"


def _topic_analysis(item: base.NewsItem) -> tuple[str, str, str]:
    """Return topic-specific engineering questions without asserting facts absent from the source."""
    topic = _topic_label(item)
    guidance = {
        "机器人": (
            "重点看感知—规划—控制闭环、末端执行器与真实环境适应性；摘要未给出的成功率、定位误差、响应延迟、负载、能耗和安全指标均须回到原文核验。",
            "核验真实场景任务成功率、长时运行故障率、人与环境安全、仿真到现实迁移、单位任务能耗及维护成本。"
        ),
        "芯片与半导体": (
            "重点区分器件结构、制程/封装、架构和软件栈层面的创新；不能仅凭峰值算力推断系统性能或量产竞争力。",
            "核验制程与良率、功耗/性能、内存带宽、芯片面积、封装热设计、制造可得性及独立基准测试。"
        ),
        "量子科技": (
            "重点区分量子比特数量、门保真度、相干时间、纠错能力与可执行算法规模；单项指标提升不等同于量子优势。",
            "核验物理量子比特与逻辑量子比特、门/读出错误率、纠错开销、可重复运行时间及与经典基线的公平比较。"
        ),
        "储能与电池": (
            "重点识别电化学体系、材料配方、电极/电解质结构及测试工况；实验室单体结果不能直接外推到电池包或商业寿命。",
            "核验能量/功率密度、循环寿命、倍率、温度窗口、快充、安全性、材料成本、规模化制造与回收路径。"
        ),
        "航天科技": (
            "重点区分地面试验、飞行验证、在轨运行和任务级能力；单次演示不代表长期可靠性或成熟运营。",
            "核验载荷、轨道/环境条件、推进性能、任务成功率、寿命、冗余设计、发射与运营成本。"
        ),
        "生物工程": (
            "重点识别作用机制、模型/样本类型、对照设计与验证阶段；细胞或动物实验不能表述为人体疗效。",
            "核验样本量、对照组、统计显著性、独立复现、脱靶/毒性、递送效率及临床或监管阶段。"
        ),
        "先进材料": (
            "重点关注材料组成、制备路线、微观结构—性能关系和失效机理；单次性能纪录须结合测试标准与可制造性判断。",
            "核验表征方法、批次一致性、耐久/环境稳定性、原料来源、工艺窗口、良率和全生命周期成本。"
        ),
        "人工智能": (
            "重点区分模型能力、训练数据、推理效率和真实任务表现；单一榜单分数不能代表泛化、安全或部署价值。",
            "核验评测集污染、基线设置、误差分布、鲁棒性、推理延迟/成本、算力能耗、隐私和实际用户任务表现。"
        ),
    }
    technical, checks = guidance.get(
        topic,
        ("先确认研究对象、核心方法、对照基线和可重复的量化结果；不要将概念验证描述为工程成熟。",
         "核验实验条件、样本规模、对照方法、独立复现、可靠性、成本及从实验室到实际场景的放大路径。")
    )
    return technical, checks


def tiktok_script(item: base.NewsItem) -> str:
    title = item.title.rstrip("。.!?？")
    summary = base.clean_text(item.summary)
    excerpt = summary[:210]
    topic = _topic_label(item)
    return (
        f"【开场】{topic}领域最近出现一项值得关注的新进展：{title}。"
        f"【目前知道什么】来源摘要明确提到：{excerpt}。"
        f"【为什么值得看】关键不只是‘新’，而是它是否改善了真实任务中的性能、可靠性或成本。"
        "【理性提醒】目前这段公开摘要不能单独证明商业化优势；实验室结果、工程原型、试点部署和规模化产品有明显区别。"
        "【下一步看什么】需要回到原文核对测试条件、对照组、量化指标和独立验证。"
        "如果这些证据持续成立，它才可能从研究亮点走向工程应用。"
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
    topic = _topic_label(item)
    technical, checks = _topic_analysis(item)
    script = html.escape(tiktok_script(item))
    return f"""
    <article style="border:1px solid #c8d9ea;border-radius:12px;padding:18px;margin:18px 0;background:#f7fbff;">
      <p style="margin:0 0 8px;color:#526273;font-size:12px;">全球科技每日突破 · {html.escape(topic)} · {html.escape(item.source)} · {html.escape(base._date_label(item.published))}</p>
      <h2 style="font-size:20px;line-height:1.45;margin:0 0 12px;color:#102a43;">{html.escape(item.title)}</h2>
      <p><strong>来源事实与证据边界</strong></p>
      <p style="line-height:1.75;">{html.escape(item.summary)}</p>
      <p><strong>该领域的关键技术问题</strong></p>
      <p style="line-height:1.75;">{html.escape(technical)}</p>
      <p><strong>成熟度判断</strong></p>
      <p style="line-height:1.75;">当前仅凭本条公开摘要无法确认技术成熟度，暂列“待核验”。需区分理论/仿真、实验室验证、原型、现场试点与规模化部署，不将论文或新闻报道等同于商业化成果。</p>
      <p><strong>复核清单（避免只看标题）</strong></p>
      <p style="line-height:1.75;">{html.escape(checks)}</p>
      <p><strong>图片/视频素材线索</strong></p>
      <p style="line-height:1.75;">{"图片来自原始发布页；转载或发布前请核对页面版权、许可及署名要求。" if image_html else "未发现可确认授权的图片/视频素材。可回到论文或机构页面寻找可用图表，并核对许可；也可自行绘制原理示意图，避免默认素材可商用。"}</p>
      {image_html}
      <p><strong>TikTok 约 60 秒口播稿（可编辑初稿）</strong></p>
      <p style="line-height:1.75;white-space:pre-line;">{script}</p>
      <p><strong>建议标签：</strong>#科技前沿 #{html.escape(topic.replace("与", ""))} #科学突破 #工程技术 #科普 #Technology</p>
      <p><a href="{safe_link}" style="color:#0866c6;">打开原始论文/报道</a></p>
    </article>"""

def build_section(items: list[base.NewsItem]) -> str:
    selected_count = len(items)
    if not items:
        return (
            '<section data-global-technology-selected="0"><h2>全球科技每日突破（入选 0 条）</h2>'
            "<p>最近 24 小时未筛选到满足时间与摘要质量要求的全球科技突破。本期不编造内容；"
            "可查看下方来源采集提醒，下一次定时任务会继续检索。</p></section>"
        )
    cards = "".join(render_breakthrough(item) for item in items)
    return (
        f'<section data-global-technology-selected="{selected_count}">'
        f"<h2>全球科技每日突破（独立入选 {selected_count} 条）</h2>{cards}</section>"
    )
