@echo off
echo Starting Humperz game...
start "" /B cmd /c "npx browser-sync start --server --files "*.html, *.js" --index "hopz.html" --no-notify --no-ui"
timeout /t 2 >nul

exit