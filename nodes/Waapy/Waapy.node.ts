import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  INodeExecutionData,
  INodeListSearchResult,
  INodeType,
  INodeTypeDescription,
  NodeApiError,
  NodeOperationError,
} from "n8n-workflow";

type TemplateButton = {
  type?: string;
  url?: string;
  text?: string;
  payload?: string;
};

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
};

type TemplateListItem = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  active?: boolean;
};

type LabelListItem = {
  id?: string;
  name?: string;
  color?: string;
};

type QuickReplyButtonInput = {
  id: string;
  title: string;
};

type DynamicTemplateRequirements = {
  hasHeader: boolean;
  hasFooter: boolean;
  hasButtons: boolean;
  headerParamCount: number;
  bodyParamCount: number;
  buttonRequirements: Array<{
    index: number;
    subType: string;
    paramCount: number;
  }>;
};

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

const ensureArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const countTemplateVariables = (value: unknown): number => {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  const variableIndexes = new Set<string>();
  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    if (match[1]) {
      variableIndexes.add(match[1]);
    }
  }

  return variableIndexes.size;
};

const normalizeButtonSubType = (value: unknown): string => {
  if (typeof value !== "string") {
    return "quick_reply";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized.includes("url")) {
    return "url";
  }
  if (normalized.includes("copy")) {
    return "copy_code";
  }
  if (normalized.includes("quick")) {
    return "quick_reply";
  }

  return normalized || "quick_reply";
};

const extractTemplateComponents = (
  templateDetails: unknown,
): TemplateComponent[] => {
  if (typeof templateDetails !== "object" || templateDetails === null) {
    return [];
  }

  const responseData = templateDetails as {
    components?: unknown;
    whatsappTemplate?: { components?: unknown };
    template?: { components?: unknown };
    data?: { components?: unknown };
  };

  return ensureArray<TemplateComponent>(
    responseData.components ??
      responseData.whatsappTemplate?.components ??
      responseData.template?.components ??
      responseData.data?.components,
  );
};

const extractTemplateName = (
  templateDetails: unknown,
  fallbackName?: string,
): string | undefined => {
  if (typeof templateDetails !== "object" || templateDetails === null) {
    return fallbackName;
  }

  const responseData = templateDetails as {
    name?: unknown;
    whatsappTemplate?: { name?: unknown };
    template?: { name?: unknown };
    data?: { name?: unknown };
  };

  const candidateName =
    responseData.name ??
    responseData.whatsappTemplate?.name ??
    responseData.template?.name ??
    responseData.data?.name;

  if (typeof candidateName === "string" && candidateName.length > 0) {
    return candidateName;
  }

  return fallbackName;
};

const inspectTemplateRequirements = (
  templateComponents: TemplateComponent[],
): DynamicTemplateRequirements => {
  let hasHeader = false;
  let hasFooter = false;
  let hasButtons = false;
  let headerParamCount = 0;
  let bodyParamCount = 0;
  const buttonRequirements: DynamicTemplateRequirements["buttonRequirements"] =
    [];

  for (const component of templateComponents) {
    const componentType = `${component.type ?? ""}`.toUpperCase();

    if (componentType === "HEADER") {
      hasHeader = true;
      const format = `${component.format ?? "TEXT"}`.toUpperCase();
      if (format === "TEXT") {
        headerParamCount = countTemplateVariables(component.text);
      } else if (["IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(format)) {
        headerParamCount = 1;
      }
      continue;
    }

    if (componentType === "BODY") {
      bodyParamCount = countTemplateVariables(component.text);
      continue;
    }

    if (componentType === "FOOTER") {
      hasFooter = true;
      continue;
    }

    if (componentType === "BUTTONS") {
      hasButtons = true;
      const buttons = ensureArray<TemplateButton>(component.buttons);
      buttons.forEach((button, index) => {
        const paramCount = Math.max(
          countTemplateVariables(button.url),
          countTemplateVariables(button.text),
          countTemplateVariables(button.payload),
        );

        if (paramCount > 0) {
          buttonRequirements.push({
            index,
            subType: normalizeButtonSubType(button.type),
            paramCount,
          });
        }
      });
    }
  }

  return {
    hasHeader,
    hasFooter,
    hasButtons,
    headerParamCount,
    bodyParamCount,
    buttonRequirements,
  };
};

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
            name: "Label",
            value: "label",
          },
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
          {
            name: "Send Template",
            value: "sendTemplate",
            description: "Send a template message",
            action: "Send a template message",
          },
        ],
        default: "sendText",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["label"],
          },
        },
        options: [
          {
            name: "Assign Label",
            value: "assignLabel",
            description: "Add or delete a label on a ticket, contact, or both",
            action: "Assign a label",
          },
        ],
        default: "assignLabel",
      },
      {
        displayName: "Ticket ID",
        name: "ticketId",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["label"],
            operation: ["assignLabel"],
          },
        },
        default: "",
        description: "The ticket ID used to assign or remove the label",
      },
      {
        displayName: "Apply To",
        name: "target",
        type: "options",
        options: [
          {
            name: "Ticket Only",
            value: "ticket",
          },
          {
            name: "Contact Only",
            value: "contact",
          },
          {
            name: "Ticket and Contact",
            value: "both",
          },
        ],
        default: "ticket",
        displayOptions: {
          show: {
            resource: ["label"],
            operation: ["assignLabel"],
          },
        },
        description: "Whether to update the ticket, the linked contact, or both",
      },
      {
        displayName: "Action",
        name: "action",
        type: "options",
        options: [
          {
            name: "Add",
            value: "add",
          },
          {
            name: "Delete",
            value: "delete",
          },
          {
            name: "Delete All Labels",
            value: "deleteAll",
          },
        ],
        default: "add",
        displayOptions: {
          show: {
            resource: ["label"],
            operation: ["assignLabel"],
          },
        },
        description: "Whether to add, delete, or delete all labels",
      },
      {
        displayName: "Label",
        name: "labelId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        required: true,
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            hint: "Select a label",
            typeOptions: {
              searchListMethod: "searchLabels",
              searchable: true,
            },
          },
        ],
        displayOptions: {
          show: {
            resource: ["label"],
            operation: ["assignLabel"],
            action: ["add", "delete"],
          },
        },
        description: "The label to add or delete",
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
            operation: ["sendText", "sendImage", "sendTemplate"],
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
            operation: ["sendText", "sendImage", "sendTemplate"],
          },
        },
        default: "",
        description:
          "The phone number to send the message to, in international format (e.g., 5511999999999)",
      },
      {
        displayName: "Template",
        name: "templateName",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        required: true,
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            hint: "Select a template name",
            typeOptions: {
              searchListMethod: "searchTemplates",
              searchable: true,
            },
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
          },
        },
        description: "Select the approved template to send",
      },
      {
        displayName: "Strict Template Validation",
        name: "strictTemplateValidation",
        type: "boolean",
        default: true,
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
          },
        },
        description:
          "Whether to validate header/body/button parameter counts against template metadata before sending",
      },
      {
        displayName: "Header Type",
        name: "headerType",
        type: "options",
        options: [
          { name: "None / Text", value: "text" },
          { name: "Image", value: "image" },
          { name: "Video", value: "video" },
          { name: "Document", value: "document" },
        ],
        default: "text",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
          },
        },
        description: "The type of header defined in the template",
      },
      {
        displayName: "Header Parameters",
        name: "headerParameters",
        type: "fixedCollection",
        default: {},
        typeOptions: {
          multipleValues: true,
        },
        options: [
          {
            name: "values",
            displayName: "Values",
            values: [
              {
                displayName: "Value",
                name: "value",
                type: "string",
                default: "",
                description:
                  "Header variable value in order, matching template placeholders like {{1}}, {{2}}",
              },
            ],
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
            headerType: ["text"],
          },
        },
        description:
          "Values for dynamic header placeholders. Leave empty if header has no placeholders",
      },
      {
        displayName: "Header Image URL",
        name: "headerImageUrl",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
            headerType: ["image"],
          },
        },
        description: "The URL of the header image",
      },
      {
        displayName: "Header Video URL",
        name: "headerVideoUrl",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
            headerType: ["video"],
          },
        },
        description: "The URL of the header video",
      },
      {
        displayName: "Header Document URL",
        name: "headerDocumentUrl",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
            headerType: ["document"],
          },
        },
        description: "The URL of the header document",
      },
      {
        displayName: "Header Document Filename",
        name: "headerDocumentFilename",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
            headerType: ["document"],
          },
        },
        description: "The filename of the header document",
      },
      {
        displayName: "Body Parameters",
        name: "bodyParameters",
        type: "fixedCollection",
        default: {},
        typeOptions: {
          multipleValues: true,
        },
        options: [
          {
            name: "values",
            displayName: "Values",
            values: [
              {
                displayName: "Value",
                name: "value",
                type: "string",
                default: "",
                description:
                  "Body variable value in order, matching template placeholders like {{1}}, {{2}}",
              },
            ],
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
          },
        },
        description:
          "Values for dynamic body placeholders. Leave empty if body has no placeholders",
      },
      {
        displayName: "Button Parameters",
        name: "buttonParameters",
        type: "fixedCollection",
        default: {},
        typeOptions: {
          multipleValues: true,
        },
        options: [
          {
            name: "values",
            displayName: "Values",
            values: [
              {
                displayName: "Button Index",
                name: "index",
                type: "number",
                typeOptions: {
                  minValue: 0,
                  numberPrecision: 0,
                },
                default: 0,
                description:
                  "Button position from template metadata, zero-based",
              },
              {
                displayName: "Position",
                name: "position",
                type: "number",
                typeOptions: {
                  minValue: 1,
                  numberPrecision: 0,
                },
                default: 1,
                description:
                  "Parameter position for this button, used when one button has multiple placeholders",
              },
              {
                displayName: "Sub Type",
                name: "subType",
                type: "options",
                options: [
                  {
                    name: "URL",
                    value: "url",
                  },
                  {
                    name: "Quick Reply",
                    value: "quick_reply",
                  },
                  {
                    name: "Copy Code",
                    value: "copy_code",
                  },
                ],
                default: "url",
                description:
                  "Button subtype. If left unchanged, runtime metadata validation will override when possible",
              },
              {
                displayName: "Value",
                name: "value",
                type: "string",
                default: "",
                description:
                  "Dynamic value for the selected button placeholder",
              },
            ],
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendTemplate"],
          },
        },
        description:
          "Values for dynamic button placeholders. Leave empty if buttons are static",
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
        displayName: "Reply Buttons",
        name: "textButtons",
        type: "fixedCollection",
        default: {},
        typeOptions: {
          multipleValues: true,
        },
        options: [
          {
            name: "values",
            displayName: "Values",
            values: [
              {
                displayName: "Reply Button ID",
                name: "id",
                type: "string",
                default: "",
                description:
                  "Internal reply button value returned in the webhook or message response when the user taps this button",
              },
              {
                displayName: "Reply Button Title",
                name: "title",
                type: "string",
                default: "",
                description: "Visible reply button text shown to the recipient",
              },
            ],
          },
        ],
        displayOptions: {
          show: {
            resource: ["message"],
            operation: ["sendText"],
          },
        },
        description:
          "Optional reply buttons for this text message. Maximum 10 buttons",
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
          const responseData =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              {
                method: "GET",
                url,
                json: true,
              },
            );

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
      async searchTemplates(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials("waapyApi");
        const baseUrl = credentials["server-url"] as string;

        let url = `${baseUrl}/n8n/templates`;
        if (filter) {
          url += `?searchName=${encodeURIComponent(filter)}`;
        }

        try {
          const responseData =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              {
                method: "GET",
                url,
                json: true,
              },
            );

          const templates = ensureArray<TemplateListItem>(
            (responseData as { templates?: unknown }).templates,
          );

          const results: INodePropertyOptions[] = templates
            .filter((template) => template.active !== false)
            .map((template) => ({
              name: `${template.name ?? template.id ?? "Unnamed Template"}${
                template.language ? ` (${template.language})` : ""
              }`,
              value: template.id ?? template.name ?? "",
            }))
            .filter((template) => template.value !== "");

          return {
            results,
          };
        } catch (error) {
          throw new NodeApiError(this.getNode(), error as any);
        }
      },
      async searchLabels(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials("waapyApi");
        const baseUrl = credentials["server-url"] as string;

        let url = `${baseUrl}/n8n/labels`;
        if (filter) {
          url += `?searchName=${encodeURIComponent(filter)}`;
        }

        try {
          const responseData =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "waapyApi",
              {
                method: "GET",
                url,
                json: true,
              },
            );

          const labels = ensureArray<LabelListItem>(
            (responseData as { labels?: unknown }).labels,
          );

          const results: INodePropertyOptions[] = labels
            .map((label) => ({
              name: label.name ?? label.id ?? "Unnamed Label",
              value: label.id ?? "",
            }))
            .filter((label) => label.value !== "");

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

        if (resource === "label") {
          if (operation === "assignLabel") {
            const ticketId = `${this.getNodeParameter("ticketId", i)}`.trim();
            const target = this.getNodeParameter("target", i) as string;
            const action = this.getNodeParameter("action", i) as string;
            const credentials = await this.getCredentials("waapyApi");
            const baseUrl = credentials["server-url"] as string;

            if (ticketId.length === 0) {
              throw new NodeOperationError(
                this.getNode(),
                "Ticket ID is required.",
              );
            }

            const body: {
              ticketId: string;
              target: string;
              action: string;
              labelId?: string;
            } = {
              ticketId,
              target,
              action,
            };

            if (action !== "deleteAll") {
              const labelId = `${this.getNodeParameter("labelId", i, "", {
                extractValue: true,
              })}`.trim();

              if (labelId.length === 0) {
                throw new NodeOperationError(
                  this.getNode(),
                  "Label is required.",
                );
              }

              body.labelId = labelId;
            }

            responseData =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "POST",
                  url: `${baseUrl}/n8n/tickets/labels`,
                  body,
                  json: true,
                },
              );
          }
        } else if (resource === "message") {
          const toNumber = this.getNodeParameter("toNumber", i) as string;
          const credentials = await this.getCredentials("waapyApi");
          const baseUrl = credentials["server-url"] as string;

          if (operation === "sendText") {
            const text = this.getNodeParameter("text", i) as string;
            const textButtons =
              (
                this.getNodeParameter("textButtons", i, {}) as {
                  values?: QuickReplyButtonInput[];
                }
              ).values ?? [];
            const sanitizedTextButtons = textButtons
              .map((button) => ({
                id: `${button.id ?? ""}`.trim(),
                title: `${button.title ?? ""}`.trim(),
              }))
              .filter(
                (button) => button.id.length > 0 && button.title.length > 0,
              )
              .map((button) => ({
                id: button.id,
                title: button.title,
              }));

            if (sanitizedTextButtons.length > 10) {
              throw new NodeOperationError(
                this.getNode(),
                "Send Text supports a maximum of 10 reply buttons.",
              );
            }

            responseData =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "POST",
                  url: `${baseUrl}/n8n/messages/send-text`,
                  body: {
                    connectionName: this.getNodeParameter(
                      "connectionName",
                      i,
                      "",
                      {
                        extractValue: true,
                      },
                    ) as string,
                    recipient: toNumber,
                    message: {
                      body: text,
                      type: "text",
                      ...(sanitizedTextButtons.length > 0
                        ? {
                            buttons: sanitizedTextButtons,
                          }
                        : {}),
                    },
                  },
                  json: true,
                },
              );
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

            responseData =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "POST",
                  url: `${baseUrl}/n8n/messages/send-text`,
                  body: body,
                  json: true,
                },
              );
          } else if (operation === "sendTemplate") {
            const selectedTemplateValue = this.getNodeParameter(
              "templateName",
              i,
              "",
              {
                extractValue: true,
              },
            ) as string;
            const strictTemplateValidation = this.getNodeParameter(
              "strictTemplateValidation",
              i,
              true,
            ) as boolean;
            const headerType = this.getNodeParameter(
              "headerType",
              i,
              "text",
            ) as string;

            let sanitizedHeaderParameters: string[] = [];
            let headerPayload: Record<string, string> = {};

            if (headerType === "text") {
              const headerParameters =
                (
                  this.getNodeParameter("headerParameters", i, {}) as {
                    values?: Array<{ value: string }>;
                  }
                ).values ?? [];
              sanitizedHeaderParameters = headerParameters
                .map((parameter) => `${parameter.value ?? ""}`.trim())
                .filter((value) => value.length > 0);

              if (sanitizedHeaderParameters.length > 0) {
                sanitizedHeaderParameters.forEach((value, index) => {
                  headerPayload[`${index + 1}`] = value;
                });
              }
            } else if (headerType === "image") {
              const imageUrl = this.getNodeParameter(
                "headerImageUrl",
                i,
                "",
              ) as string;
              if (imageUrl) {
                sanitizedHeaderParameters = [imageUrl];
                headerPayload = { image: imageUrl };
              }
            } else if (headerType === "video") {
              const videoUrl = this.getNodeParameter(
                "headerVideoUrl",
                i,
                "",
              ) as string;
              if (videoUrl) {
                sanitizedHeaderParameters = [videoUrl];
                headerPayload = { video: videoUrl };
              }
            } else if (headerType === "document") {
              const documentUrl = this.getNodeParameter(
                "headerDocumentUrl",
                i,
                "",
              ) as string;
              const documentFilename = this.getNodeParameter(
                "headerDocumentFilename",
                i,
                "",
              ) as string;
              if (documentUrl) {
                sanitizedHeaderParameters = [documentUrl];
                headerPayload = { document: documentUrl };
                if (documentFilename) {
                  headerPayload.filename = documentFilename;
                }
              }
            }
            const bodyParameters =
              (
                this.getNodeParameter("bodyParameters", i, {}) as {
                  values?: Array<{ value: string }>;
                }
              ).values ?? [];
            const buttonParameters =
              (
                this.getNodeParameter("buttonParameters", i, {}) as {
                  values?: Array<{
                    index: number;
                    position?: number;
                    subType?: string;
                    value: string;
                  }>;
                }
              ).values ?? [];
            const normalizedButtonParameters = buttonParameters as Array<{
              index: number;
              position?: number;
              subType?: string;
              value: string;
            }>;

            const fetchTemplateDetail = async (
              templateId: string,
            ): Promise<unknown> =>
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "GET",
                  url: `${baseUrl}/n8n/templates/${templateId}?connectionName=${
                    this.getNodeParameter("connectionName", i, "", {
                      extractValue: true,
                    }) as string
                  }`,
                  json: true,
                },
              );

            let templateDetails: unknown;
            let selectedTemplateName: string | undefined;

            try {
              templateDetails = await fetchTemplateDetail(
                selectedTemplateValue,
              );
            } catch (error) {
              const fallbackTemplateList =
                (await this.helpers.httpRequestWithAuthentication.call(
                  this,
                  "waapyApi",
                  {
                    method: "GET",
                    url: `${baseUrl}/n8n/templates?searchName=${encodeURIComponent(selectedTemplateValue)}`,
                    json: true,
                  },
                )) as {
                  whatsappTemplates?: unknown;
                };

              const matchedTemplate = ensureArray<TemplateListItem>(
                fallbackTemplateList.whatsappTemplates,
              ).find((template) => template.name === selectedTemplateValue);

              if (!matchedTemplate?.id) {
                throw new NodeApiError(this.getNode(), error as any, {
                  message: `Unable to resolve template details for "${selectedTemplateValue}"`,
                });
              }

              selectedTemplateName = matchedTemplate.name;
              templateDetails = await fetchTemplateDetail(matchedTemplate.id);
            }

            const templateComponents =
              extractTemplateComponents(templateDetails);
            const templateRequirements =
              inspectTemplateRequirements(templateComponents);

            const sanitizedBodyParameters = bodyParameters
              .map((parameter) => `${parameter.value ?? ""}`.trim())
              .filter((value) => value.length > 0);

            const groupedButtonParameters = new Map<
              number,
              Array<{ position: number; subType: string; value: string }>
            >();

            for (const parameter of normalizedButtonParameters) {
              const index = Number(parameter.index);
              const position = Number(parameter.position ?? 1);
              const value = `${parameter.value ?? ""}`.trim();

              if (!Number.isInteger(index) || index < 0 || value.length === 0) {
                continue;
              }

              const groupedValues = groupedButtonParameters.get(index) ?? [];
              groupedValues.push({
                position:
                  Number.isInteger(position) && position > 0 ? position : 1,
                subType: normalizeButtonSubType(parameter.subType),
                value,
              });
              groupedButtonParameters.set(index, groupedValues);
            }

            groupedButtonParameters.forEach((values, index) => {
              values.sort((a, b) => a.position - b.position);
              groupedButtonParameters.set(index, values);
            });

            if (strictTemplateValidation) {
              if (
                sanitizedHeaderParameters.length !==
                templateRequirements.headerParamCount
              ) {
                throw new NodeOperationError(
                  this.getNode(),
                  `Header requires ${templateRequirements.headerParamCount} parameter(s), but ${sanitizedHeaderParameters.length} provided.`,
                );
              }

              if (
                sanitizedBodyParameters.length !==
                templateRequirements.bodyParamCount
              ) {
                throw new NodeOperationError(
                  this.getNode(),
                  `Body requires ${templateRequirements.bodyParamCount} parameter(s), but ${sanitizedBodyParameters.length} provided.`,
                );
              }

              for (const buttonRequirement of templateRequirements.buttonRequirements) {
                const providedParameters =
                  groupedButtonParameters.get(buttonRequirement.index) ?? [];
                if (
                  providedParameters.length !== buttonRequirement.paramCount
                ) {
                  throw new NodeOperationError(
                    this.getNode(),
                    `Button index ${buttonRequirement.index} requires ${buttonRequirement.paramCount} parameter(s), but ${providedParameters.length} provided.`,
                  );
                }
              }

              const requiredButtonIndexes = new Set(
                templateRequirements.buttonRequirements.map(
                  (buttonRequirement) => buttonRequirement.index,
                ),
              );
              for (const providedButtonIndex of groupedButtonParameters.keys()) {
                if (!requiredButtonIndexes.has(providedButtonIndex)) {
                  throw new NodeOperationError(
                    this.getNode(),
                    `Button index ${providedButtonIndex} does not have dynamic placeholders in this template.`,
                  );
                }
              }
            }

            const dynamicData: Record<string, Record<string, string>> = {};

            if (Object.keys(headerPayload).length > 0) {
              dynamicData.header = headerPayload;
            }

            if (sanitizedBodyParameters.length > 0) {
              dynamicData.body = {};
              sanitizedBodyParameters.forEach((value, index) => {
                dynamicData.body[`${index + 1}`] = value;
              });
            }

            if (groupedButtonParameters.size > 0) {
              dynamicData.buttons = {};
              for (const [index, values] of [
                ...groupedButtonParameters.entries(),
              ].sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)) {
                values.forEach((parameter) => {
                  const key =
                    values.length > 1
                      ? `${index}_${parameter.position}`
                      : `${index + 1}`;
                  dynamicData.buttons[key] = parameter.value;
                });
              }
            }

            const resolvedTemplateName = extractTemplateName(
              templateDetails,
              selectedTemplateName,
            );
            if (!resolvedTemplateName) {
              throw new NodeOperationError(
                this.getNode(),
                "Template details do not include a template name.",
              );
            }

            responseData =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "waapyApi",
                {
                  method: "POST",
                  url: `${baseUrl}/n8n/messages/send-template`,
                  body: {
                    connectionName: this.getNodeParameter(
                      "connectionName",
                      i,
                      "",
                      {
                        extractValue: true,
                      },
                    ) as string,
                    recipient: toNumber,
                    message: {
                      type: "template",
                      template: {
                        name: resolvedTemplateName,
                        ...(Object.keys(dynamicData).length > 0
                          ? {
                              dynamicData: dynamicData,
                            }
                          : {}),
                      },
                    },
                  },
                  json: true,
                },
              );
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
