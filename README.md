# Discord Web Interface
A node application allowing admins to more easily edit embeds in the browser.

## How to Use

### Requirements

Redis - Redis server must be installed and running (default port)

Node - `npm install` to install node dependencies

### Configuration

Set environment variables
```bash
PORT="8000" # Port to host web server on
CLIENT_ID="" # Discord application ID
CLIENT_SECRET="" # Discord application secret
CLIENT_REDIRECT="http://localhost:8000/api/oauth2/code" # URL to redirect to after oauth
BOT_TOKEN="" # Discord bot token
```

### Running

1. Start redis (`systemctl start redis`)
2. Set env vars
3. Start bot (`npm run-script start-discord`)
4. Start webserver (`npm run-script start-web`)
5. Navigate to website (default: `http://localhost:8000`)
