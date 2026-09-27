import ChatView from '@/components/ChatView'
import { loadConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export default function Page() {
  const config = loadConfig()
  return <ChatView defaultModel={config.model} contextWindow={config.contextWindow} />
}