"""配置文件"""
import os

# 自定义服务商 URL
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://ai.leihuo.netease.com/")

# 使用的模型
MODEL = "claude-opus-4-5-20251101"
