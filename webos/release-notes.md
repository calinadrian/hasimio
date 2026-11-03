Fix TV card sizing and playback control alignment.

Poster cards use consistent 152 x 228 artwork bounds in shelves and search.
Play buttons use explicit flex centering and icon spacing. Detail actions,
source controls, dialogs and navigation have TV-specific sizing and spacing.
The TV build expands CSS inset and dynamic viewport units into older browser
layout rules throughout the UI.

The PC monitor distinguishes a stopped Hasimio service from an SSH connection
failure. Reopening Hasimio restored the service connection during diagnosis.
Build and packaging only; visual and playback validation remain for the user.
