import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMusicXmlFile } from './parseMusicXml';
import { toInternalMovement } from './toInternalFormat';
import { movementMeasureCount } from '../../src/audio/measureMap';
import type { MovementData, WorkMeta, WorksIndex } from '../../src/types/music';

/**
 * content/musicxml/<work-id>/<movement-id>.musicxml を読み込み、
 * public/data/works/<work-id>/<movement-id>.json (楽章の全音符データ)と
 * public/data/works/index.json (作品・楽章一覧の軽量メタ情報)を生成する。
 *
 * 曲を追加する運営者向けの規約:
 * - content/musicxml/<work-id>/ フォルダを作り、楽章ごとに .musicxml を置く
 * - work-id は URLセーフなslug(例: dona-nobis-pacem)
 * - movement-id はファイル名から拡張子を除いたもの(例: round)
 * - 作品名・作曲者はディレクトリごとの meta.json で上書きできる(無ければMusicXMLのwork-titleを使用)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, '../../content/musicxml');
const OUTPUT_DIR = resolve(__dirname, '../../public/data/works');

interface WorkOverrideMeta {
  title?: string;
  composer?: string;
  /** 作曲家の生年(時代順ソート用)。分からない場合は省略してよい */
  composerSortKey?: number;
}

function listWorkDirs(): string[] {
  return readdirSync(CONTENT_DIR).filter((name) => {
    if (name.startsWith('_')) return false; // _fixtures 等は収録対象外
    return statSync(join(CONTENT_DIR, name)).isDirectory();
  });
}

function loadWorkOverride(workDir: string): WorkOverrideMeta {
  const metaPath = join(workDir, 'meta.json');
  if (!existsSync(metaPath)) return {};
  return JSON.parse(readFileSync(metaPath, 'utf-8')) as WorkOverrideMeta;
}

function convertWork(workId: string): WorkMeta {
  const workDir = join(CONTENT_DIR, workId);
  const override = loadWorkOverride(workDir);
  const movementFiles = readdirSync(workDir).filter((name) => name.endsWith('.musicxml'));
  if (movementFiles.length === 0) {
    throw new Error(`content/musicxml/${workId}/ に .musicxml が見つかりません`);
  }

  const outWorkDir = join(OUTPUT_DIR, workId);
  mkdirSync(outWorkDir, { recursive: true });

  const movementMetas: WorkMeta['movements'] = [];
  let workTitle = override.title;
  let composer = override.composer ?? '不明';

  for (const file of movementFiles.sort()) {
    const movementId = file.replace(/\.musicxml$/, '');
    const parsed = parseMusicXmlFile(join(workDir, file));
    const movement = toInternalMovement(parsed, { movementId });
    workTitle ??= parsed.workTitle;

    const measureCount = movementMeasureCount(movement);
    const movementData: MovementData = {
      workId,
      workTitle,
      composer,
      movement,
    };
    writeFileSync(join(outWorkDir, `${movementId}.json`), JSON.stringify(movementData, null, 2));

    movementMetas.push({
      id: movementId,
      title: movement.title,
      timeSignature: movement.timeSignature,
      baseBpm: movement.tempoEvents[0]?.bpm ?? 120,
      measureCount,
      partLabels: movement.parts.map((part) => part.label),
    });

    console.log(`  ✓ ${workId}/${movementId}: ${measureCount}小節, ${movement.parts.length}パート`);
  }

  return {
    id: workId,
    title: workTitle ?? workId,
    composer,
    composerSortKey: override.composerSortKey,
    movements: movementMetas,
  };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const works: WorkMeta[] = [];
  for (const workId of listWorkDirs()) {
    console.log(`変換中: ${workId}`);
    works.push(convertWork(workId));
  }
  const index: WorksIndex = { works };
  writeFileSync(join(OUTPUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`\n完了: ${works.length}作品を public/data/works/ に書き出しました`);
}

main();
