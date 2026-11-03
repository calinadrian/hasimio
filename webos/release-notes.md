Fix search focus trapping after dismissing the LG keyboard.

Track the native keyboardStateChange event: webOS can consume Back without
sending a keydown event to the application. Once the keyboard is hidden,
remote arrows navigate away from the focused search input. Enter reopens
editing, and Back exits the field. Native keyboard navigation remains with
webOS while the keyboard is visible. Merely hiding the keyboard does not
force blur, preserving the temporary hide used by voice input.

Build and packaging only; remote interaction remains for user testing.
