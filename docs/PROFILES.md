# Profiles on desktop and LG TV

The app opens with **Who's watching?**. Select a profile or choose **Add
profile**. **Manage profiles** lets you rename profiles, choose avatar colors,
or remove a profile's local data. Up to eight profiles fit on one device.
The sidebar's **Switch profile** button returns to the picker.

The existing library, progress, preferences and pairing remain under
**My profile**. Its data stays in place; migration does not copy or clear it.
New profiles start with an empty library/history and no device connection.

Each profile has its own library, playback history, player preferences,
extension selection, sync identity, encrypted sync document, pending changes,
custom sync service and migrations. Only the selected profile starts syncing.
The profile picker itself does not start any profile's sync connection.

For separate PCs:

1. Select/create the intended profile on PC 1 and start syncing there (or keep
   its existing connection). Select the corresponding profile on the TV and
   use **Sync devices > Connect this device** to pair it with PC 1.
2. Select/create another profile on PC 2 and start its own sync connection.
   Select the second TV profile and pair that with PC 2.
3. Switch TV profiles to switch libraries, progress and connected devices.

Matching profile names are convenient labels, not pairing credentials. Pair
each profile explicitly with its intended device group. Profile lists and
avatars are local to each installation; connecting a profile syncs its data,
not the other profiles on the device. Each profile may have several devices.
Existing pairing links wait for a profile selection before being applied.

Switching reloads the app before choosing another profile. The selected
storage namespace cannot change within a running app: old asynchronous sync
work therefore continues to refer only to the old profile's keys and group.
In-memory player, metadata and pairing state are recreated on the next choice.

Shared device settings remain shared: FileList login, video-buffer size,
engine and app updates. The FileList settings panel explicitly identifies its
account as shared on this device. Connection keys and provider credentials
are never copied from an existing profile to a newly created one.

Only the selected profile's data is loaded into the app. Avatar tiles use CSS
and initials, without extra images. On TV disposable metadata cache limits
also apply to profile-scoped keys; storage pressure may evict disposable
caches from inactive profiles but never their library, history or sync keys.

Removing a profile affects only its data on this device. Other paired devices
keep their data and can still manage the device group. At least one local
profile must remain. These are viewing profiles, not separate secured OS users.

Build/type compilation only. Pairing, device isolation and remote navigation
remain for user validation; no automatic pairing or playback checks are run.
