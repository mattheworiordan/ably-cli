import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class QueuesCreateCommand extends ControlBaseCommand {
  static description = 'Create a queue'

  static examples = [
    '$ ably queues create --name "my-queue"',
    '$ ably queues create --name "my-queue" --ttl 3600 --max-length 100000',
    '$ ably queues create --name "my-queue" --region "eu-west-1-a" --app "My App"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'name': Flags.string({
      description: 'Name of the queue',
      required: true,
    }),
    'ttl': Flags.integer({
      description: 'Time to live for messages in seconds',
      required: false,
      default: 60,
    }),
    'max-length': Flags.integer({
      description: 'Maximum number of messages in the queue',
      required: false,
      default: 10000,
    }),
    'region': Flags.string({
      description: 'Region for the queue',
      required: false,
      default: 'us-east-1-a',
    }),
    'app': Flags.string({
      description: 'App ID or name to create the queue in',
      required: false,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuesCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const queueData = {
        name: flags.name,
        ttl: flags.ttl,
        maxLength: flags['max-length'],
        region: flags.region,
      }
      
      const createdQueue = await controlApi.createQueue(appId, queueData)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(createdQueue))
      } else {
        this.log('Queue created successfully:')
        this.log(`Queue ID: ${createdQueue.id}`)
        this.log(`Name: ${createdQueue.name}`)
        this.log(`Region: ${createdQueue.region}`)
        this.log(`TTL: ${createdQueue.ttl} seconds`)
        this.log(`Max Length: ${createdQueue.maxLength} messages`)
        this.log(`State: ${createdQueue.state}`)
        
        this.log(`\nAMQP Connection Details:`)
        this.log(`URI: ${createdQueue.amqp.uri}`)
        this.log(`Queue Name: ${createdQueue.amqp.queueName}`)
        
        this.log(`\nSTOMP Connection Details:`)
        this.log(`URI: ${createdQueue.stomp.uri}`)
        this.log(`Host: ${createdQueue.stomp.host}`)
        this.log(`Destination: ${createdQueue.stomp.destination}`)
      }
    } catch (error) {
      this.error(`Error creating queue: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 