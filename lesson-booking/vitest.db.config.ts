import { defineConfig } from 'vitest/config';

/**
 * 実 PostgreSQL + PostgREST で、既存のテストスイートを Supabase リポジトリ実装に対して実行する。
 * テストは同じデータベースを使うため、ファイル間も直列に実行する。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test-db/**/*.test.ts'],
    globalSetup: ['test-db/globalSetup.ts'],
    env: { TEST_REPOS: 'supabase' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
