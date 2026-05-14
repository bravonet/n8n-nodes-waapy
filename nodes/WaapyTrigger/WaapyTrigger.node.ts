import {
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  JsonObject,
  NodeApiError,
  NodeOperationError,
} from "n8n-workflow";

const normalizeStatusCode = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  return undefined;
};

const getErrorStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const errorObject = error as {
    statusCode?: unknown;
    httpCode?: unknown;
    response?: { statusCode?: unknown };
    cause?: {
      statusCode?: unknown;
      httpCode?: unknown;
      response?: { statusCode?: unknown };
    };
  };

  return (
    normalizeStatusCode(errorObject.statusCode) ??
    normalizeStatusCode(errorObject.httpCode) ??
    normalizeStatusCode(errorObject.response?.statusCode) ??
    normalizeStatusCode(errorObject.cause?.statusCode) ??
    normalizeStatusCode(errorObject.cause?.httpCode) ??
    normalizeStatusCode(errorObject.cause?.response?.statusCode)
  );
};

const isNotFoundError = (error: unknown): boolean =>
  getErrorStatusCode(error) === 404;

// Trigger nodes are webhook entry points and should not be exposed as AI tools.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class WaapyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "WaaPy Trigger",
    name: "waapyTrigger",
    icon: "file:waapy-logo.svg",
    group: ["trigger"],
    version: 1,
    description:
      "Starts the workflow when WaaPy events occur (e.g., incoming messages)",
    defaults: {
      name: "WaaPy Trigger",
    },
    inputs: [],
    outputs: ["main"],
    credentials: [
      {
        name: "waapyApi",
        required: true,
      },
    ],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Events",
        name: "events",
        type: "multiOptions",
        options: [
          {
            name: "Message Received",
            value: "message.received",
            description: "Triggered when a new message is received",
          },
          {
            name: "Message Status Updated",
            value: "message.status",
            description:
              "Triggered when a message status changes (sent, delivered, read)",
          },
        ],
        default: ["message.received"],
        required: true,
        description: "The events to listen",
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData("node");
        if (webhookData.webhookId !== undefined) {
          try {
            const credentials = await this.getCredentials("waapyApi");
            const baseUrl = credentials["server-url"] as string;
            const endpoint = `/n8n/webhooks/${webhookData.webhookId}`;
            const options = {
              method: "GET" as const,
              url: `${baseUrl}${endpoint}`,
              json: true,
            };
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              options,
            );
            return true;
          } catch (error) {
            if (isNotFoundError(error)) {
              delete webhookData.webhookId;
              return false;
            }

            return true;
          }
        }
        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl("default");
        const events = this.getNodeParameter("events", []) as string[];
        const webhookData = this.getWorkflowStaticData("node");

        if (webhookUrl === undefined) {
          throw new NodeOperationError(
            this.getNode(),
            "No webhook URL could be determined.",
          );
        }

        try {
          const credentials = await this.getCredentials("waapyApi");
          const baseUrl = credentials["server-url"] as string;

          if (webhookData.webhookId !== undefined) {
            try {
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "DELETE" as const,
                  url: `${baseUrl}/n8n/webhooks/${webhookData.webhookId}`,
                  json: true,
                },
              );
            } catch (error) {
              if (!isNotFoundError(error)) {
                throw new NodeApiError(this.getNode(), error as JsonObject, {
                  message: "Failed to replace existing webhook registration",
                });
              }
            }

            delete webhookData.webhookId;
          }

          const options = {
            method: "POST" as const,
            url: `${baseUrl}/n8n/webhooks`,
            body: {
              url: webhookUrl,
              events: events,
            },
            json: true,
          };

          const responseData =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              options,
            );

          if ((responseData as { id?: unknown }).id === undefined) {
            throw new NodeApiError(this.getNode(), responseData as JsonObject, {
              message: "Webhook creation failed",
            });
          }

          webhookData.webhookId = responseData.id as string;
          return true;
        } catch (error) {
          throw new NodeApiError(this.getNode(), error as JsonObject);
        }
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData("node");
        if (webhookData.webhookId !== undefined) {
          try {
            const credentials = await this.getCredentials("waapyApi");
            const baseUrl = credentials["server-url"] as string;
            const options = {
              method: "DELETE" as const,
              url: `${baseUrl}/n8n/webhooks/${webhookData.webhookId}`,
              json: true,
            };
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              options,
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw new NodeApiError(this.getNode(), error as JsonObject);
            }
          }
          delete webhookData.webhookId;
          return true;
        }
        return false;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    return {
      workflowData: [
        [
          {
            json: req.body,
          },
        ],
      ],
    };
  }
}
