#!/usr/bin/env node
const lastMessage = process.env.AI_LAST_MESSAGE || '';

if (!lastMessage) {
  console.log('No AI response received');
  process.exit(0);
}

const keywords = ['file', 'directory', 'hello', 'hi', 'test', 'workflow', '.md', '.py', '.js'];
const hasKeyword = keywords.some((k) => lastMessage.toLowerCase().includes(k.toLowerCase()));

if (hasKeyword) {
  console.log('true');
} else {
  console.log(`Expected keywords but got: ${lastMessage.slice(0, 200)}...`);
}
