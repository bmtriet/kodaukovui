from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from google import genai
import openai


SOURCE_SEPARATOR = "\n\n---\nSource:\n"


def load_brain_context(user_data_dir: Path, bundle_dir: Path) -> str:
    brain_path = user_data_dir / "brain.md"
    if not brain_path.exists():
        brain_path = bundle_dir / "brain.md"
    if brain_path.exists():
        content = brain_path.read_text(encoding="utf-8").strip()
        marker = "[Nhập thông tin ngữ cảnh của bạn vào bên dưới dòng này]"
        if marker in content:
            content = content.split(marker)[-1].strip()
        if content:
            return f"[AI BRAIN CONTEXT]\n{content}\n[END CONTEXT]"
    return ""


def initialize_ai_clients(settings: dict[str, Any]):
    gemini_api_key = settings.get("GEMINI_API_KEY", "")
    openai_api_key = settings.get("OPENAI_API_KEY", "")
    openai_api_base = settings.get("OPENAI_API_BASE", "https://api.openai.com/v1")

    gemini_client = (
        genai.Client(api_key=gemini_api_key)
        if gemini_api_key and gemini_api_key != "your_gemini_token_here"
        else None
    )
    openai_client = (
        openai.OpenAI(api_key=openai_api_key, base_url=openai_api_base)
        if openai_api_key and openai_api_key != "your_openai_api_key_here"
        else None
    )
    return gemini_client, openai_client


def build_smart_action_prompt(brain_ctx: str, selected_text: str, action_prompt: str, extra_instruction: str = "") -> str:
    sections = []
    if brain_ctx.strip():
        sections.append(brain_ctx.strip())
    sections.append(action_prompt.strip())
    if extra_instruction.strip():
        sections.append(
            f"[ADDITIONAL USER INSTRUCTION]\n{extra_instruction.strip()}\n[END ADDITIONAL USER INSTRUCTION]"
        )
    sections.append(
        "Hãy làm theo đúng hướng dẫn ở trên. Nếu không có yêu cầu khác trong prompt, chỉ trả về kết quả cuối cùng."
    )
    sections.append(f"[SELECTED TEXT]\n{selected_text}\n[END SELECTED TEXT]")
    return "\n\n".join(section for section in sections if section)


def build_ai_prompt_first_turn(brain_ctx: str, selected_text: str, user_instruction: str) -> str:
    sections = []
    if brain_ctx.strip():
        sections.append(brain_ctx.strip())
    sections.append(
        "You are a helpful AI assistant. Use the selected text below as the core working context for the discussion. "
        "Answer the user's request directly and naturally."
    )
    sections.append(f"[SELECTED TEXT]\n{selected_text}\n[END SELECTED TEXT]")
    sections.append(f"[USER REQUEST]\n{user_instruction.strip()}\n[END USER REQUEST]")
    return "\n\n".join(section for section in sections if section)


def build_image_question_prompt(brain_ctx: str, question: str) -> str:
    sections = []
    if brain_ctx.strip():
        sections.append(brain_ctx.strip())
    sections.append(
        "Bạn là trợ lý AI phân tích hình ảnh. Hãy dùng cả ngữ cảnh hình ảnh, bố cục UI/screenshot và mọi chữ nhìn thấy trong ảnh để trả lời đúng câu hỏi của người dùng. "
        "Không chỉ chép lại hoặc dịch văn bản trong ảnh, trừ khi người dùng yêu cầu rõ như vậy."
    )
    sections.append(f"[USER QUESTION]\n{question.strip()}\n[END USER QUESTION]")
    return "\n\n".join(section for section in sections if section)


def _ensure_provider(settings: dict[str, Any], gemini_client, openai_client) -> None:
    if settings.get("AI_PROVIDER") == "openai" and openai_client:
        return
    if gemini_client:
        return
    raise RuntimeError("Chưa cấu hình AI provider/API key. Mở popup rồi bấm gear để vào Settings.")


def call_ai_with_text(settings: dict[str, Any], gemini_client, openai_client, prompt: str) -> str:
    _ensure_provider(settings, gemini_client, openai_client)

    if settings.get("AI_PROVIDER") == "openai" and openai_client:
        response = openai_client.chat.completions.create(
            model=settings["OPENAI_MODEL"],
            messages=[{"role": "user", "content": prompt}],
        )
        return (response.choices[0].message.content or "").strip()

    response = gemini_client.models.generate_content(
        model=settings["GEMINI_MODEL"],
        contents=prompt,
    )
    return (response.text or "").strip()


def call_ai_with_image(settings: dict[str, Any], gemini_client, openai_client, prompt: str, image_payload: dict[str, Any]) -> str:
    _ensure_provider(settings, gemini_client, openai_client)

    if settings.get("AI_PROVIDER") == "openai" and openai_client:
        data_url = (
            f"data:{image_payload['mime_type']};base64,"
            f"{base64.b64encode(image_payload['image_bytes']).decode('ascii')}"
        )
        response = openai_client.chat.completions.create(
            model=settings["OPENAI_MODEL"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        )
        return (response.choices[0].message.content or "").strip()

    image_part = genai.types.Part.from_bytes(
        data=image_payload["image_bytes"],
        mime_type=image_payload["mime_type"],
    )
    response = gemini_client.models.generate_content(
        model=settings["GEMINI_MODEL"],
        contents=[image_part, prompt],
    )
    return (response.text or "").strip()


def _openai_chat_messages(session: dict[str, Any], brain_ctx: str):
    messages = []
    if brain_ctx.strip():
        messages.append({"role": "system", "content": brain_ctx.strip()})

    if session["kind"] == "ai_prompt":
        messages.append(
            {
                "role": "system",
                "content": "Use the selected text as background context for the whole discussion.",
            }
        )
        messages.append(
            {
                "role": "system",
                "content": f"[SELECTED TEXT]\n{session['selected_text']}\n[END SELECTED TEXT]",
            }
        )

        for message in session["messages"]:
            messages.append({"role": message["role"], "content": message["content"]})
        return messages

    messages.append(
        {
            "role": "system",
            "content": (
                "The first user turn includes the reference image. Use that image as primary evidence for the whole thread. "
                "Answer the user's actual question about the screenshot or image. Do not merely transcribe or translate visible text "
                "unless the user explicitly asks for transcription or translation."
            ),
        }
    )
    data_url = (
        f"data:{session['image_payload']['mime_type']};base64,"
        f"{base64.b64encode(session['image_payload']['image_bytes']).decode('ascii')}"
    )
    first_user_added = False
    for message in session["messages"]:
        if message["role"] == "user" and not first_user_added:
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": message["content"]},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            )
            first_user_added = True
        else:
            messages.append({"role": message["role"], "content": message["content"]})
    return messages


def _gemini_chat_contents(session: dict[str, Any], brain_ctx: str):
    contents: list[Any] = []
    if brain_ctx.strip():
        contents.append({"role": "user", "parts": [{"text": brain_ctx.strip()}]})
    if session["kind"] == "ai_prompt":
        contents.append(
            {
                "role": "user",
                "parts": [{"text": f"[SELECTED TEXT]\n{session['selected_text']}\n[END SELECTED TEXT]"}],
            }
        )
        for message in session["messages"]:
            role = "model" if message["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
        return contents

    contents.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        "Use the reference image from the first turn as primary evidence for the whole discussion. "
                        "Answer the user's actual question about the screenshot or image. Do not merely transcribe or translate visible text "
                        "unless the user explicitly asks for that."
                    )
                }
            ],
        }
    )
    first_user_added = False
    image_part = genai.types.Part.from_bytes(
        data=session["image_payload"]["image_bytes"],
        mime_type=session["image_payload"]["mime_type"],
    )
    for message in session["messages"]:
        role = "model" if message["role"] == "assistant" else "user"
        if message["role"] == "user" and not first_user_added:
            contents.append({"role": role, "parts": [image_part, {"text": message["content"]}]})
            first_user_added = True
        else:
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
    return contents


def call_ai_chat_turn(
    settings: dict[str, Any],
    gemini_client,
    openai_client,
    session: dict[str, Any],
    brain_ctx: str,
) -> str:
    _ensure_provider(settings, gemini_client, openai_client)

    if settings.get("AI_PROVIDER") == "openai" and openai_client:
        response = openai_client.chat.completions.create(
            model=settings["OPENAI_MODEL"],
            messages=_openai_chat_messages(session, brain_ctx),
        )
        return (response.choices[0].message.content or "").strip()

    response = gemini_client.models.generate_content(
        model=settings["GEMINI_MODEL"],
        contents=_gemini_chat_contents(session, brain_ctx),
    )
    return (response.text or "").strip()
