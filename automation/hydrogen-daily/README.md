# 全球氢燃料电池产业每日情报

本目录为 FuelCell-stack-analysis 项目的独立日报自动化子项目。它不修改燃料电池工程网页、计算模型或原有发布流程。

## 工作方式

- 读取公开 RSS 新闻源（FuelCellsWorks、Google News 多个产业链检索主题）。
- 解析 RSS/Atom，按最近 24 小时筛选（没有可核验发布时间的条目不纳入日报），按产业链分类、相关性评分和标题相似度去重。
- 选择最多 5 条不同方向的新闻；不足时如实少报，不编造补齐。
- 保留原文链接、来源、发布时间和可识别的 RSS 图片链接。
- 可选调用 Gemini API 进行中文专业编辑；提示词强制区分新闻事实与编辑分析。
- 未配置 AI API 时使用透明的规则化技术提示，并在日报中明确标示限制。
- 使用网易 163 SMTP over TLS（smtp.163.com:465）发送 HTML 邮件。

## 手动预览测试

工作流支持代码变更触发、每日定时发送和手动触发。每日定时任务设为新加坡时间 08:07（UTC 00:07），定时事件使用 `send`；代码变更触发默认 `preview`，手动触发可选 `preview` 或 `send`。

1. 在仓库 **Settings → Secrets and variables → Actions → New repository secret** 添加以下机密：
   - `SMTP_USERNAME`：163 邮箱账号。
   - `SMTP_PASSWORD`：网易 163 SMTP 专用授权码，不是网页登录密码。
   - `REPORT_RECIPIENT`：日报收件邮箱。
2. 打开 **Actions → Daily hydrogen fuel-cell industry intelligence → Run workflow**。
3. 保持 mode = `preview`，运行后下载 `hydrogen-daily-report-preview` artifact 检查 HTML。
4. 确认收件人与正文正确后，再手动选择 `send` 测试发信。

不要将 SMTP 授权码写入仓库文件、Issues、日志或聊天内容。由于仓库目前是公开仓库，邮件地址和授权码均只通过 GitHub Actions Secrets 注入，不写入代码。

## 可选 AI 专业编辑

可选新增 `GEMINI_API_KEY` 仓库机密。默认模型为 `gemini-3.8-flash`，每天最多发起一次编辑请求。使用前请自行查看 Google 当前免费额度、速率限制、隐私及数据使用条款。该功能不使用 Google Search grounding。没有 API Key 时仍能运行，但不会声称完成了 AI 中文翻译或专业编辑。

## 正式定时发送

每日 08:07（新加坡时间）定时事件会自动生成并发送 HTML 日报。已通过手动 `send` 验收，SMTP 返回发送成功。任何代码变更触发的工作流仍保持 `preview`，不会因普通提交自动发邮件；手动运行可自行选择模式。GitHub 定时任务可能因平台负载延迟，不能保证精确到秒。

## 本地测试

无需第三方 Python 包：

`python -m unittest discover -s automation/hydrogen-daily -p "test_*.py" -v`

脚本只依赖 Python 标准库。
