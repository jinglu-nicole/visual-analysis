"""
[WHO]: 提供 ANTHROPIC_BASE_URL, MODEL 两个配置常量
[FROM]: 依赖 os.environ 读取环境变量
[TO]: 被 analyzer.py, app.py, server.py 引用
[HERE]: 项目根目录 config.py — 全局配置；修改模型或服务商 URL 在此处
"""
import os

# 自定义服务商 URL
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://ai.leihuo.netease.com/")

# 使用的模型
MODEL = "claude-opus-4-5-20251101"
