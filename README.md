# n8n-nodes-waapy

Community nodes for connecting **n8n** with the **WaaPy WhatsApp API**.

## What This Package Does

It adds 2 nodes to n8n:

1. **WaaPy (Action)**  
   Send WhatsApp messages using:
   - Text
   - Image
   - Template (including dynamic template variables)

2. **WaaPy Trigger**  
   Start workflows when WaaPy sends webhook events, such as:
   - Incoming message event
   - Message status event

## Installation

### Option A: Install from n8n Community Nodes UI

1. Open n8n.
2. Go to **Settings** -> **Community Nodes**.
3. Search for `n8n-nodes-waapy`.
4. Install and restart n8n if required.

### Option B: Manual install

```bash
npm install n8n-nodes-waapy
```

## Credentials

Create credentials of type **WaaPy API** in n8n:

1. **Server URL**  
   Example: `https://api.waapy.co`
2. **API Key**  
   Your WaaPy API token

The credentials test uses `GET /n8n/health`.

## Node Guide

### 1) WaaPy (Action)

### Resource

- `Message`

### Operations

#### A. Send Text

Use this when you want to send a normal text message.

Required fields:

- **Connection Name**
- **Recipient Number**
- **Message Text**

#### B. Send Image

Use this when you want to send an image.

Required fields:

- **Connection Name**
- **Recipient Number**
- **Image Source** (`From URL` or `Upload File`)

Optional:

- **Caption**

If you choose **Upload File**, provide:

- **Input Binary Field** (default: `data`)

#### C. Send Template

Use this when you want to send an approved WhatsApp template.

Required fields:

- **Connection Name**
- **Recipient Number**
- **Template**

How it works:

1. Template list is loaded from `GET /n8n/templates`.
2. Selected template ID is used to fetch details from `GET /n8n/templates/:templateId`.
3. The node inspects template components (header/body/footer/buttons).
4. The node builds payload for `POST /n8n/messages/send-template`.

Dynamic template inputs:

- **Header Parameters**
- **Body Parameters**
- **Button Parameters**

Validation:

- **Strict Template Validation** (default: `true`) checks that your dynamic inputs match the template placeholders.
- If counts do not match (for example body expects 2 variables but you pass 1), node execution fails with a clear error.

Notes:

- Footer is detected from template metadata automatically.
- Footer usually does not require variables; only header/body/buttons can include placeholders.

### 2) WaaPy Trigger

Use this node to receive WaaPy webhook events and start workflows.

Available events:

- `message.received`
- `message.status`

Behavior:

- On activation, n8n registers a webhook in WaaPy.
- On deactivation, n8n removes it.
- Incoming webhook payload is output as JSON in the first item.

## Quick Usage Examples

### Send a text message

1. Add **WaaPy** node.
2. Select `Resource: Message`.
3. Select `Operation: Send Text`.
4. Fill connection, recipient, text.
5. Execute node.

### Send a template with dynamic values

1. Add **WaaPy** node.
2. Select `Operation: Send Template`.
3. Choose template from the list.
4. Fill dynamic values in Header/Body/Button parameters.
5. Execute node.

### Trigger on incoming message

1. Add **WaaPy Trigger** node.
2. Select event `message.received`.
3. Activate workflow.
4. Send WhatsApp message to your connected number and verify payload in execution.

## Development

```bash
npm ci
npm run build
npm run dev
```

Useful commands:

```bash
npm run build:watch
npm run lint
npm run lint:fix
```

For local end-to-end smoke testing:

```bash
docker-compose up --build
```

## Troubleshooting

1. **Template list is empty**
   - Check API key permissions.
   - Verify `Server URL` is correct.
   - Ensure templates are active/approved in WaaPy.

2. **Template send fails due to parameter count**
   - Review placeholder count in template details.
   - Match Header/Body/Button input counts to template variables.
   - Temporarily disable `Strict Template Validation` only for debugging.

3. **Trigger not receiving events**
   - Ensure workflow is active.
   - Check that webhook registration exists in WaaPy.
   - Verify your n8n webhook URL is publicly reachable by WaaPy.

## License

MIT
