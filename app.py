"""
[WHO]: 提供 create_interface() Gradio 界面工厂, split_output() 输出拆分, filter_analysis() 严重度筛选
[FROM]: 依赖 analyzer.compare_images 执行图片分析, config.ANTHROPIC_BASE_URL 获取默认 URL
[TO]: 作为 Gradio 模式独立入口运行（python app.py）
[HERE]: 项目根目录 app.py — Gradio UI 入口；与 server.py 为并列的两种 UI 模式
"""
import re
import gradio as gr
from analyzer import compare_images
from config import ANTHROPIC_BASE_URL


def split_output(text):
    """将模型输出拆分为组件树和问题清单两部分"""
    tree_match = re.search(r'(## 组件树.*?)(?=## 问题清单)', text, re.DOTALL)
    tree = tree_match.group(1).strip() if tree_match else "（未识别到组件树）"

    analysis_match = re.search(r'(## 问题清单.*)', text, re.DOTALL)
    analysis = analysis_match.group(1).strip() if analysis_match else text.strip()

    analysis = re.sub(r'\n([🔴🟡🟢])', r'\n\n\1', analysis)
    analysis = re.sub(r'([🔴🟡🟢].+)\n([🔴🟡🟢])', r'\1\n\n\2', analysis)

    return tree, analysis


def filter_analysis(analysis_full, filters):
    """根据选中的严重程度筛选问题清单"""
    if not analysis_full or analysis_full == "*等待分析...*":
        return analysis_full

    emoji_map = {"🔴 高": "🔴", "🟡 中": "🟡", "🟢 低": "🟢"}
    selected = {emoji_map[f] for f in filters} if filters else set(emoji_map.values())

    lines = analysis_full.split('\n')
    result = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(('🔴', '🟡', '🟢')):
            if any(stripped.startswith(e) for e in selected):
                result.append(line)
        else:
            result.append(line)
    return '\n'.join(result)


def analyze_images(api_key_hidden, api_key_visible, base_url, thinking_budget, canvas_width, canvas_height, art_image, game_image):
    api_key = api_key_hidden or api_key_visible
    if not api_key or not api_key.strip():
        return "❌ 请填入你的 API Key", "", ""

    if art_image is None or game_image is None:
        return "❌ 请上传两张图片", "", ""

    try:
        result = compare_images(
            art_image, game_image,
            api_key.strip(), base_url,
            thinking_budget,
            int(canvas_width), int(canvas_height),
        )
        tree, analysis = split_output(result)
        return tree, analysis, analysis  # 第三个值存入 State
    except Exception as e:
        err = f"❌ 分析失败：{str(e)}"
        return err, "", ""


def toggle_key_visibility(is_visible, hidden_val, visible_val):
    val = visible_val if is_visible else hidden_val
    if is_visible:
        return (
            gr.update(visible=True, value=val),
            gr.update(visible=False, value=val),
            False,
            "👁 查看",
        )
    else:
        return (
            gr.update(visible=False, value=val),
            gr.update(visible=True, value=val),
            True,
            "🙈 隐藏",
        )


CSS = """
@keyframes spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
button.analyzing { position: relative; }
button.analyzing::before {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.5);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
}
"""

JS = """
() => {
    setTimeout(() => {
        let hoveredInput = null;

        function attachHoverListeners() {
            document.querySelectorAll('input[type="file"]').forEach(input => {
                const container = input.closest('.upload-container, label, [class*="upload"]') || input.parentElement;
                if (container && !container._hoverBound) {
                    container._hoverBound = true;
                    container.addEventListener('mouseenter', () => { hoveredInput = input; });
                }
            });
        }

        attachHoverListeners();
        new MutationObserver(attachHoverListeners).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('paste', (e) => {
            const items = [...(e.clipboardData?.items || [])];
            const imgItem = items.find(i => i.type.startsWith('image/'));
            if (!imgItem || !hoveredInput) return;
            e.preventDefault();
            const file = imgItem.getAsFile();
            const dt = new DataTransfer();
            dt.items.add(file);
            hoveredInput.files = dt.files;
            hoveredInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }, 2000);
}
"""


def create_interface():
    with gr.Blocks(title="游戏美术效果对比工具", css=CSS, js=JS) as app:
        gr.Markdown("# 🎮 游戏美术效果对比工具\n上传美术效果图和游戏实机截图，AI 会分析两者的差距并给出改进建议。")

        # API Key + 服务商 URL 同行
        with gr.Row():
            with gr.Column(scale=5):
                api_key_hidden = gr.Textbox(
                    label="API Key",
                    placeholder="sk-...",
                    type="password",
                    visible=True,
                )
                api_key_visible = gr.Textbox(
                    label="API Key",
                    placeholder="sk-...",
                    type="text",
                    visible=False,
                )
            with gr.Column(scale=1, min_width=80):
                gr.Markdown("<br>")
                toggle_btn = gr.Button("👁 查看", size="sm")
            with gr.Column(scale=4):
                base_url_input = gr.Textbox(
                    label="服务商 URL",
                    value=ANTHROPIC_BASE_URL,
                )

        key_visible_state = gr.State(False)
        toggle_btn.click(
            fn=toggle_key_visibility,
            inputs=[key_visible_state, api_key_hidden, api_key_visible],
            outputs=[api_key_hidden, api_key_visible, key_visible_state, toggle_btn],
        )

        with gr.Row():
            with gr.Column(scale=2):
                thinking_budget_input = gr.Slider(
                    label="Thinking 预算上限（美元，$3/M tokens）",
                    minimum=0.01,
                    maximum=0.18,
                    value=0.18,
                    step=0.01,
                    info="最大 $0.18（约 59,904 tokens）",
                )
            with gr.Column(scale=1):
                canvas_width_input = gr.Number(
                    label="画布宽度（px）",
                    value=2100,
                    precision=0,
                )
            with gr.Column(scale=1):
                canvas_height_input = gr.Number(
                    label="画布高度（px）",
                    value=1080,
                    precision=0,
                )

        # 图片上传区
        with gr.Row():
            with gr.Column():
                gr.Markdown("### 🎨 美术效果图（目标）")
                art_input = gr.Image(
                    label="上传美术效果图",
                    type="filepath",
                    height=600,
                    sources=["upload"],
                )

            with gr.Column():
                gr.Markdown("### 🖥️ 游戏实机截图（实际）")
                game_input = gr.Image(
                    label="上传游戏截图",
                    type="filepath",
                    height=600,
                    sources=["upload"],
                )

        analyze_btn = gr.Button("🔍 开始对比分析", variant="primary", size="lg")

        gr.Markdown("### 📊 分析报告")

        # 存储完整分析文本的 State
        analysis_state = gr.State("")

        with gr.Row():
            with gr.Column(scale=1):
                tree_output = gr.Markdown(label="组件树", value="*等待分析...*")
            with gr.Column(scale=3):
                with gr.Row():
                    severity_filter = gr.CheckboxGroup(
                        choices=["🔴 高", "🟡 中", "🟢 低"],
                        value=["🔴 高", "🟡 中", "🟢 低"],
                        label="筛选严重程度",
                        visible=False,
                    )
                analysis_output = gr.Markdown(label="问题清单", value="*等待分析...*")

        analyze_btn.click(
            fn=lambda: (
                gr.update(value="⟳ 分析中...", interactive=False, elem_classes=["analyzing"]),
                gr.update(visible=False),
                "",
            ),
            outputs=[analyze_btn, severity_filter, analysis_state],
        ).then(
            fn=analyze_images,
            inputs=[api_key_hidden, api_key_visible, base_url_input, thinking_budget_input, canvas_width_input, canvas_height_input, art_input, game_input],
            outputs=[tree_output, analysis_output, analysis_state],
        ).then(
            fn=lambda: (
                gr.update(value="🔍 开始对比分析", interactive=True, elem_classes=[]),
                gr.update(visible=True, value=["🔴 高", "🟡 中", "🟢 低"]),
            ),
            outputs=[analyze_btn, severity_filter],
        )

        severity_filter.change(
            fn=filter_analysis,
            inputs=[analysis_state, severity_filter],
            outputs=analysis_output,
        )

        gr.Markdown("---\n**使用说明：**\n1. 填入你的 API Key\n2. 上传两张图片\n3. 点击『开始对比分析』，等待报告")

    return app


if __name__ == "__main__":
    app = create_interface()
    app.launch(
        server_name="0.0.0.0",
    )
