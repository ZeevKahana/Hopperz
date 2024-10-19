@echo off
echo Starting Humperz game server...


start "" node server.js


timeout /t 3 >nul


start http://localhost:3000

echo Humperz game server is running. Press Ctrl+C in the server window to stop.