export function extractChatToken(url: string): string | null {
  // Handles:
  //   https://app.sellsquare.io/ai-chat/TOKEN
  //   chatalog://chat/TOKEN
  const match = url.match(/\/ai-chat\/([a-f0-9]+)|\/chat\/([a-f0-9]+)/);
  return match ? match[1] || match[2] : null;
}
