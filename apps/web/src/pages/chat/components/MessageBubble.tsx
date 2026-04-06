import type { ChatMessage } from '@datamaster/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';

function processWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    return `[${label ?? target}](#/wiki/${target})`;
  });
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const navigate = useNavigate();
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 px-4 md:px-6 py-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
          D
        </div>
      )}

      <div
        className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? 'rounded-2xl rounded-br-md bg-[var(--color-accent)] text-white'
            : 'rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="chat-markdown break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-2 text-[var(--color-text-primary)]">{children}</h1>,
                h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-3 mb-2 text-[var(--color-text-primary)]">{children}</h2>,
                h3: ({ children }) => <h3 className="text-[14px] font-semibold mt-3 mb-1.5 text-[var(--color-text-primary)]">{children}</h3>,
                h4: ({ children }) => <h4 className="text-[13px] font-semibold mt-2 mb-1 text-[var(--color-text-primary)]">{children}</h4>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-[13px]">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
                code: ({ className, children, ...props }) => {
                  if (!className) return <code className="rounded bg-[var(--color-surface-0)] px-1 py-0.5 text-[12px] font-mono" {...props}>{children}</code>;
                  return (
                    <pre className="rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border)] p-3 my-2 overflow-x-auto">
                      <code className={`${className} text-[12px] font-mono`} {...props}>{children}</code>
                    </pre>
                  );
                },
                blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--color-accent)] pl-3 my-2 text-[var(--color-text-muted)] italic">{children}</blockquote>,
                table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-[12px] border-collapse">{children}</table></div>,
                th: ({ children }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-0)] px-2 py-1.5 text-left font-medium">{children}</th>,
                td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-2 py-1.5">{children}</td>,
                a: ({ href, children }) => {
                  if (href?.startsWith('#/wiki/')) {
                    const target = href.replace('#/wiki/', '');
                    return (
                      <button
                        onClick={() => navigate(`/wiki/${target}`)}
                        className="text-[var(--color-accent)] hover:underline font-medium inline"
                      >
                        {children}
                      </button>
                    );
                  }
                  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{children}</a>;
                },
              }}
            >
              {processWikilinks(message.content)}
            </ReactMarkdown>
          </div>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {message.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-3 py-2 text-xs"
              >
                <span className="font-medium text-[var(--color-text-secondary)]">{tool.name}</span>
                {tool.result && (
                  <pre className="mt-1.5 max-h-32 overflow-auto text-[11px] text-[var(--color-text-muted)] font-mono">
                    {tool.result.substring(0, 500)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-3)] text-xs font-medium text-[var(--color-text-secondary)]">
          U
        </div>
      )}
    </div>
  );
}
