it('should handle empty metadata block', () => {
  const content = `---
---

This is the prompt content.`;

  const result = parseMetadata(content);

  expect(result.metadata).toEqual({});
  // The function should remove the metadata block from the content
  expect(result.content).toBe('\nThis is the prompt content.');
}); 