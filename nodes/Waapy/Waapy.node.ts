import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
} from 'n8n-workflow';

export class Waapy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Waapy',
		name: 'waapy',
		icon: 'file:waapy-logo.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with the Waapy API to send WhatsApp messages',
		defaults: {
			name: 'Waapy',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'waapyApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials["server-url"]}}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Message',
						value: 'message',
					},
				],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{
						name: 'Send Text',
						value: 'sendText',
						description: 'Send a text message',
						action: 'Send a text message',
					},
					{
						name: 'Send Image',
						value: 'sendImage',
						description: 'Send an image message',
						action: 'Send an image message',
					},
				],
				default: 'sendText',
			},
			{
				displayName: 'Connection Name',
				name: 'connectionName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText', 'sendImage'],
					},
				},
				default: '',
				description: 'The name of the connection to use',
			},
			{
				displayName: 'Recipient Number',
				name: 'toNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText', 'sendImage'],
					},
				},
				default: '',
				description: 'The phone number to send the message to, in international format (e.g., 5511999999999)',
			},
			{
				displayName: 'Message Text',
				name: 'text',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
					},
				},
				default: '',
				description: 'The text message to send',
			},
			{
				displayName: 'Image URL',
				name: 'mediaUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendImage'],
					},
				},
				default: '',
				description: 'The URL of the image to send',
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendImage'],
					},
				},
				default: '',
				description: 'Optional caption for the image',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData;

				if (resource === 'message') {
					const toNumber = this.getNodeParameter('toNumber', i) as string;
					const credentials = await this.getCredentials('waapyApi');
					const baseUrl = credentials['server-url'] as string;

					if (operation === 'sendText') {
						const text = this.getNodeParameter('text', i) as string;
						responseData = await this.helpers.httpRequest({
							method: 'POST',
							headers: {
								Authorization: `Bearer ${credentials.apikey}`,
							},
							url: `${baseUrl}/n8n/messages/send-text`,
							body: {
								connectionName: this.getNodeParameter('connectionName', i) as string,
								recipient: toNumber,
								message: {
									body: text,
									type: 'text',
								}
							},
							json: true,
						});
					} else if (operation === 'sendImage') {
						const mediaUrl = this.getNodeParameter('mediaUrl', i) as string;
						const caption = this.getNodeParameter('caption', i) as string;
						responseData = await this.helpers.httpRequest({
							method: 'POST',
							headers: {
								Authorization: `Bearer ${credentials.apikey}`,
							},
							url: `${baseUrl}/n8n/messages/send-image`,
							body: {
								connectionName: this.getNodeParameter('connectionName', i) as string,
								recipient: toNumber,
								mediaUrl: mediaUrl,
								caption: caption,
							},
							json: true,
						});
					}
				}

				returnData.push(Array.isArray(responseData) ? { json: responseData[0] } : { json: responseData });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: this.getInputData(i)[0].json, error, pairedItem: i });
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
