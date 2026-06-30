/**
 * generate-projects.js
 * 从 GitHub 统计数据生成项目展示用的 JSON 数据
 *
 * 用法: node scripts/generate-projects.js
 */

import fs from 'fs';
import path from 'path';

const DATA_FILE = 'scripts/data/github-stats.json';
const OUTPUT_FILE = 'src/data/projects.json';

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Data file not found: ${DATA_FILE}`);
    console.error('   Run "node scripts/fetch-github.js" first');
    process.exit(1);
  }

  const stats = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

  const pinnedSet = new Set(stats.pinnedRepos || []);

  // 按 Star 排序，只保留非 fork 或有描述的仓库
  const projects = stats.repos
    .filter((r) => !r.isFork || r.description)
    .sort((a, b) => b.stars - a.stars || new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((r) => ({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      stars: r.stars,
      forks: r.forks,
      topics: r.topics,
      pinned: pinnedSet.has(r.name),
      url: r.url,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));

  const output = {
    fetchedAt: stats.fetchedAt,
    totalProjects: projects.length,
    totalStars: stats.totalStars,
    totalForks: stats.totalForks,
    languages: stats.languages,
    projects,
  };

  const outPath = path.resolve(OUTPUT_FILE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✅ Saved ${projects.length} projects to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
