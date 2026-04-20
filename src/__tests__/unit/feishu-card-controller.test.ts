import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinalMarkdownElements,
  buildStreamingMarkdownPreview,
} from '../../lib/channels/feishu/card-controller';

describe('buildStreamingMarkdownPreview', () => {
  it('keeps plain markdown untouched', () => {
    const input = 'Hello\n\nThis is a plain reply.';
    assert.equal(buildStreamingMarkdownPreview(input), input);
  });

  it('replaces complete fenced code blocks with a placeholder', () => {
    const input = [
      'Here is code:',
      '',
      '```ts',
      'console.log("hello");',
      '```',
      '',
      'And here is the summary.',
    ].join('\n');

    const preview = buildStreamingMarkdownPreview(input);

    assert.match(preview, /代码块生成中/);
    assert.doesNotMatch(preview, /console\.log/);
    assert.match(preview, /And here is the summary\./);
  });

  it('hides incomplete fenced code blocks until streaming finishes', () => {
    const input = [
      'Let me draft this:',
      '',
      '```python',
      'print("hello")',
    ].join('\n');

    const preview = buildStreamingMarkdownPreview(input);

    assert.match(preview, /代码块生成中/);
    assert.doesNotMatch(preview, /print\("hello"\)/);
  });
});

describe('buildFinalMarkdownElements', () => {
  it('splits mixed text and code into markdown and collapsible panel elements', () => {
    const input = [
      'Before code',
      '',
      '```ts',
      'console.log("hello");',
      '```',
      '',
      'After code',
    ].join('\n');

    const elements = buildFinalMarkdownElements(input);

    assert.equal(elements.length, 3);
    assert.equal(elements[0].tag, 'markdown');
    assert.equal(elements[1].tag, 'collapsible_panel');
    assert.equal(elements[2].tag, 'markdown');

    const panel = elements[1] as unknown as {
      header: { title: { content: string } };
      elements: Array<{ tag: string; content: string }>;
    };

    assert.equal(panel.header.title.content, '查看代码');
    assert.equal(panel.elements[0].tag, 'markdown');
    assert.match(panel.elements[0].content, /```ts/);
    assert.match(panel.elements[0].content, /console\.log\("hello"\);/);
  });

  it('creates one collapsible panel per code block', () => {
    const input = [
      '```js',
      'console.log(1);',
      '```',
      '',
      '```py',
      'print(2)',
      '```',
    ].join('\n');

    const elements = buildFinalMarkdownElements(input);

    assert.equal(elements.length, 2);
    assert.equal(elements[0].tag, 'collapsible_panel');
    assert.equal(elements[1].tag, 'collapsible_panel');

    const secondPanel = elements[1] as unknown as {
      header: { title: { content: string } };
    };
    assert.equal(secondPanel.header.title.content, '查看代码 2');
  });
});
