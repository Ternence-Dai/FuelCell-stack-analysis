/* Workspace V5.3 — engineering model scope and evidence disclosure */
(function () {
  "use strict";
  const allowedPages = new Set(["dashboard", "sim", "calc", "monitor", "model"]);
  const content = document.getElementById("content");
  if (!content) return;

  function pageKey() {
    const active = document.querySelector("#sideNav .nav-item.active");
    return active ? active.dataset.id || "" : "";
  }

  function buildDisclosure(page) {
    const panel = document.createElement("aside");
    panel.className = "w5-model-assurance";
    panel.setAttribute("role", "note");
    panel.setAttribute("aria-label", "当前工程模型适用范围与限制");

    const heading = document.createElement("div");
    heading.className = "w5-model-assurance__heading";
    heading.textContent = "MODEL SCOPE / 工程模型适用范围";
    const body = document.createElement("p");
    body.className = "w5-model-assurance__body";
    body.textContent =
      "当前电压损耗计算由 Tafel 活化项、欧姆内阻项和经验指数浓差项组成。浓差项是项目内经验近似，未显式求解极限电流密度或反应物传质状态，因此不能称为完整 Amphlett 实现。所有输出均是当前模型条件下的估算值；未经真实台架数据标定和独立验证，不得视为实测结果或认证性能。";
    const tags = document.createElement("div");
    tags.className = "w5-model-assurance__tags";
    [
      "经验浓差项",
      "未显式求解极限电流密度",
      "未显式求解反应物传质",
      "非台架实测"
    ].forEach(label => {
      const item = document.createElement("span");
      item.textContent = label;
      tags.appendChild(item);
    });
    panel.append(heading, body, tags);

    if (page === "model") {
      const simulated = document.createElement("small");
      simulated.className = "w5-model-assurance__secondary";
      simulated.textContent =
        "本页训练曲线、R²、误差与延迟仍为随机数演示，不代表已接入训练框架、真实推理或验证集结果。";
      panel.appendChild(simulated);
    }
    return panel;
  }

  function render() {
    const page = pageKey();
    const existing = content.querySelector(".w5-model-assurance");
    if (!allowedPages.has(page)) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.dataset.page === page) return;
    if (existing) existing.remove();
    const panel = buildDisclosure(page);
    panel.dataset.page = page;
    content.insertBefore(panel, content.firstChild);
  }

  const observer = new MutationObserver(render);
  observer.observe(content, { childList: true, subtree: true });
  const nav = document.getElementById("sideNav");
  if (nav) observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  render();
})();