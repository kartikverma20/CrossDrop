# CrossDrop

Login-free file sharing over a local network (LAN).
Send images, videos, audio and files between laptops and phones using a temporary 4-character code that expires in 10 minutes.

## Tech stack
Node.js, Express, MongoDB (Mongoose), Multer, HTML, CSS, JavaScript

## How to run
1. Install Node.js and MongoDB Community Server
2. Run `npm install`
3. Run `node server.js`
4. Open the address printed in the terminal on any device on the same Wi-Fi

## Features
- No login
- Send and Receive modes
- Temporary 4-character code (10 min expiry)
- Multiple files at once
- Automatic file deletion after code expiry