'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Renders assistant message content as GitHub-flavored Markdown. */
function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown" data-testid="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)