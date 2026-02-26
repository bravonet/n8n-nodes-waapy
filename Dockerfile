# Stage 1: Build the node
FROM node:20-alpine as builder

WORKDIR /build
COPY package*.json ./
# Install ALL dependencies (including devDependencies like @n8n/node-cli)
RUN npm config set fetch-retries 5 -g && npm config set fetch-retry-maxtimeout 600000 -g && npm install
COPY . .
RUN npm run build

# Stage 2: Create the custom n8n image
FROM n8nio/n8n:latest

USER root

# Create the custom nodes directory in n8n's expected format
RUN mkdir -p /home/node/.n8n/custom/node_modules/n8n-nodes-waapy
COPY --from=builder /build/dist /home/node/.n8n/custom/node_modules/n8n-nodes-waapy/dist
COPY --from=builder /build/package.json /home/node/.n8n/custom/node_modules/n8n-nodes-waapy/package.json

# Modify permissions
RUN chown -R node:node /home/node/.n8n/custom

USER node
