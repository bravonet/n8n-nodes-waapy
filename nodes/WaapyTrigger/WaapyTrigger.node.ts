import {
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

export class WaapyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WaaPy Trigger',
		name: 'waapyTrigger',
		icon: 'file:waapy-logo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when WaaPy events occur (e.g., incoming messages)',
		defaults: {
			name: 'WaaPy Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'waapyApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: [
					{
						name: 'Message Received',
						value: 'message.received',
						description: 'Triggered when a new message is received',
					},
					{
						name: 'Message Status Updated',
						value: 'message.status',
						description: 'Triggered when a message status changes (sent, delivered, read)',
					},
				],
				default: ['message.received'],
				required: true,
				description: 'The events to listen.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId !== undefined) {
					// Check if webhook still exists on the server
					try {
						const credentials = await this.getCredentials('waapyApi');
						const baseUrl = credentials['server-url'] as string;
						const endpoint = `/n8n/webhooks/${webhookData.webhookId}`;
						const options = {
							method: 'GET' as const,
							headers: {
								Authorization: `Bearer ${credentials.apikey}`,
							},
							url: `${baseUrl}${endpoint}`,
							json: true,
						};
						await this.helpers.httpRequest(options);
						return true;
					} catch (error) {
						return false;
					}
				}
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events', []) as string[];
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookUrl === undefined) {
					throw new NodeOperationError(this.getNode(), 'No webhook URL could be determined.');
				}

				try {
					const credentials = await this.getCredentials('waapyApi');
					const baseUrl = credentials['server-url'] as string;
					const options = {
						method: 'POST' as const,
						headers: {
							Authorization: `Bearer ${credentials.apikey}`,
						},
						url: `${baseUrl}/n8n/webhooks`,
						body: {
							url: webhookUrl,
							events: events,
						},
						json: true,
					};

					const responseData = await this.helpers.httpRequest(options);
					
					if (responseData.id === undefined) {
						throw new NodeApiError(this.getNode(), responseData as any, {
							message: 'Webhook creation failed',
						});
					}

					webhookData.webhookId = responseData.id as string;
					return true;
				} catch (error) {
					console.log(error);
					throw new NodeApiError(this.getNode(), error as any);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId !== undefined) {
					try {
						const credentials = await this.getCredentials('waapyApi');
						const baseUrl = credentials['server-url'] as string;
						const options = {
							method: 'DELETE' as const,
							headers: {
								Authorization: `Bearer ${credentials.apikey}`,
							},
							url: `${baseUrl}/n8n/webhooks/${webhookData.webhookId}`,
							json: true,
						};
						await this.helpers.httpRequest(options);
						delete webhookData.webhookId;
						return true;
					} catch (error) {
						return false;
					}
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
