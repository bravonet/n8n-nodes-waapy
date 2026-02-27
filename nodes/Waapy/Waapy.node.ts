import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  INodeExecutionData,
  INodeListSearchResult,
  INodeType,
  INodeTypeDescription,
  NodeApiError,
} from "n8n-workflow";

export class Waapy implements INodeType {
  description: INodeTypeDescription = {
    displayName: "WaaPy",
    name: "waapy",
    icon: "file:waapy-logo.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Interact with the WaaPy API to send WhatsApp messages",
    defaults: {
      name: "WaaPy",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "waapyApi",
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: '={{$credentials["server-url"]}}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    },
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Message",
            value: "message",
          },
        ],
        default: "message",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["message"],
          },
        },
        options: [
          {
            name: "Send Text",
            value: "sendText",
            description: "Send a text message",
            action: "Send a text message",
          },
          {
            name: "Send Image",
            value: "sendImage",
            description: "Send an image message",
            action: "Send an image message",
          },
        ],
        default: "sendText",
      },
      {
        displayName: "Connection Name",
        name: "connectionName",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        required: true,
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            hint: "Select a connection name",
            typeOptions: {
              searchListMethod: "searchConnections",
              searchable: true,
            },
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendText", "sendImage"],
          },
        },
        description: "The connection to use for sending the message",
      },
      {
        displayName: "Recipient Number",
        name: "toNumber",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendText", "sendImage"],
          },
        },
        default: "",
        description:
          "The phone number to send the message to, in international format (e.g., 5511999999999)",
      },
      {
        displayName: "Message Text",
        name: "text",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendText"],
          },
        },
        default: "",
        description: "The text message to send",
      },
      {
        displayName: "Image Source",
        name: "imageUploadMethod",
        type: "options",
        options: [
          {
            name: "From URL",
            value: "url",
          },
          {
            name: "Upload File",
            value: "upload",
          },
        ],
        default: "url",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendImage"],
          },
        },
        description: "Whether to send an image from a URL or upload a file",
      },
      {
        displayName: "Image URL",
        name: "mediaUrl",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendImage"],
            imageUploadMethod: ["url"],
          },
        },
        default: "",
        description: "The URL of the image to send",
      },
      {
        displayName: "Input Binary Field",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        required: true,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendImage"],
            imageUploadMethod: ["upload"],
          },
        },
        description: "Name of the binary property containing the image data",
      },
      {
        displayName: "Caption",
        name: "caption",
        type: "string",
        required: false,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendImage"],
          },
        },
        default: "",
        description: "Optional caption for the image",
      },
    ],
  };

  methods = {
    listSearch: {
      async searchConnections(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials("waapyApi");
        const baseUrl = credentials["server-url"] as string;

        let url = `${baseUrl}/n8n/connections`;
        if (filter) {
          url += `?searchParam=${encodeURIComponent(filter)}`;
        }

        try {
          const responseData = await this.helpers.httpRequest({
            method: "GET",
            headers: {
              Authorization: `Bearer ${credentials.apikey}`,
            },
            url,
            json: true,
          });

          const results: INodePropertyOptions[] = (
            responseData.connections || []
          ).map((connection: any) => ({
            name: connection.name,
            value: connection.name,
          }));

          return {
            results,
          };
        } catch (error) {
          throw new NodeApiError(this.getNode(), error as any);
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData;

        if (resource === "message") {
          const toNumber = this.getNodeParameter("toNumber", i) as string;
          const credentials = await this.getCredentials("waapyApi");
          const baseUrl = credentials["server-url"] as string;

          if (operation === "sendText") {
            const text = this.getNodeParameter("text", i) as string;
            responseData = await this.helpers.httpRequest({
              method: "POST",
              headers: {
                Authorization: `Bearer ${credentials.apikey}`,
              },
              url: `${baseUrl}/n8n/messages/send-text`,
              body: {
                connectionName: this.getNodeParameter("connectionName", i, "", {
                  extractValue: true,
                }) as string,
                recipient: toNumber,
                message: {
                  body: text,
                  type: "text",
                },
              },
              json: true,
            });
          } else if (operation === "sendImage") {
            const imageUploadMethod = this.getNodeParameter(
              "imageUploadMethod",
              i,
            ) as string;
            const caption = this.getNodeParameter("caption", i) as string;

            let body: {
              connectionName: string;
              recipient: string;
              message: {
                body: string;
                type: string;
                mediaUrl?: string;
                mediaBase64?: string;
              };
            } = {
              connectionName: this.getNodeParameter("connectionName", i, "", {
                extractValue: true,
              }) as string,
              recipient: toNumber,
              message: {
                body: caption,
                type: "text",
              },
            };

            if (imageUploadMethod === "url") {
              body.message.mediaUrl = this.getNodeParameter(
                "mediaUrl",
                i,
              ) as string;
            } else {
              const binaryPropertyName = this.getNodeParameter(
                "binaryPropertyName",
                i,
              ) as string;
              const binaryData = this.helpers.assertBinaryData(
                i,
                binaryPropertyName,
              );
              body.message.mediaBase64 = `data:${binaryData.mimeType};base64,${binaryData.data}`;
            }

            responseData = await this.helpers.httpRequest({
              method: "POST",
              headers: {
                Authorization: `Bearer ${credentials.apikey}`,
              },
              url: `${baseUrl}/n8n/messages/send-text`,
              body: body,
              json: true,
            });
          }
        }

        returnData.push(
          Array.isArray(responseData)
            ? { json: responseData[0] }
            : { json: responseData },
        );
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: this.getInputData(i)[0].json,
            error,
            pairedItem: i,
          });
        } else {
          if (error.context) {
            error.context.itemIndex = i;
            throw error;
          }
          throw new NodeApiError(this.getNode(), error as any);
        }
      }
    }

    return [returnData];
  }
}
