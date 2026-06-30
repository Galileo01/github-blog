import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';

export interface Project {
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  pinned?: boolean;
  url: string;
  updatedAt: string;
  createdAt: string;
}

interface Props {
  projects: Project[];
}

type SortKey = 'stars' | 'updated';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'stars', label: '⭐ Stars' },
  { key: 'updated', label: '📅 最近更新' },
];

function sortProjects(projects: Project[], sortKey: SortKey): Project[] {
  const sorted = [...projects];

  switch (sortKey) {
    case 'stars':
      return sorted.sort((a, b) => b.stars - a.stars);
    case 'updated':
      return sorted.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }
}

export default function SortableProjectList({ projects }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('stars');

  const sorted = useMemo(() => sortProjects(projects, sortKey), [projects, sortKey]);

  const pinned = projects.filter((p) => p.pinned);

  if (!projects.length) {
    return <p className="text-sm text-muted-foreground">暂无项目数据</p>;
  }

  return (
    <div>
      {/* 排序切换按钮 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {SORT_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            variant={sortKey === opt.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortKey(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* 项目卡片网格 */}
      <div className="grid gap-6 sm:grid-cols-2">
        {sorted.map((project) => (
          <a
            key={project.name}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold tracking-tight group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              {project.pinned && (
                <span className="text-xs text-muted-foreground" title="Pinned">📌</span>
              )}
            </div>
            {project.description && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            )}
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              {project.language && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {project.language}
                </span>
              )}
              <span>⭐ {project.stars}</span>
              {project.pinned && <span>📌 精选</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
