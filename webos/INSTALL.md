# LG TV installation

1. Connect the TV and computer to the same network.
2. Install Developer Mode from LG Apps, sign in, enable Dev Mode Status, restart the TV, and enable Key Server.
3. Install Node.js on the computer and run: npm install -g @webos-tools/cli
4. Run ares-setup-device and add the TV using its IP address, port 9922, and user prisoner.
5. Run ares-novacom --device YOUR_TV --getkey and enter the TV's passphrase.
6. Run ares-install --device YOUR_TV PATH_TO_IPK.
7. Open Hasimio from the TV home screen.

Keep the Developer Mode session renewed.
