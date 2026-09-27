import { loadConfig } from '@/lib/config'
import { ConversationStore } from '@/lib/storage'

/** GET /api/archive — list archived conversations. */
export async function GET() {
  const store = new ConversationStore(loadConfig().dataDir)
  const conversations = await store.listArchived()
  return Response.json({ conversations })
}