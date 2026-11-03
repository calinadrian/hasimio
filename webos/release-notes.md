Add a startup profile picker to desktop and LG TV.

Each profile has its own library, watch progress, preferences, extension
selection and device-sync connection. Pair one TV profile with one PC's
device group and another with a different PC. Existing data and pairing are
preserved under My profile without copying or clearing storage.

Add, rename, recolor and remove local profiles through Manage profiles.
Switch profile in the sidebar returns to the picker. FileList login, buffer
size and app updates remain device-wide. Existing local TV loading-screen
improvements are preserved.

Profile storage uses separate namespaces, including sync credentials and
pending documents. Switching recreates the app before selecting another
profile. TV disposable-cache limits also cover profile-scoped metadata.

Builds and packaging only. Pairing and navigation remain for user validation.
