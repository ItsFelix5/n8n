/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@n8n/backend-common';
import { EventEntity, EventRepository, WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { ErrorReporter, WebhookContext } from 'n8n-core';
import {
	Node,
	IWebhookData,
	IWebhookResponseData,
	IWorkflowExecutionDataProcess,
	ensureError,
	INodeType,
	Workflow,
} from 'n8n-workflow';

import { ActiveExecutions } from '@/active-executions';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { WebhookNotFoundError } from '@/errors/response-errors/webhook-not-found.error';
import { parseBody } from '@/middlewares';
import { NodeTypes } from '@/node-types';
import { CacheService } from '@/services/cache/cache.service';
import { WaitTracker } from '@/wait-tracker';
import * as WebhookHelpers from '@/webhooks/webhook-helpers';
import * as WorkflowExecuteAdditionalData from '@/workflow-execute-additional-data';
import { WorkflowRunner } from '@/workflow-runner';
import { WorkflowStaticDataService } from '@/workflows/workflow-static-data.service';

@Service()
export class EventHandler {
	constructor(
		private readonly logger: Logger,
		private readonly nodeTypes: NodeTypes,
		private readonly workflowRepository: WorkflowRepository,
		private readonly eventRepository: EventRepository,
		private readonly workflowStaticDataService: WorkflowStaticDataService,
		private readonly cacheService: CacheService,
		private readonly errorReporter: ErrorReporter,
		private readonly workflowRunner: WorkflowRunner,
		private readonly activeExecutions: ActiveExecutions,
		private readonly waitTracker: WaitTracker,
	) {}

	async execute(request: Request & { params: { path: string } }, response: Response) {
		await parseBody(request);

		if (!request.body?.type) {
			response.status(400).end();
			return;
		}
		if (request.body.type === 'url_verification') {
			// TODO validate
			response.status(200).json({ challenge: request.body.challenge }).end();
			return;
		}

		let path = request.params.path;
		if (Array.isArray(path)) path = path.join('/');
		if (path.endsWith('/')) path = path.slice(0, -1);

		this.logger.debug(`Received event for path "${path}"`);

		let handler: EventEntity | null = null;
		try {
			const cached = await this.cacheService.get('event:' + path);
			if (cached) handler = this.eventRepository.create(cached);
		} catch (error) {
			this.logger.warn('Failed to query webhook cache', {
				error: ensureError(error).message,
			});
			handler = null;
		}

		if (!handler) {
			handler = await this.eventRepository.findOneBy({ path });

			if (handler) {
				try {
					await this.cacheService.set('event:' + path, handler);
				} catch (error) {
					this.logger.warn('Failed to cache webhook', {
						error: ensureError(error).message,
					});
				}
			}
		}

		if (handler === null) throw new WebhookNotFoundError({ path }, { hint: 'production' });

		Object.entries(handler.usages).forEach(async ([workflowId, triggers]) => {
			const workflowData = await this.workflowRepository.findOne({
				where: { id: workflowId },
				relations: {
					activeVersion: true,
					shared: { project: { projectRelations: true } },
				},
			});

			if (workflowData === null)
				throw new NotFoundError(`Could not find workflow with id "${workflowId}"`);

			if (!workflowData.activeVersion)
				throw new NotFoundError(`Active version not found for workflow with id "${workflowId}"`);

			const { nodes, connections } = workflowData.activeVersion;

			const workflow = new Workflow({
				id: workflowId,
				name: workflowData.name,
				nodes,
				connections,
				active: workflowData.activeVersionId !== null,
				nodeTypes: this.nodeTypes,
				staticData: workflowData.staticData,
				settings: workflowData.settings,
			});
			const projectId = workflowData.shared.find((share) => share.role === 'workflow:owner')
				?.project.id;
			const additionalData = await WorkflowExecuteAdditionalData.getBase({
				projectId,
				workflowId,
			});
			additionalData.httpRequest = request;

			const credentials = await additionalData.credentialsHelper.getDecrypted(
				additionalData,
				{ name: 'idk :(', id: path },
				'slackApi',
				'webhook',
				undefined,
				false,
				undefined,
			);
			if (credentials?.signatureSecret && typeof credentials.signatureSecret === 'string') {
				const signature = request.header('x-slack-signature');
				const timestamp = request.header('x-slack-request-timestamp');
				if (!signature || !timestamp) return;
				const currentTime = Math.floor(Date.now() / 1000);
				const timestampNum = parseInt(timestamp);
				if (isNaN(timestampNum) || Math.abs(currentTime - timestampNum) > 60 * 5) return;
				const hmac = createHmac('sha256', credentials.signatureSecret)
					.update(`v0:${timestamp}:`)
					.update(
						Buffer.isBuffer(request.rawBody) || typeof request.rawBody === 'string'
							? request.rawBody
							: JSON.stringify(request.rawBody),
					);
				const computedBuffer = Buffer.from('v0=' + hmac.digest('hex'));
				const providedBuffer = Buffer.from(signature);
				if (
					computedBuffer.length !== providedBuffer.length ||
					!timingSafeEqual(computedBuffer, providedBuffer)
				)
					return;
			}

			triggers.forEach(async (trigger) => {
				const node = workflow.getNode(trigger);
				if (node === null) {
					this.logger.warn(
						`The node "${trigger}" could not be found in workflow "${workflowData.name}" (${workflowData.id})`,
					);
					return;
				}
				const nodeType = this.nodeTypes.getByName(node.type) as INodeType;

				const webhookData = {
					httpMethod: 'POST',
					node: trigger,
					path,
					webhookDescription: {
						name: 'default',
						httpMethod: 'POST',
						responseMode: 'onReceived',
						path: 'event',
					},
					workflowId,
					workflowExecuteAdditionalData: additionalData,
				} as IWebhookData;

				const context = new WebhookContext(
					workflow,
					node,
					additionalData,
					'webhook',
					webhookData,
					[],
					null,
				);
				const triggers = context.getNodeParameter('trigger', []) as string[];
				if (!triggers.includes(request.body.event?.type as string)) return;

				let runExecutionDataMerge = {};
				// Run the webhook function to see what should be returned and if
				// the workflow should be executed or not
				let webhookResultData: IWebhookResponseData;

				try {
					webhookResultData =
						nodeType instanceof Node
							? await nodeType.webhook!(context)
							: ((await nodeType.webhook!.call(context)) as IWebhookResponseData);
				} catch (e) {
					this.errorReporter.error(e, {
						extra: {
							nodeName: node.name,
							nodeType: node.type,
							nodeVersion: node.typeVersion,
							workflowId: workflow.id,
						},
					});

					// Add error to execution data that it can be logged and send to Editor-UI
					runExecutionDataMerge = {
						resultData: {
							runData: {},
							lastNodeExecuted: node.name,
							error: {
								...e,
								message: e.message,
								stack: e.stack,
							},
						},
					};

					webhookResultData = {
						noWebhookResponse: true,
						// Add empty data that it at least tries to "execute" the webhook
						// which then so gets the chance to throw the error.
						workflowData: [[{ json: {} }]],
					};
				}

				if (webhookResultData.workflowData === undefined) return;

				// Prepare execution data
				const { runExecutionData, pinData } = WebhookHelpers.prepareExecutionData(
					'webhook',
					node,
					webhookResultData,
					undefined,
					runExecutionDataMerge,
					undefined,
					undefined,
					workflowData,
				);

				const runData: IWorkflowExecutionDataProcess = {
					executionMode: 'webhook',
					executionData: runExecutionData,
					workflowData,
					pinData,
					projectId,
				};

				// When resuming from a wait node, copy over the pushRef from the execution-data
				runData.pushRef ??= runExecutionData.pushRef;
				// Start now to run the workflow
				const executionId = await this.workflowRunner.run(
					runData,
					true,
					false,
					undefined,
					undefined,
				);

				this.logger.debug(
					`Started execution of workflow "${workflow.name}" from webhook with execution ID ${executionId}`,
					{ executionId },
				);

				const { parentExecution } = runExecutionData;
				if (
					parentExecution &&
					(parentExecution.shouldResume === undefined || parentExecution.shouldResume)
				) {
					// on child execution completion, resume parent execution
					void this.activeExecutions.getPostExecutePromise(executionId).then(() => {
						void this.waitTracker.startExecution(parentExecution.executionId);
					});
				}
				await this.workflowStaticDataService.saveStaticData(workflow);
			});
		});
		response.end();
	}
}
