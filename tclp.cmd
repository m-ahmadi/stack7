@echo off
echo Toggling custom livereload port...
cmd /c node build.js toggleLive
cmd /c node build.js js
cmd /c node build.js html
echo.
echo Done.
pause