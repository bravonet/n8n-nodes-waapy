import {
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  JsonObject,
  NodeApiError,
  NodeConnectionTypes,
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

const extractWebhookId = (responseData: unknown): string | undefined => {
  if (typeof responseData !== "object" || responseData === null) return undefined;
  const data = responseData as Record<string, unknown>;
  return (
    (data.id as string) ??
    (data.webhookId as string) ??
    (data._id as string) ??
    (typeof data.data === "object" && data.data !== null
      ? (data.data as Record<string, unknown>).id as string
      : undefined)
  ) ?? undefined;
};

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

// Trigger nodes are webhook entry points and should not be exposed as AI tools.
export class WaapyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "WaaPy Trigger",
    name: "waapyTrigger",
    icon: { light: "file:waapy-logo.svg", dark: "file:waapy-logo-dark.svg" },
    group: ["trigger"],
    version: 1,
    usableAsTool: true,
    subtitle: "on event",
    description:
      "Starts the workflow when WaaPy events occur (e.g., incoming messages)",
    defaults: {
      name: "WaaPy Trigger",
    },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
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
            const baseUrl = normalizeBaseUrl(credentials["server-url"] as string);
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

        if (!Array.isArray(events) || events.length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "At least one event must be selected.",
          );
        }

        try {
          const credentials = await this.getCredentials("waapyApi");
          const baseUrl = normalizeBaseUrl(credentials["server-url"] as string);

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

          const requestBody = {
            url: webhookUrl,
            events: events,
          };

          const responseData =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              {
                method: "POST" as const,
                url: `${baseUrl}/n8n/webhooks`,
                body: requestBody,
                json: true,
              },
            );

          const webhookId = extractWebhookId(responseData);

          if (!webhookId) {
            throw new NodeOperationError(
              this.getNode(),
              `Webhook creation failed: API response did not contain a webhook ID. Response: ${JSON.stringify(responseData)}`,
            );
          }

          webhookData.webhookId = webhookId;
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
            const baseUrl = normalizeBaseUrl(credentials["server-url"] as string);
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
