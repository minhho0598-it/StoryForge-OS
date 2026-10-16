import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from core.render_config import normalize_render_config
from services import video_service


class RenderConfigTests(unittest.TestCase):
    def test_legacy_intro_config_is_ignored(self):
        config = normalize_render_config(
            {
                "intro_video_path": "./old/intro.mp4",
                "main_video_path": "./assets/main.mp4",
            }
        )

        self.assertNotIn("intro_video_path", config)
        self.assertEqual(config["main_video_path"], "./assets/main.mp4")

    def test_invalid_render_mode_uses_default(self):
        config = normalize_render_config({"render_mode": []})

        self.assertEqual(config["render_mode"], "full")


class RenderInputValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = self.temp_dir.name
        self.background_folder = os.path.join(self.root, "backgrounds")
        os.makedirs(self.background_folder)
        self.background_video = os.path.join(self.background_folder, "background.mp4")
        self.main_video = os.path.join(self.root, "main.mp4")
        self.music_file = os.path.join(self.root, "music.wav")
        for path in (self.background_video, self.main_video, self.music_file):
            with open(path, "wb"):
                pass

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_full_mode_accepts_config_without_intro_asset(self):
        def probe(path):
            stream_type = "audio" if path == self.music_file else "video"
            return {
                "streams": [{"codec_type": stream_type, "duration": "10"}],
                "format": {"duration": "10"},
            }

        config = {
            "render_mode": "full",
            "background_folder_path": self.background_folder,
            "main_video_path": self.main_video,
        }

        with patch.object(video_service.ffmpeg, "probe", side_effect=probe):
            inventory = video_service.validate_render_inputs(config)

        self.assertEqual(inventory, [{"path": self.background_video, "duration": 10.0}])

    def test_simple_mode_requires_existing_music_when_enabled(self):
        config = {
            "render_mode": "simple",
            "background_folder_path": self.background_folder,
            "use_background_audio": True,
            "background_audio_path": os.path.join(self.root, "missing.wav"),
        }

        with patch.object(
            video_service.ffmpeg,
            "probe",
            return_value={
                "streams": [{"codec_type": "video", "duration": "10"}],
                "format": {"duration": "10"},
            },
        ):
            with self.assertRaisesRegex(ValueError, "Không tìm thấy file background audio"):
                video_service.validate_render_inputs(config)

    def test_simple_mode_does_not_require_main_video(self):
        config = {
            "render_mode": "simple",
            "background_folder_path": self.background_folder,
            "use_background_audio": False,
        }
        with patch.object(
            video_service.ffmpeg,
            "probe",
            return_value={
                "streams": [{"codec_type": "video", "duration": "10"}],
                "format": {"duration": "10"},
            },
        ):
            inventory = video_service.validate_render_inputs(config)

        self.assertEqual(len(inventory), 1)


class FullRenderCommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_mode_renders_main_as_first_video_without_intro(self):
        class SuccessfulProcess:
            returncode = 0

            async def communicate(self):
                return b"", b""

        with tempfile.TemporaryDirectory() as workspace:
            previous_directory = os.getcwd()
            try:
                os.chdir(workspace)
                main_video_path = os.path.join(workspace, "main.mp4")
                background_video_path = os.path.join(workspace, "background.mp4")
                config = {
                    "render_mode": "full",
                    "background_folder_path": workspace,
                    "main_video_path": main_video_path,
                    "overlay_x": 10,
                    "overlay_y": 20,
                    "overlay_w": 600,
                    "overlay_h": 1000,
                    "temp_base_path": os.path.join(workspace, "temp"),
                }
                subprocess_mock = AsyncMock(return_value=SuccessfulProcess())

                with patch.object(video_service.asyncio, "create_subprocess_exec", subprocess_mock):
                    await video_service.process_full_project_video(
                        project_id="test-project",
                        final_audio_path=os.path.join(workspace, "narration.m4a"),
                        audio_duration=3.0,
                        config=config,
                        background_inventory=[{"path": background_video_path, "duration": 5.0}],
                    )

                command = subprocess_mock.await_args.args
                self.assertNotIn("intro.mp4", command)
                main_input_index = command.index(main_video_path)
                self.assertEqual(command[main_input_index - 1], "-i")
                filter_complex = command[command.index("-filter_complex") + 1]
                self.assertNotIn("concat=n=2", filter_complex)
                self.assertIn("[content_video]", filter_complex)
            finally:
                os.chdir(previous_directory)


if __name__ == "__main__":
    unittest.main()
