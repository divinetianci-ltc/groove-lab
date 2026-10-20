@echo off
setlocal
title Groove Lab
rem Open the local app in a real browser, regardless of the HTML file association.
rem This script does not install software or change system settings.
set "groove_page=%~dp0index.html"
if not exist "%groove_page%" goto missing_page
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%groove_page%"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%groove_page%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "%groove_page%"
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%groove_page%"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%groove_page%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%groove_page%"
  exit /b 0
)
echo Edge or Chrome was not found in a standard location.
echo Open your browser, press Ctrl+O, and choose this file:
echo "%groove_page%"
pause
exit /b 1

:missing_page
echo Please extract the entire ZIP first.
echo Keep Start-Groove-Lab.cmd next to index.html.
pause
exit /b 1
