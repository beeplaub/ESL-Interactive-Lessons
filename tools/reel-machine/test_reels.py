"""Small boundary checks; real batch generation verifies voice and video integration."""
import copy
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import reels


class ReelChecks(unittest.TestCase):
    def setUp(self):
        self.script = {'title':'Test', 'scenes':[
            {'narration':'The quiet traveler found a little door under the bridge.',
             'caption':'A small door', 'image_prompt':'A door under a bridge'} for _ in range(4)]}

    def test_reject_missing_scene(self):
        script=copy.deepcopy(self.script)
        script['scenes']=[]
        with self.assertRaises(ValueError):
            reels.validate(script)

    def test_reject_empty_audio_text(self):
        script=copy.deepcopy(self.script)
        script['scenes'][0]['narration']=''
        with self.assertRaises(ValueError):
            reels.validate(script)

    def test_caption_boundary_and_render(self):
        with tempfile.TemporaryDirectory() as folder:
            background=Path(folder)/'bg.png'
            rendered=Path(folder)/'frame.png'
            reels.artwork(background,19)
            reels.frame(background,rendered,'A long road begins with one small step','reflection',0,4)
            with Image.open(rendered) as im:
                self.assertEqual(im.size,(1080,1920))
            with self.assertRaises(ValueError):
                reels.frame(background,rendered,'W'*90,'reflection',0,4)


if __name__=='__main__':
    unittest.main()
