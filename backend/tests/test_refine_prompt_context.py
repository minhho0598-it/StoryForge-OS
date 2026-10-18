import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from core.prompt_manager import prompt_manager
from services.llm_service import generate_text_xml_tags


class RefinePromptTests(unittest.TestCase):
    def test_new_refine_context_placeholders_are_rendered(self):
        values = {
            "chapter_draft_text": "Bản nháp chương",
            "story_bible_style_and_intimacy": "Chỉ dẫn phong cách",
            "heat_level": 3,
            "pov_instruction": "Ngôi thứ ba giới hạn",
            "pronoun_mapping": "An - Tôi/Anh",
            "memory_before_chapter": "Trí nhớ trước chương",
            "previous_chapter_ending": "Kết chương trước",
        }

        rendered_prompt = prompt_manager.load_prompt("refine_user.md", **values)

        self.assertNotIn("{{", rendered_prompt)
        for value in values.values():
            self.assertIn(str(value), rendered_prompt)


class GenerateTextXmlTagsTests(unittest.IsolatedAsyncioTestCase):
    async def test_extracts_multiple_xml_tags_from_one_response(self):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=(
                            "<pronoun_mapping>An - Tôi/Anh</pronoun_mapping>\n"
                            "<story_text>Nội dung chương</story_text>"
                        )
                    )
                )
            ]
        )
        with patch(
            "services.llm_service.client.chat.completions.create",
            new_callable=AsyncMock,
            return_value=response,
        ):
            result = await generate_text_xml_tags(
                "system",
                "user",
                ["story_text", "pronoun_mapping"],
            )

        self.assertEqual(result["story_text"], "Nội dung chương")
        self.assertEqual(result["pronoun_mapping"], "An - Tôi/Anh")

    async def test_missing_secondary_tag_does_not_replace_primary_output(self):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content="<story_text>Nội dung chương</story_text>"
                    )
                )
            ]
        )
        with patch(
            "services.llm_service.client.chat.completions.create",
            new_callable=AsyncMock,
            return_value=response,
        ):
            result = await generate_text_xml_tags(
                "system",
                "user",
                ["story_text", "pronoun_mapping"],
            )

        self.assertEqual(result, {
            "story_text": "Nội dung chương",
            "pronoun_mapping": "",
        })
