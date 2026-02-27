## Local Testing & Development

To test this node locally, you can use the included Docker Compose configuration. This will spin up a local n8n instance with the `n8n-nodes-waapy` package pre-installed.

1. Ensure you have Docker and Docker Compose installed.
2. In the root of the project, run:
   ```bash
   docker-compose up --build
   ```
3. Open your browser and navigate to `http://localhost:5678`.
4. Create a new workflow and search for "WaaPy" in the nodes panel.

_Note: Any time you change the TypeScript code, you need to stop the container and run `docker-compose up --build` again to rebuild the custom node and restart n8n._
