# n8n-nodes-waapy

This is an n8n community node for integrating with the Waapy WhatsApp API.
It was heavily inspired by the n8n-nodes-evolution-api package.

## Features

- **Waapy Trigger**: Starts workflows when a Waapy webhook is received (e.g. for incoming messages).
- **Waapy (Action)**: Send WhatsApp messages (Text, Image) using the Waapy API.

## Installation

Install using n8n's community nodes panel or manually:

```bash
npm install n8n-nodes-waapy
```

## Credentials

You will need two pieces of information from your Waapy account:

1. **Server URL**: The base URL of the Waapy API (e.g., `https://api.waapy.io`)
2. **API Key**: Found in your Waapy dashboard.

## Disclaimer

This node is currently a skeleton/template and the actual endpoints (e.g. `/v1/messages/send-text`) may need to be updated depending on the exact specification of the Waapy API.

## Local Testing & Development

To test this node locally, you can use the included Docker Compose configuration. This will spin up a local n8n instance with the `n8n-nodes-waapy` package pre-installed.

1. Ensure you have Docker and Docker Compose installed.
2. In the root of the project, run:
   ```bash
   docker-compose up --build
   ```
3. Open your browser and navigate to `http://localhost:5678`.
4. Create a new workflow and search for "Waapy" in the nodes panel.

*Note: Any time you change the TypeScript code, you need to stop the container and run `docker-compose up --build` again to rebuild the custom node and restart n8n.*
