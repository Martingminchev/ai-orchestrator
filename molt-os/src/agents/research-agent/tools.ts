import { fetch } from 'undici';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface FetchPageResult {
  success: boolean;
  content?: string;
  metadata?: {
    title: string;
    links: string[];
    images: string[];
    description?: string;
    headings?: Record<string, string[]>;
  };
  error?: string;
}

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
}

export interface ExtractedLink {
  url: string;
  text: string;
  type: 'internal' | 'external' | 'media';
  rel?: string;
}

export interface ExtractLinksResult {
  links: ExtractedLink[];
}

export interface InformationMatch {
  text: string;
  context: string;
  position: number;
}

export interface FindInformationResult {
  matches: InformationMatch[];
}

const RATE_LIMIT_DELAY = 1000;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

async function duckduckgoSearch(query: string, numResults: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;

    await rateLimit();
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`);
    }

    const html = await response.text();

    const snippetRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]*)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)<\/a>/gi;

    let match;
    while ((match = snippetRegex.exec(html)) !== null && results.length < numResults) {
      const url = match[1];
      const titleMatch = html.substring(match.index).match(/result__a[^>]*>([^<]*)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const snippet = match[2].replace(/<[^>]*>/g, '').trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          url,
          snippet,
          source: 'duckduckgo',
        });
      }
    }

    if (results.length === 0) {
      const fallbackRegex = /<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      while ((match = fallbackRegex.exec(html)) !== null && results.length < numResults) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (url.startsWith('http') && title && !title.includes('html') && title.length > 3) {
          results.push({
            title,
            url,
            snippet: '',
            source: 'duckduckgo',
          });
        }
      }
    }
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
  }

  return results;
}

async function braveSearch(query: string, numResults: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return results;
  }

  try {
    await rateLimit();
    const response = await fetch(`https://api.search.brave.com/v1/search?q=${encodeURIComponent(query)}&count=${numResults}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status}`);
    }

    const data = await response.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };

    if (data.web?.results) {
      for (const result of data.web.results) {
        results.push({
          title: result.title,
          url: result.url,
          snippet: result.description,
          source: 'brave',
        });
      }
    }
  } catch (error) {
    console.error('Brave search error:', error);
  }

  return results;
}

export async function webSearch(input: {
  query: string;
  numResults?: number;
  type?: string;
}): Promise<WebSearchResult[]> {
  const numResults = input.numResults || 10;

  if (input.type === 'brave' && process.env.BRAVE_SEARCH_API_KEY) {
    const braveResults = await braveSearch(input.query, numResults);
    if (braveResults.length > 0) {
      return braveResults;
    }
  }

  return duckduckgoSearch(input.query, numResults);
}

export async function fetchPage(input: {
  url: string;
  extractText?: boolean;
}): Promise<FetchPageResult> {
  try {
    await rateLimit();
    const response = await fetch(input.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      maxRedirections: 10,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        success: false,
        error: `Unsupported content type: ${contentType}`,
      };
    }

    const html = await response.text();
    return parseHtml(html, input.extractText ?? true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to fetch page: ${message}`,
    };
  }
}

function parseHtml(html: string, extractText: boolean): FetchPageResult {
  const result: FetchPageResult = {
    success: true,
    content: '',
    metadata: {
      title: '',
      links: [],
      images: [],
    },
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  result.metadata!.title = titleMatch ? titleMatch[1].trim() : '';

  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
                   html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  result.metadata!.description = metaDesc ? metaDesc[1].trim() : '';

  const linkRegex = /<a[^>]+href=["']([^"']*)["'][^>]*>/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      if (!links.includes(href)) {
        links.push(href);
      }
    }
  }
  result.metadata!.links = links;

  const imgRegex = /<img[^>]+src=["']([^"']*)["'][^>]*>/gi;
  const images: string[] = [];
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !images.includes(src)) {
      images.push(src);
    }
  }
  result.metadata!.images = images;

  const headingRegex = /<h([1-6])[^>]*>([^<]*)<\/h[1-6]>/gi;
  const headings: Record<string, string[]> = {};
  while ((match = headingRegex.exec(html)) !== null) {
    const level = match[1];
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    if (text) {
      if (!headings[`h${level}`]) {
        headings[`h${level}`] = [];
      }
      headings[`h${level}`].push(text);
    }
  }
  result.metadata!.headings = headings;

  if (extractText) {
    result.content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)))
      .trim();
  }

  return result;
}

function extractiveSummarize(content: string, targetLength: number): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) {
    return content.substring(0, targetLength * 5) + (content.length > targetLength * 5 ? '...' : '');
  }

  const wordFrequencies: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also']);

  const words = content.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/);
  for (const word of words) {
    if (!stopWords.has(word) && word.length > 2) {
      wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
    }
  }

  const sentenceScores: { sentence: string; score: number }[] = [];
  for (const sentence of sentences) {
    const sentenceWords = sentence.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/);
    let score = 0;
    for (const word of sentenceWords) {
      score += wordFrequencies[word] || 0;
    }
    sentenceScores.push({ sentence: sentence.trim(), score: score / Math.max(sentenceWords.length, 1) });
  }

  sentenceScores.sort((a, b) => b.score - a.score);

  let summary = '';
  let currentLength = 0;
  for (const { sentence } of sentenceScores) {
    if (currentLength + sentence.length <= targetLength * 5) {
      summary += (summary ? '. ' : '') + sentence;
      currentLength += sentence.length + 2;
    }
    if (currentLength >= targetLength * 5) break;
  }

  return summary + (summary && summary.length < content.length ? '...' : '');
}

function extractKeyPoints(content: string): string[] {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length < 3) {
    return sentences.map(s => s.trim());
  }

  const wordFrequencies: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'this', 'that', 'these', 'those']);

  const words = content.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/);
  for (const word of words) {
    if (!stopWords.has(word) && word.length > 3) {
      wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
    }
  }

  const scoredSentences: { sentence: string; score: number }[] = [];
  for (const sentence of sentences) {
    const sentenceWords = sentence.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/);
    let score = 0;
    let importantWordCount = 0;
    for (const word of sentenceWords) {
      score += wordFrequencies[word] || 0;
      if ((wordFrequencies[word] || 0) > 1) {
        importantWordCount++;
      }
    }
    scoredSentences.push({
      sentence: sentence.trim(),
      score: score + importantWordCount * 0.5,
    });
  }

  scoredSentences.sort((a, b) => b.score - a.score);

  return scoredSentences.slice(0, 5).map(s => s.sentence);
}

async function kimiSummarize(content: string, length: 'short' | 'medium' | 'long'): Promise<SummarizeResult> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const lengthConfig = {
    short: { maxTokens: 200, targetLength: 50 },
    medium: { maxTokens: 500, targetLength: 200 },
    long: { maxTokens: 1000, targetLength: 500 },
  };

  const config = lengthConfig[length];
  const maxChunkLength = 8000;

  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxChunkLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  let combinedSummary = '';
  const allKeyPoints: string[] = [];

  for (const chunk of chunks) {
    try {
      await rateLimit();
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            {
              role: 'system',
              content: `请用中文总结以下文本。提供一段简洁的总结（${config.targetLength}字以内），并列出3-5个关键点。格式：总结：... 关键点：1. ... 2. ...`,
            },
            {
              role: 'user',
              content: chunk.substring(0, maxChunkLength),
            },
          ],
          max_tokens: config.maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Kimi API failed: ${response.status}`);
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const chunkSummary = data.choices?.[0]?.message?.content || '';

      combinedSummary += (combinedSummary ? '\n\n' : '') + chunkSummary;
    } catch (error) {
      console.error('Kimi summarization error:', error);
      throw error;
    }
  }

  const keyPointsMatch = combinedSummary.match(/关键点：([\s\S]*)$/);
  if (keyPointsMatch) {
    const points = keyPointsMatch[1]
      .split(/\d+\.\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
    allKeyPoints.push(...points);
  }

  const summaryMatch = combinedSummary.match(/总结：([\s\S]*?)(?=关键点：|$)/);
  const finalSummary = summaryMatch ? summaryMatch[1].trim() : combinedSummary;

  return {
    summary: finalSummary.substring(0, config.targetLength * 3),
    keyPoints: [...new Set(allKeyPoints)].slice(0, 5),
  };
}

export async function summarize(input: {
  content: string;
  length?: 'short' | 'medium' | 'long';
}): Promise<SummarizeResult> {
  const length = input.length || 'medium';

  try {
    return await kimiSummarize(input.content, length);
  } catch {
    const lengthConfig = {
      short: 50,
      medium: 200,
      long: 500,
    };
    const targetLength = lengthConfig[length];

    return {
      summary: extractiveSummarize(input.content, targetLength),
      keyPoints: extractKeyPoints(input.content),
    };
  }
}

export async function extractLinks(input: {
  content: string;
  types?: string[];
}): Promise<{ links: Array<{ url: string; text: string; type: string }> }> {
  const links: ExtractedLink[] = [];

  const aRegex = /<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = aRegex.exec(input.content)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]*>/g, '').trim();

    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      continue;
    }

    let type: 'internal' | 'external' | 'media' = 'external';
    let normalizedHref = href;

    if (href.startsWith('//')) {
      normalizedHref = 'https:' + href;
    } else if (href.startsWith('/')) {
      type = 'internal';
    } else if (!href.startsWith('http')) {
      type = 'internal';
    }

    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mp3', '.wav', '.pdf'];
    const ext = mediaExtensions.find(e => href.toLowerCase().endsWith(e));
    if (ext) {
      type = 'media';
    }

    const relMatch = match[0].match(/rel=["']([^"']*)["']/i);
    const rel = relMatch ? relMatch[1] : undefined;

    links.push({
      url: normalizedHref,
      text: text || href,
      type,
      rel,
    });
  }

  const imgRegex = /<img[^>]+src=["']([^"']*)["'][^>]*>/gi;
  while ((match = imgRegex.exec(input.content)) !== null) {
    const src = match[1];
    if (src) {
      links.push({
        url: src.startsWith('//') ? 'https:' + src : src,
        text: 'Image',
        type: 'media',
      });
    }
  }

  const seen = new Set<string>();
  const uniqueLinks: ExtractedLink[] = [];
  for (const link of links) {
    if (!seen.has(link.url)) {
      seen.add(link.url);
      uniqueLinks.push(link);
    }
  }

  const filteredLinks = input.types
    ? uniqueLinks.filter(link => input.types!.includes(link.type))
    : uniqueLinks;

  return { links: filteredLinks };
}

export async function findInformation(input: {
  content: string;
  query: string;
  context?: number;
}): Promise<{ matches: Array<{ text: string; context: string; position: number }> }> {
  const matches: InformationMatch[] = [];
  const contextSize = input.context || 100;
  const queryLower = input.query.toLowerCase();
  const contentLower = input.content.toLowerCase();

  let position = 0;
  while (true) {
    const index = contentLower.indexOf(queryLower, position);
    if (index === -1) {
      break;
    }

    const start = Math.max(0, index - contextSize);
    const end = Math.min(input.content.length, index + input.query.length + contextSize);

    let context = input.content.slice(start, end);
    if (start > 0) {
      context = '...' + context;
    }
    if (end < input.content.length) {
      context = context + '...';
    }

    matches.push({
      text: input.content.slice(index, index + input.query.length),
      context,
      position: index,
    });

    position = index + 1;
    if (matches.length >= 100) {
      break;
    }
  }

  return { matches };
}
