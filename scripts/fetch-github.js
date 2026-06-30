/**
 * fetch-github.js
 * 从 GitHub API 拉取用户数据，供博客生成使用
 *
 * 用法: node scripts/fetch-github.js
 * 环境变量: GITHUB_TOKEN (可选，用于 GraphQL 查询 Pinned 仓库)
 */

const GITHUB_USERNAME = 'Galileo01';

async function fetchJSON(url, token) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

/**
 * 获取 Pinned 仓库列表
 * 优先使用 GraphQL API（需要 GITHUB_TOKEN），无 token 时降级为解析 HTML
 * @returns {Promise<string[]>} Pinned 仓库名数组
 */
async function fetchPinnedRepos(token) {
  // 方式一：GraphQL API（需要 token）
  if (token) {
    try {
      const query = {
        query: `query {
          user(login: "${GITHUB_USERNAME}") {
            pinnedItems(first: 6, types: REPOSITORY) {
              nodes { ... on Repository { name } }
            }
          }
        }`,
      };

      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify(query),
      });

      if (!res.ok) {
        console.warn(`  ⚠ GraphQL API failed (${res.status}), falling back to HTML parsing`);
        return fetchPinnedReposFromHTML();
      }

      const data = await res.json();
      if (data.errors) {
        console.warn(`  ⚠ GraphQL errors: ${data.errors.map(e => e.message).join(', ')}, falling back to HTML parsing`);
        return fetchPinnedReposFromHTML();
      }

      const repos = data.data?.user?.pinnedItems?.nodes
        ?.filter(n => n?.name)
        ?.map(n => n.name) || [];

      if (repos.length > 0) {
        console.log(`  → Pinned repos (GraphQL): ${repos.join(', ')}`);
        return repos;
      }
      console.warn('  ⚠ GraphQL returned no pinned repos, falling back to HTML parsing');
      return fetchPinnedReposFromHTML();
    } catch (err) {
      console.warn(`  ⚠ GraphQL error: ${err.message}, falling back to HTML parsing`);
      return fetchPinnedReposFromHTML();
    }
  }

  // 方式二：解析 HTML（无需 token）
  return fetchPinnedReposFromHTML();
}

async function fetchPinnedReposFromHTML() {
  try {
    const res = await fetch(`https://github.com/${GITHUB_USERNAME}`, {
      headers: { Accept: 'text/html' },
    });

    if (!res.ok) {
      console.warn(`  ⚠ HTML page fetch failed (${res.status})`);
      return [];
    }

    const html = await res.text();

    // 从 HTML 中提取 Pinned 仓库名
    // 结构: <span class="repo">repo-name</span>
    const regex = /<span class="repo">([^<]+)<\/span>/g;
    const repos = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      repos.push(match[1]);
    }

    if (repos.length > 0) {
      console.log(`  → Pinned repos (HTML): ${repos.join(', ')}`);
    } else {
      console.log('  → No pinned repos found');
    }
    return repos;
  } catch (err) {
    console.warn(`  ⚠ HTML parsing failed: ${err.message}`);
    return [];
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN || '';
  const outputDir = process.argv[2] || 'scripts/data';

  console.log('Fetching GitHub data for', GITHUB_USERNAME);

  // 1. 用户信息
  const user = await fetchJSON(`https://api.github.com/users/${GITHUB_USERNAME}`, token);
  console.log(`  → User: ${user.name || user.login}`);

  // 2. 仓库列表（按更新时间排序）
  const repos = await fetchJSON(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100&type=all`,
    token
  );
  console.log(`  → Repos: ${repos.length}`);

  // 3. 语言统计
  const langCount = {};
  for (const repo of repos) {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }
  const languages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  console.log(`  → Languages: ${languages.length}`);

  // 4. 近期事件
  let events = [];
  try {
    events = await fetchJSON(
      `https://api.github.com/users/${GITHUB_USERNAME}/events?per_page=30`,
      token
    );
  } catch (e) {
    console.warn('  ⚠ Events fetch failed (may need GITHUB_TOKEN):', e.message);
  }
  console.log(`  → Events: ${events.length}`);

  // 5. Pinned 仓库（GraphQL 优先，HTML 降级）
  const pinnedRepos = await fetchPinnedRepos(token);

  // 构建输出
  const output = {
    fetchedAt: new Date().toISOString(),
    pinnedRepos,
    user: {
      login: user.login,
      name: user.name || user.login,
      avatarUrl: user.avatar_url,
      blog: user.blog,
      location: user.location,
      bio: user.bio,
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following,
      createdAt: user.created_at,
    },
    repos: repos.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: r.topics || [],
      isFork: r.fork,
      url: r.html_url,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })),
    languages,
    totalStars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
    totalForks: repos.reduce((sum, r) => sum + r.forks_count, 0),
    events: events.map((e) => ({
      type: e.type,
      repo: e.repo.name,
      createdAt: e.created_at,
    })),
  };

  const fs = await import('fs');
  const path = await import('path');
  const outPath = path.join(outputDir, 'github-stats.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to ${outPath}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
