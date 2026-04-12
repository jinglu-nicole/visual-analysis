"""
[WHO]: 提供 image_to_base64(), get_image_media_type(), extract_dominant_colors() 三个图像工具函数
[FROM]: 依赖 Pillow (PIL) 进行图像量化与主色提取, base64/pathlib 做编码与路径处理
[TO]: 被 analyzer.py 调用进行图像预处理
[HERE]: 项目根目录 utils.py — 图像处理工具集；为 analyzer.py 提供 base64 编码和颜色分析
"""
import base64
from pathlib import Path
from PIL import Image


def image_to_base64(image_path: str) -> str:
    """将图片文件转换为 base64 字符串"""
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def get_image_media_type(file_path: str) -> str:
    """根据文件扩展名返回 media type"""
    suffix = Path(file_path).suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return media_types.get(suffix, "image/jpeg")


def extract_dominant_colors(image_path: str, n: int = 12) -> str:
    """提取图片主色调，返回 hex 列表字符串，辅助模型做颜色参考"""
    img = Image.open(image_path).convert("RGB")
    img = img.resize((120, 120), Image.LANCZOS)
    quantized = img.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    colors = []
    for i in range(n):
        r, g, b = palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]
        colors.append(f"#{r:02X}{g:02X}{b:02X}")
    return "、".join(colors)
