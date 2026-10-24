import base64
import html
import io
import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont, ImageOps
from pydantic import BaseModel, Field, field_validator

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = BACKEND_ROOT / "data" / "output" / "thumbnails"
HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")

PALETTES = {
    "general": {
        "title": "#17233F",
        "accent": "#F5A000",
        "subtitle": "#17233F",
        "panel": "#FFFFFF",
    },
    "romance": {
        "title": "#8D203D",
        "accent": "#E9A0B2",
        "subtitle": "#4D2634",
        "panel": "#FFF7F8",
    },
    "healing": {
        "title": "#315C4B",
        "accent": "#D9A86C",
        "subtitle": "#30483F",
        "panel": "#F8F6EF",
    },
    "youth": {
        "title": "#172B56",
        "accent": "#FFAA16",
        "subtitle": "#172B56",
        "panel": "#FFFFFF",
    },
    "drama": {
        "title": "#181818",
        "accent": "#A51D2D",
        "subtitle": "#181818",
        "panel": "#FFFFFF",
    },
    "mystery": {
        "title": "#292345",
        "accent": "#8B6AD9",
        "subtitle": "#292345",
        "panel": "#F7F4FF",
    },
    "fantasy": {
        "title": "#28214A",
        "accent": "#B89A52",
        "subtitle": "#28214A",
        "panel": "#FBF8EE",
    },
}


class ThumbnailBox(BaseModel):
    x: int
    y: int
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class ThumbnailCanvas(BaseModel):
    width: int = Field(default=1280, gt=0)
    height: int = Field(default=720, gt=0)


class ThumbnailCharacter(BaseModel):
    path: str
    mode: Literal["auto", "transparent", "photo"] = "auto"
    remove_background: bool = False
    fit: Literal["contain", "cover"] = "contain"
    box: ThumbnailBox
    anchor: Literal["center", "top", "bottom"] = "center"


class ThumbnailContent(BaseModel):
    channel_name: str = ""
    title: str
    subtitle: str = ""
    author: str = ""

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content.title must not be blank")
        return value


class ThumbnailOutline(BaseModel):
    enabled: bool = False
    color: str = "#FFFFFF"
    width: float = 2


class ThumbnailStyle(BaseModel):
    genre: str = "general"
    mood: list[str] = Field(default_factory=list)
    color_mode: Literal["ai", "rules", "manual"] = "rules"
    font_path: str | None = None
    font_family: str = "DejaVu Sans"
    title_box: ThumbnailBox
    subtitle_box: ThumbnailBox | None = None
    channel_box: ThumbnailBox | None = None
    title_font_size: int = 64
    title_min_font_size: int = 34
    subtitle_font_size: int = 27
    subtitle_min_font_size: int = 18
    channel_font_size: int = 26
    title_line_colors: list[str] = Field(default_factory=list)
    title_alignment: Literal["left", "center", "right"] = "center"
    subtitle_alignment: Literal["left", "center", "right"] = "center"
    outline: ThumbnailOutline = Field(default_factory=ThumbnailOutline)
    safe_margin: int = 24
    manual_palette: dict[str, str] = Field(default_factory=dict)


class ThumbnailOutput(BaseModel):
    width: int = Field(default=1280, gt=0)
    height: int = Field(default=720, gt=0)
    format: Literal["png"] = "png"


class ThumbnailJob(BaseModel):
    job_id: str
    canvas: ThumbnailCanvas = Field(default_factory=ThumbnailCanvas)
    background: str
    character: ThumbnailCharacter
    content: ThumbnailContent
    style: ThumbnailStyle
    output: ThumbnailOutput = Field(default_factory=ThumbnailOutput)


def _resolve_resource(path: str, label: str) -> Path:
    resource_path = Path(path)
    if resource_path.is_absolute():
        raise ValueError(f"{label} path must be relative to the backend directory")

    backend_root = BACKEND_ROOT.resolve()
    resolved_path = (backend_root / resource_path).resolve()
    try:
        resolved_path.relative_to(backend_root)
    except ValueError as exc:
        raise ValueError(f"{label} path must stay inside the backend directory") from exc

    if not resolved_path.is_file():
        raise ValueError(f"{label} file not found: {path}")
    return resolved_path


def resolve_job_resources(job: ThumbnailJob) -> ThumbnailJob:
    background_path = _resolve_resource(job.background, "Background")
    character_path = _resolve_resource(job.character.path, "Character")
    font_path = (
        _resolve_resource(job.style.font_path, "Font")
        if job.style.font_path
        else None
    )
    return job.model_copy(
        update={
            "background": str(background_path),
            "character": job.character.model_copy(update={"path": str(character_path)}),
            "style": job.style.model_copy(
                update={"font_path": str(font_path) if font_path else None}
            ),
        }
    )


def validate_thumbnail_job(job: ThumbnailJob) -> tuple[ThumbnailJob, list[str]]:
    resolved_job = resolve_job_resources(job)
    errors = []
    boxes = (
        ("character", resolved_job.character.box),
        ("title", resolved_job.style.title_box),
        ("subtitle", resolved_job.style.subtitle_box),
        ("channel", resolved_job.style.channel_box),
    )
    for name, box in boxes:
        if box and (
            box.x < 0
            or box.y < 0
            or box.x + box.width > resolved_job.output.width
            or box.y + box.height > resolved_job.output.height
        ):
            errors.append(f"{name} box exceeds canvas")
    return resolved_job, errors


def _output_path(job_id: str) -> Path:
    output_root = OUTPUT_ROOT.resolve()
    try:
        output_root.relative_to(BACKEND_ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError(
            "Thumbnail output directory must stay inside the backend directory"
        ) from exc

    output_path = output_root / f"{job_id}.png"
    for artifact_path in (
        output_path,
        output_path.with_suffix(".svg"),
        output_path.with_suffix(".qa.json"),
    ):
        try:
            artifact_path.resolve().relative_to(output_root)
        except ValueError as exc:
            raise RuntimeError(
                "Thumbnail output files must stay inside the output directory"
            ) from exc
    return output_path


def thumbnail_artifact_path(job_id: str, artifact: Literal["image", "svg", "qa"]) -> Path:
    suffix = {"image": ".png", "svg": ".svg", "qa": ".qa.json"}[artifact]
    output_root = OUTPUT_ROOT.resolve()
    path = _output_path(job_id).with_suffix(suffix).resolve()
    try:
        path.relative_to(output_root)
    except ValueError as exc:
        raise FileNotFoundError("Thumbnail artifact not found") from exc
    if not path.is_file():
        raise FileNotFoundError("Thumbnail artifact not found")
    return path


def _valid_hex(value: object) -> bool:
    return isinstance(value, str) and bool(HEX_COLOR.fullmatch(value))


def _fallback_palette(genre: str = "general", mood: list[str] | None = None) -> dict[str, str]:
    palette = dict(PALETTES.get((genre or "general").lower(), PALETTES["general"]))
    mood_text = " ".join(mood or []).lower()
    if any(keyword in mood_text for keyword in ("u ám", "bi kịch", "dark")):
        palette["title"], palette["accent"] = "#211B2D", "#9F2638"
    return palette


def _extract_json_object(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI response is not JSON")
    return json.loads(text[start : end + 1])


def _ai_palette(title: str, genre: str, mood: list[str]) -> dict[str, str]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not configured")
    from openai import OpenAI

    prompt = {
        "title": title,
        "genre": genre,
        "mood": mood,
        "task": (
            "Choose a readable restrained palette for a Vietnamese audio-story "
            "thumbnail on a light paper background. Do not redesign the background. "
            "Return JSON only: title, accent, subtitle, panel, each a six-digit HEX."
        ),
    }
    client = OpenAI()
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        temperature=0.3,
        messages=[
            {
                "role": "system",
                "content": "You are a thumbnail color art director. Return valid JSON only.",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
    )
    palette = _extract_json_object(response.choices[0].message.content or "")
    keys = ("title", "accent", "subtitle", "panel")
    if any(not _valid_hex(palette.get(key)) for key in keys):
        raise ValueError("Invalid HEX from AI")
    return {key: palette[key].upper() for key in keys}


def _choose_palette(style: ThumbnailStyle, content: ThumbnailContent) -> tuple[dict[str, str], str]:
    if style.color_mode == "manual" and style.manual_palette:
        palette = _fallback_palette(style.genre, style.mood)
        palette.update(style.manual_palette)
        if all(_valid_hex(value) for value in palette.values()):
            return palette, "manual"
    if style.color_mode == "ai":
        try:
            return _ai_palette(content.title, style.genre, style.mood), "ai"
        except Exception as exc:
            return _fallback_palette(style.genre, style.mood), f"fallback:{type(exc).__name__}"
    return _fallback_palette(style.genre, style.mood), "rules"


def _normalize_text(text: str) -> str:
    return unicodedata.normalize("NFC", text or "")


def _load_font(path: str | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path:
        return ImageFont.truetype(path, size=size)
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def _wrap_words(text: str, font: ImageFont.FreeTypeFont | ImageFont.ImageFont, max_width: int) -> list[str]:
    words = re.split(r"\s+", _normalize_text(text).strip())
    if not words or words == [""]:
        return []
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if font.getlength(candidate) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _fit_text(
    text: str,
    font_path: str | None,
    max_width: int,
    max_height: int,
    start_size: int,
    min_size: int,
    line_spacing: float = 1.06,
) -> dict:
    for size in range(start_size, min_size - 1, -1):
        font = _load_font(font_path, size)
        lines = _wrap_words(text, font, max_width)
        ascent, descent = font.getmetrics()
        line_height = (ascent + descent) * line_spacing
        if (
            lines
            and all(font.getlength(line) <= max_width for line in lines)
            and line_height * len(lines) <= max_height
        ):
            return {
                "font": font,
                "font_size": size,
                "lines": lines,
                "line_height": line_height,
                "overflow": False,
            }
    font = _load_font(font_path, min_size)
    lines = _wrap_words(text, font, max_width)
    ascent, descent = font.getmetrics()
    return {
        "font": font,
        "font_size": min_size,
        "lines": lines,
        "line_height": (ascent + descent) * line_spacing,
        "overflow": True,
    }


def _remove_background(image: Image.Image, enabled: bool) -> Image.Image:
    if not enabled:
        return image
    try:
        from rembg import remove
    except ImportError as exc:
        raise RuntimeError(
            "Background removal is enabled but rembg is not installed"
        ) from exc
    result = remove(image)
    if isinstance(result, bytes):
        return Image.open(io.BytesIO(result)).convert("RGBA")
    return result.convert("RGBA")


def _fit_character(
    image: Image.Image,
    box: ThumbnailBox,
    fit: Literal["contain", "cover"],
    anchor: Literal["center", "top", "bottom"],
) -> tuple[Image.Image, dict[str, int]]:
    image = image.convert("RGBA")
    box_width, box_height = box.width, box.height
    scale = (
        max(box_width / image.width, box_height / image.height)
        if fit == "cover"
        else min(box_width / image.width, box_height / image.height)
    )
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    if fit == "cover":
        top = (
            0
            if anchor == "top"
            else max(0, height - box_height)
            if anchor == "bottom"
            else max(0, (height - box_height) // 2)
        )
        left = max(0, (width - box_width) // 2)
        return image.crop((left, top, left + box_width, top + box_height)), {
            "x": box.x,
            "y": box.y,
            "width": box_width,
            "height": box_height,
        }
    return image, {
        "x": box.x + max(0, (box_width - width) // 2),
        "y": box.y + max(0, (box_height - height) // 2),
        "width": width,
        "height": height,
    }


def _text_element(
    text: str,
    x: int,
    y: int,
    font_family: str,
    size: int,
    color: str,
    anchor: str,
    outline: ThumbnailOutline | None = None,
) -> str:
    extra = ""
    if outline and outline.enabled:
        extra = (
            f' stroke="{outline.color}" stroke-width="{outline.width}"'
            ' stroke-linejoin="round" paint-order="stroke fill"'
        )
    return (
        f'<text x="{x}" y="{y}" font-family="{html.escape(font_family, quote=True)}" '
        f'font-size="{size}" font-weight="900" fill="{color}" text-anchor="{anchor}"'
        f'{extra}>{html.escape(str(text), quote=True)}</text>'
    )


def _render_svg(
    width: int,
    height: int,
    character: Image.Image,
    character_position: dict[str, int],
    title_info: dict,
    subtitle_info: dict | None,
    channel_info: dict | None,
    style: ThumbnailStyle,
    palette: dict[str, str],
) -> str:
    image_buffer = io.BytesIO()
    character.save(image_buffer, format="PNG")
    image_data = base64.b64encode(image_buffer.getvalue()).decode()
    elements = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}">'
        ),
        (
            f'<image x="{character_position["x"]}" y="{character_position["y"]}" '
            f'width="{character_position["width"]}" height="{character_position["height"]}" '
            f'href="data:image/png;base64,{image_data}"/>'
        ),
    ]

    def add_text(
        info: dict | None,
        box: ThumbnailBox | None,
        color: str,
        alignment: Literal["left", "center", "right"] = "center",
        is_title: bool = False,
    ) -> None:
        if not info or not box:
            return
        anchor = {"left": "start", "center": "middle", "right": "end"}[alignment]
        x = box.x if anchor == "start" else box.x + box.width if anchor == "end" else box.x + box.width / 2
        ascent, _ = info["font"].getmetrics()
        total = info["line_height"] * len(info["lines"])
        baseline = box.y + max(ascent, (box.height - total) / 2 + ascent)
        for index, line in enumerate(info["lines"]):
            line_color = (
                style.title_line_colors[index % len(style.title_line_colors)]
                if is_title and style.title_line_colors
                else color
            )
            elements.append(
                _text_element(
                    line,
                    round(x),
                    round(baseline + index * info["line_height"]),
                    style.font_family,
                    info["font_size"],
                    line_color,
                    anchor,
                    style.outline if is_title else None,
                )
            )

    add_text(title_info, style.title_box, palette["title"], style.title_alignment, True)
    add_text(subtitle_info, style.subtitle_box, palette["subtitle"], style.subtitle_alignment)
    add_text(channel_info, style.channel_box, palette["subtitle"])
    elements.append("</svg>")
    return "\n".join(elements)


def _render_image(job: ThumbnailJob, output_path: Path) -> dict:
    background_path = Path(job.background)
    character_path = Path(job.character.path)
    background = Image.open(background_path).convert("RGBA")
    target_size = (job.output.width, job.output.height)
    if background.size != target_size:
        background = ImageOps.fit(
            background, target_size, method=Image.Resampling.LANCZOS
        )
    character = _remove_background(
        Image.open(character_path).convert("RGBA"),
        job.character.remove_background,
    )
    fitted_character, character_position = _fit_character(
        character, job.character.box, job.character.fit, job.character.anchor
    )
    palette, palette_source = _choose_palette(job.style, job.content)
    title_info = _fit_text(
        job.content.title,
        job.style.font_path,
        job.style.title_box.width,
        job.style.title_box.height,
        job.style.title_font_size,
        job.style.title_min_font_size,
    )
    subtitle_info = None
    if job.content.subtitle and job.style.subtitle_box:
        subtitle_info = _fit_text(
            job.content.subtitle,
            job.style.font_path,
            job.style.subtitle_box.width,
            job.style.subtitle_box.height,
            job.style.subtitle_font_size,
            job.style.subtitle_min_font_size,
        )
    channel_info = None
    if job.content.channel_name and job.style.channel_box:
        channel_info = _fit_text(
            job.content.channel_name,
            job.style.font_path,
            job.style.channel_box.width,
            job.style.channel_box.height,
            job.style.channel_font_size,
            max(12, job.style.channel_font_size - 8),
        )

    font_name = title_info["font"].getname()[0] or job.style.font_family
    svg = _render_svg(
        *target_size,
        fitted_character,
        character_position,
        title_info,
        subtitle_info,
        channel_info,
        job.style.model_copy(update={"font_family": font_name}),
        palette,
    )
    output_image = background.copy()
    output_image.alpha_composite(
        fitted_character,
        (character_position["x"], character_position["y"]),
    )
    draw = ImageDraw.Draw(output_image)

    def draw_text(
        info: dict | None,
        box: ThumbnailBox | None,
        color: str,
        alignment: Literal["left", "center", "right"] = "center",
        is_title: bool = False,
    ) -> None:
        if not info or not box:
            return
        anchor = {"left": "ls", "center": "ms", "right": "rs"}[alignment]
        x = (
            box.x
            if alignment == "left"
            else box.x + box.width
            if alignment == "right"
            else box.x + box.width / 2
        )
        ascent, _ = info["font"].getmetrics()
        total = info["line_height"] * len(info["lines"])
        baseline = box.y + max(ascent, (box.height - total) / 2 + ascent)
        outline_width = (
            max(1, round(job.style.outline.width))
            if is_title and job.style.outline.enabled
            else 0
        )
        for index, line in enumerate(info["lines"]):
            line_color = (
                job.style.title_line_colors[index % len(job.style.title_line_colors)]
                if is_title and job.style.title_line_colors
                else color
            )
            draw.text(
                (round(x), round(baseline + index * info["line_height"])),
                line,
                font=info["font"],
                fill=line_color,
                anchor=anchor,
                stroke_width=outline_width,
                stroke_fill=job.style.outline.color if outline_width else None,
            )

    draw_text(
        title_info,
        job.style.title_box,
        palette["title"],
        job.style.title_alignment,
        True,
    )
    draw_text(
        subtitle_info,
        job.style.subtitle_box,
        palette["subtitle"],
        job.style.subtitle_alignment,
    )
    draw_text(
        channel_info,
        job.style.channel_box,
        palette["subtitle"],
    )

    output_image = output_image.convert("RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_image.save(output_path, "PNG", optimize=True)
    svg_path = output_path.with_suffix(".svg")
    svg_path.write_text(svg, encoding="utf-8")
    return {
        "image": str(output_path),
        "svg": str(svg_path),
        "palette": palette,
        "palette_source": palette_source,
        "title_font_size": title_info["font_size"],
        "font_name": font_name,
        "title_lines": title_info["lines"],
        "title_overflow": title_info["overflow"],
        "subtitle_overflow": bool(subtitle_info and subtitle_info["overflow"]),
        "canvas": {"width": target_size[0], "height": target_size[1]},
    }


def render_thumbnail(job: ThumbnailJob) -> dict:
    resolved_job, errors = validate_thumbnail_job(job)
    if errors:
        return {"job_id": job.job_id, "status": "failed", "errors": errors}

    output_path = _output_path(job.job_id)
    result = _render_image(resolved_job, output_path)
    status = (
        "needs_review"
        if result["title_overflow"] or result["subtitle_overflow"]
        else "pass"
    )
    report = {
        "job_id": job.job_id,
        "status": status,
        "checks": {
            "input_files": "pass",
            "canvas_size": "pass",
            "title_overflow": "fail" if result["title_overflow"] else "pass",
            "subtitle_overflow": "fail" if result["subtitle_overflow"] else "pass",
            "palette_source": result["palette_source"],
        },
        "errors": [],
        "warnings": [
            "Review at thumbnail size before production.",
            "Adjust character/title boxes to match the fixed template.",
        ],
        "render": result,
    }
    output_path.with_suffix(".qa.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report
