import ReactMarkdown from "react-markdown"

/**
 * Renders organizer-written markdown. Raw HTML is never rendered (the
 * react-markdown default), unsafe link protocols are dropped by its default
 * urlTransform, and images are left out so a story cannot load third-party
 * trackers; links open as user content.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-4 leading-relaxed text-gray-800 [&_a]:text-brand-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
      <ReactMarkdown
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children: label }) => (
            <a href={href} rel="nofollow ugc noopener noreferrer" target="_blank">
              {label}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
