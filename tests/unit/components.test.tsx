import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Composer from '@/components/Composer'
import ContextMeter from '@/components/ContextMeter'
import MessageItem from '@/components/MessageItem'
import Sidebar from '@/components/Sidebar'
import type { ConversationMeta } from '@/types'

describe('MessageItem', () => {
  it('renders user messages as bubbles', () => {
    render(<MessageItem message={{ role: 'user', content: 'Hi there' }} />)
    expect(screen.getByText('Hi there')).toBeInTheDocument()
    expect(document.querySelector('.message.user')).not.toBeNull()
  })

  it('renders assistant markdown (bold, headings, code, links)', () => {
    render(
      <MessageItem
        message={{
          role: 'assistant',
          content: '**bold**\n\n# Heading\n\n```js\nconst x = 1\n```\n\n[link](https://example.com)',
        }}
      />,
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'link' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders thinking and tool calls for assistant messages', () => {
    render(
      <MessageItem
        message={{
          role: 'assistant',
          content: 'done',
          thinking: 'internal reasoning',
          tool_calls: [
            { function: { name: 'web_search', arguments: { query: 'cats' } } },
            { function: { name: 'get_current_datetime', arguments: {} } },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('thinking-block')).toHaveTextContent('internal reasoning')
    const chips = screen.getByTestId('tool-calls-block')
    expect(chips).toHaveTextContent('web_search')
    expect(chips).toHaveTextContent('get_current_datetime')
  })

  it('renders tool results with the tool name', () => {
    render(<MessageItem message={{ role: 'tool', content: '{"results":[]}', tool_name: 'web_fetch' }} />)
    expect(screen.getByTestId('tool-result-block')).toHaveTextContent('web_fetch')
    expect(screen.getByTestId('tool-result-block')).toHaveTextContent('{"results":[]}')
  })

  it('shows a streaming cursor for empty in-flight assistant messages', () => {
    render(<MessageItem message={{ role: 'assistant', content: '' }} streaming />)
    expect(screen.getByLabelText('streaming')).toBeInTheDocument()
  })
})

describe('ContextMeter', () => {
  it('shows the used fraction and percentage', () => {
    render(
      <ContextMeter
        usage={{ usedTokens: 13107, contextWindow: 131072, percent: 10, level: 'ok' }}
      />,
    )
    const meter = screen.getByTestId('context-meter')
    expect(meter).toHaveTextContent('13k / 128k')
    expect(meter).toHaveTextContent('10%')
    expect(meter.className).toContain('ok')
  })

  it('uses warn/danger styling at high usage', () => {
    const warn = render(
      <ContextMeter usage={{ usedTokens: 70000, contextWindow: 131072, percent: 53.4, level: 'warn' }} />,
    )
    expect(screen.getByTestId('context-meter').className).toContain('warn')
    warn.unmount()

    render(
      <ContextMeter usage={{ usedTokens: 120000, contextWindow: 131072, percent: 91.6, level: 'danger' }} />,
    )
    expect(screen.getByTestId('context-meter').className).toContain('danger')
  })
})

describe('Sidebar', () => {
  const conversations: ConversationMeta[] = [
    {
      id: 'a'.repeat(32),
      title: 'First chat',
      model: 'm',
      system_prompt: '',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    },
    {
      id: 'b'.repeat(32),
      title: 'Second chat',
      model: 'm',
      system_prompt: '',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-03T00:00:00Z',
    },
  ]

  it('lists conversations and highlights the active one', () => {
    const onSelect = vi.fn()
    render(
      <Sidebar
        conversations={conversations}
        archived={[]}
        activeId={conversations[0].id}
        onSelect={onSelect}
        onNew={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
      />,
    )
    expect(screen.getByText('First chat')).toBeInTheDocument()
    expect(screen.getByTestId(`conversation-${'a'.repeat(32)}`).className).toContain('active')
    fireEvent.click(screen.getByText('Second chat'))
    expect(onSelect).toHaveBeenCalledWith('b'.repeat(32))
  })

  it('fires new/archive/unarchive actions', () => {
    const onNew = vi.fn()
    const onArchive = vi.fn()
    const onUnarchive = vi.fn()
    const archived: ConversationMeta[] = [{ ...conversations[0], id: 'c'.repeat(32), title: 'Old chat' }]
    render(
      <Sidebar
        conversations={conversations}
        archived={archived}
        activeId={null}
        onSelect={vi.fn()}
        onNew={onNew}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
      />,
    )

    fireEvent.click(screen.getByText('+ New conversation'))
    expect(onNew).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Archive First chat'))
    expect(onArchive).toHaveBeenCalledWith('a'.repeat(32))

    fireEvent.click(screen.getByLabelText('Restore Old chat'))
    expect(onUnarchive).toHaveBeenCalledWith('c'.repeat(32))
  })
})

describe('Composer', () => {
  function setup(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
    const props = {
      value: '',
      onChange: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
      think: false,
      onThinkChange: vi.fn(),
      tools: true,
      onToolsChange: vi.fn(),
      streaming: false,
      ...overrides,
    }
    render(<Composer {...props} />)
    return props
  }

  it('disables the send button without input', () => {
    const onSend = vi.fn()
    setup({ value: '', onSend })
    expect(screen.getByTestId('send-button')).toBeDisabled()
  })

  it('invokes onSend when the send button is clicked with input', () => {
    const onSend = vi.fn()
    setup({ value: 'hello', onSend })
    fireEvent.click(screen.getByTestId('send-button'))
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('toggles thinking and web tools', () => {
    const onThinkChange = vi.fn()
    const onToolsChange = vi.fn()
    setup({ onThinkChange, onToolsChange })
    fireEvent.click(screen.getByTestId('think-toggle'))
    fireEvent.click(screen.getByTestId('tools-toggle'))
    expect(onThinkChange).toHaveBeenCalledWith(true)
    expect(onToolsChange).toHaveBeenCalledWith(false)
  })

  it('swaps Send for Stop while streaming', () => {
    const onStop = vi.fn()
    setup({ streaming: true, onStop })
    fireEvent.click(screen.getByTestId('stop-button'))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('send-button')).toBeNull()
  })

  it('sends on Enter (without shift) via the textarea', () => {
    const onSend = vi.fn()
    setup({ value: 'hi', onSend })
    fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter', shiftKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})