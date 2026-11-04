# Hasimio

Download installers from [Releases](https://github.com/calinadrian/hasimio/releases).

## Windows

1. Open the newest **Hasimio** release.
2. Download **Hasimio-Setup-<version>.exe** and run it.
3. Follow the installer, then open Hasimio.

## Android

Requires Android 9 or newer and an ARM64 device.

1. Open the newest **Hasimio Android** release and download the **.apk**.
2. Open the downloaded file. If prompted, allow installation from that source.
3. Install, then open Hasimio.

## LG TV

1. Open the newest **Hasimio TV** release and download the **.ipk**.
2. Connect the TV and computer to the same network.
3. Install **Developer Mode** from LG Apps. Sign in, enable **Dev Mode Status**, restart the TV, and enable **Key Server**.
4. Install Node.js on the computer, then run:

```sh
npm install -g @webos-tools/cli
ares-setup-device
```

Add the TV using its IP address, port **9922**, and user **prisoner**. Replace **YOUR_TV** below with the device name you chose:

```sh
ares-novacom --device YOUR_TV --getkey
ares-install --device YOUR_TV PATH_TO_DOWNLOADED_IPK
ares-launch --device YOUR_TV app.hasimio.tv
```

Enter the passphrase displayed by Developer Mode when requested. Keep the Developer Mode session renewed.

## macOS (Apple Silicon)

Download the **.dmg** from the newest Hasimio release that includes one, open it, and drag Hasimio into **Applications**.
