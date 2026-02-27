# n8n-nodes-waapy

This is an n8n community node for integrating with the WaaPy WhatsApp API.
It was heavily inspired by the n8n-nodes-evolution-api package.

## Features

- **WaaPy Trigger**: Starts workflows when a WaaPy webhook is received (e.g. for incoming messages).
- **WaaPy (Action)**: Send WhatsApp messages (Text, Image) using the WaaPy API.

## Installation

Install using n8n's community nodes panel or manually:

```bash
npm install n8n-nodes-waapy
```

## Credentials

You will need two pieces of information from your WaaPy account:

1. **Server URL**: The base URL of the WaaPy API (e.g., `https://api.waapy.co`)
2. **API Key**: Found in your WaaPy dashboard.
