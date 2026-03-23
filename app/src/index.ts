import app from './app'
import { handleQueue } from './handlers/queue'
import { handleScheduled } from './handlers/cron'

export default {
  fetch: app.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>
