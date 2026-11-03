Fix the clipped focus highlight on TV poster cards.

Poster cards use a rounded overlay border painted above the artwork. Remove
its parent button outline so the image cannot obscure the focus indicator
and no frame surrounds the title text. Disable poster hover movement on TV
so the artwork and highlight keep the same bounds.
