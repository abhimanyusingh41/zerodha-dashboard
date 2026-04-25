@echo off
echo Exposing dashboard over the internet via Cloudflare Tunnel...
echo Your public URL will appear below. Open it on any device.
echo Press Ctrl+C to stop the tunnel.
echo.
cloudflared tunnel --url http://localhost:8000
