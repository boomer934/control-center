import { memo } from 'react';
import Markdown from 'react-markdown';

export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return (
    <Markdown skipHtml disallowedElements={['img', 'a']} unwrapDisallowed>
      {text}
    </Markdown>
  );
});
