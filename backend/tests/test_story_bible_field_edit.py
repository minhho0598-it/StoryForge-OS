import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers.projects import (
    _get_bible_field_value,
    _validate_bible_field_edit_response,
    edit_story_bible_field,
)
from schemas import StoryBibleEditableField, StoryBibleFieldEditRequest


class StoryBibleFieldPathTests(unittest.TestCase):
    def setUp(self):
        self.story_bible = {
            "characters": [
                {"name": "Mai", "habits": ["đọc sách"]},
            ],
            "story_identity": {"central_theme": "niềm tin"},
        }

    def test_reads_nested_fields_and_array_fields(self):
        self.assertEqual(
            _get_bible_field_value(self.story_bible, ["characters", 0, "name"]),
            "Mai",
        )
        self.assertEqual(
            _get_bible_field_value(self.story_bible, ["characters", 0, "habits"]),
            ["đọc sách"],
        )

    def test_rejects_missing_and_container_paths(self):
        with self.assertRaises(ValueError):
            _get_bible_field_value(self.story_bible, ["characters", 1, "name"])
        with self.assertRaisesRegex(ValueError, "nhóm field"):
            _get_bible_field_value(self.story_bible, ["characters", 0])


class StoryBibleFieldEditResponseTests(unittest.TestCase):
    def setUp(self):
        self.request = StoryBibleFieldEditRequest(
            current_bible={
                "story_identity": {
                    "central_theme": "niềm tin",
                    "core_premise": "Một lời hứa cũ",
                },
                "characters": [{"motivation": "tìm sự thật"}],
            },
            field_path=["story_identity", "central_theme"],
            field_label="Chủ đề trung tâm",
            field_type="string",
            user_prompt="Làm rõ chủ đề về lòng tin.",
            editable_fields=[
                StoryBibleEditableField(
                    path=["story_identity", "central_theme"],
                    label="Chủ đề trung tâm",
                    field_type="string",
                ),
                StoryBibleEditableField(
                    path=["story_identity", "core_premise"],
                    label="Tiền đề",
                    field_type="string",
                ),
                StoryBibleEditableField(
                    path=["characters", 0, "motivation"],
                    label="Động lực",
                    field_type="string",
                ),
            ],
        )

    def test_accepts_primary_and_related_field_proposals(self):
        result = _validate_bible_field_edit_response(
            {
                "field_value": "Niềm tin cần được chứng minh bằng hành động.",
                "related_changes": [
                    {
                        "path": ["story_identity", "core_premise"],
                        "value": "Một lời hứa cũ buộc hai người phải đối diện sự thật.",
                        "reason": "Làm tiền đề thể hiện rõ chủ đề mới.",
                    },
                ],
            },
            self.request,
        )

        self.assertEqual(result["field_value"], "Niềm tin cần được chứng minh bằng hành động.")
        self.assertEqual(len(result["related_changes"]), 1)

    def test_rejects_path_to_unknown_field(self):
        with self.assertRaisesRegex(ValueError, "không nằm"):
            _validate_bible_field_edit_response(
                {
                    "field_value": "Chủ đề mới",
                    "related_changes": [
                        {
                            "path": ["story_identity", "new_hidden_field"],
                            "value": "Không hợp lệ",
                            "reason": "Field không tồn tại.",
                        },
                    ],
                },
                self.request,
            )

    def test_accepts_a_missing_leaf_in_an_existing_nested_object(self):
        value = _get_bible_field_value(
            self.request.current_bible,
            ["characters", 0, "personality", "strength"],
            allow_missing_leaf=True,
        )

        self.assertIsNotNone(value)

    def test_rejects_changes_with_wrong_types_or_duplicate_paths(self):
        with self.assertRaisesRegex(ValueError, "không đúng kiểu"):
            _validate_bible_field_edit_response(
                {"field_value": ["Sai kiểu"], "related_changes": []},
                self.request,
            )
        with self.assertRaisesRegex(ValueError, "bị trùng"):
            _validate_bible_field_edit_response(
                {
                    "field_value": "Chủ đề mới",
                    "related_changes": [
                        {
                            "path": ["story_identity", "central_theme"],
                            "value": "Trùng field",
                            "reason": "Không hợp lệ.",
                        },
                    ],
                },
                self.request,
            )


class StoryBibleFieldEditEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_validated_proposals_without_persisting(self):
        request = StoryBibleFieldEditRequest(
            current_bible={"story_identity": {"central_theme": "niềm tin"}},
            field_path=["story_identity", "central_theme"],
            field_label="Chủ đề trung tâm",
            field_type="string",
            user_prompt="Nhấn mạnh lòng tin.",
            editable_fields=[
                StoryBibleEditableField(
                    path=["story_identity", "central_theme"],
                    label="Chủ đề trung tâm",
                    field_type="string",
                ),
            ],
        )
        with patch(
            "routers.projects.generate_json",
            new_callable=AsyncMock,
            return_value={"field_value": "Lòng tin phải được lựa chọn.", "related_changes": []},
        ), patch("routers.projects.supabase.table") as table:
            result = await edit_story_bible_field("project-id", request)

        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["field_value"], "Lòng tin phải được lựa chọn.")
        table.assert_not_called()

    async def test_invalid_model_response_surfaces_as_gateway_error(self):
        request = StoryBibleFieldEditRequest(
            current_bible={"story_identity": {"central_theme": "niềm tin"}},
            field_path=["story_identity", "central_theme"],
            field_label="Chủ đề trung tâm",
            field_type="string",
            user_prompt="Nhấn mạnh lòng tin.",
            editable_fields=[
                StoryBibleEditableField(
                    path=["story_identity", "central_theme"],
                    label="Chủ đề trung tâm",
                    field_type="string",
                ),
            ],
        )
        with patch(
            "routers.projects.generate_json",
            new_callable=AsyncMock,
            return_value={"field_value": {}, "related_changes": []},
        ):
            with self.assertRaises(HTTPException) as error:
                await edit_story_bible_field("project-id", request)

        self.assertEqual(error.exception.status_code, 502)
