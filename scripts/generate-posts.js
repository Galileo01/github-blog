/**
 * generate-posts.js
 * 读取 GitHub 统计数据，调用 Claude API 生成博客文章
 *
 * 用法: node scripts/generate-posts.js [articleType] [count]
 * 环境变量: ANTHROPIC_API_KEY (必需)
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'src/content/blog';
const DATA_FILE = 'scripts/data/github-stats.json';

function generatePrompt(stats, articleType) {
  const repoList = stats.repos
    .filter((r) => !r.isFork)
    .slice(0, 10)
    .map((r) => `  - ${r.name}${r.description ? ': ' + r.description : ''} (${r.language || 'N/A'}, ⭐${r.stars})`)
    .join('\n');

  const langSummary = stats.languages
    .slice(0, 8)
    .map((l) => `  - ${l.name}: ${l.count} 个仓库`)
    .join('\n');

  const prompts = {
    'weekly': `写一篇 GitHub 周报风格的博客文章，总结最近的技术动态。`,
    'project': `从以下项目中选一个最有意思的，写一篇项目深挖文章：\n${repoList}`,
    'tech-stack': `分析我的技术栈演变趋势：\n${langSummary}\n\n写一篇技术栈分析文章。`,
  };

  const typeInstruction = prompts[articleType] || `根据以下 GitHub 数据，选择最合适的主题（周报/项目深挖/技术栈分析），写一篇博客文章。`;

  return `你是一个技术博客作者。请根据以下 GitHub 用户数据，${typeInstruction}

用户信息：
- 名称: ${stats.user.name}
- 简介: ${stats.user.bio || '无'}
- 总仓库数: ${stats.user.publicRepos}
- 总 Star 数: ${stats.totalStars}
- 总 Fork 数: ${stats.totalForks}

近期活跃仓库（非 fork）：
${repoList}

技术栈分布：
${langSummary}

要求：
1. 输出为 Markdown 格式，包含 frontmatter (title, description, date, tags)
2. 标题醒目，中文内容
3. 字数 800-1500 字
4. tags 至少包含 2 个相关标签
5. date 使用今天日期: ${new Date().toISOString().split('T')[0]}
6. 内容要有技术深度，避免泛泛而谈
7. 在文章末尾添加 "---" 分隔线，线后加一句个人签名

请直接输出完整 Markdown 内容。`;
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', // 实惠且质量高
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

function savePost(markdown) {
  // 从 frontmatter 提取 title 作为文件名
  const titleMatch = markdown.match(/^---\s*\n[\s\S]*?^title:\s*"(.+?)"\s*$/m);
  const dateMatch = markdown.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m);

  const title = titleMatch ? titleMatch[1] : 'untitled';
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  // 中文标题转拼音缩略 + 日期
  const slug = `${date}-${title.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}`;
  const filename = `${slug}.md`;

  const filepath = path.join(OUTPUT_DIR, filename);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, markdown, 'utf-8');
  console.log(`  ✅ Saved: ${filename}`);
  return filename;
}

async function main() {
  const articleType = process.argv[2] || 'auto';
  const count = parseInt(process.argv[3] || '1', 10);

  // 读取数据
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Data file not found: ${DATA_FILE}`);
    console.error('   Run "node scripts/fetch-github.js" first');
    process.exit(1);
  }

  const stats = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`Generating ${count} post(s) (type: ${articleType})...\n`);

  for (let i = 0; i < count; i++) {
    console.log(`\n[${i + 1}/${count}] Calling Claude API...`);
    const prompt = generatePrompt(stats, articleType);
    try {
      const content = await callClaude(prompt);
      savePost(content);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
  }

  console.log('\n✅ Done!');
}

main();
