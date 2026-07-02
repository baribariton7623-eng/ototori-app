import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { movementMeasureCount, partTotalBeats, quarterBeatsPerMeasure } from '../../src/audio/measureMap';
import type { MovementData, WorksIndex } from '../../src/types/music';

/**
 * public/data/works/** の変換済みデータに対する整合性チェック。
 * エラー(重大な不整合)は exit code 1 で終了し、警告は出力のみに留める。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../public/data/works');

const EPS = 1e-6;

function main() {
  const errors: string[] = [];
  const warnings: string[] = [];

  const indexPath = join(OUTPUT_DIR, 'index.json');
  const index: WorksIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));

  for (const work of index.works) {
    const workDir = join(OUTPUT_DIR, work.id);
    for (const movementMeta of work.movements) {
      const movementPath = join(workDir, `${movementMeta.id}.json`);
      const data: MovementData = JSON.parse(readFileSync(movementPath, 'utf-8'));
      const { movement } = data;
      const label = `${work.id}/${movementMeta.id}`;

      if (movement.parts.length === 0) {
        errors.push(`[${label}] パートが0件です`);
        continue;
      }

      const partIds = new Set<string>();
      for (const part of movement.parts) {
        if (partIds.has(part.id)) {
          errors.push(`[${label}] パートIDが重複しています: ${part.id}`);
        }
        partIds.add(part.id);
      }

      const qbpm = quarterBeatsPerMeasure(movement.timeSignature);
      const pickup = movement.pickupBeats ?? 0;
      for (const part of movement.parts) {
        const total = partTotalBeats(part);
        const contentBeats = total - pickup;
        if (contentBeats < -EPS) {
          errors.push(
            `[${label}] パート「${part.label}」の総拍数(${total})が弱起拍数(${pickup})より少ないです`,
          );
          continue;
        }
        const remainder = contentBeats % qbpm;
        if (remainder > EPS && qbpm - remainder > EPS) {
          warnings.push(
            `[${label}] パート「${part.label}」の末尾が小節の途中で終わっています(端数 ${remainder.toFixed(3)}拍)`,
          );
        }
      }

      const recomputedMeasureCount = movementMeasureCount(movement);
      if (recomputedMeasureCount !== movementMeta.measureCount) {
        errors.push(
          `[${label}] index.json の measureCount(${movementMeta.measureCount})が実データ(${recomputedMeasureCount})と一致しません`,
        );
      }

      if (movement.tempoEvents.length === 0) {
        errors.push(`[${label}] tempoEvents が空です(先頭のBPM指定が必須)`);
      } else {
        const expectedStart = pickup > 0 ? -pickup : 0;
        if (Math.abs(movement.tempoEvents[0].atBeat - expectedStart) > EPS) {
          errors.push(
            `[${label}] 先頭のtempoEventが楽章開始位置(${expectedStart}拍)にありません(atBeat=${movement.tempoEvents[0].atBeat})`,
          );
        }
        const sorted = [...movement.tempoEvents].sort((a, b) => a.atBeat - b.atBeat);
        if (JSON.stringify(sorted) !== JSON.stringify(movement.tempoEvents)) {
          errors.push(`[${label}] tempoEvents が atBeat 昇順ではありません`);
        }
      }
    }
  }

  // public/data/works/ 配下に index.json が参照していない作品フォルダが残っていないか
  const dirEntries = readdirSync(OUTPUT_DIR).filter((name) => name !== 'index.json');
  const indexedIds = new Set(index.works.map((w) => w.id));
  for (const entry of dirEntries) {
    if (!indexedIds.has(entry)) {
      warnings.push(`[${entry}] index.json に登録されていない作品フォルダです(不要なら削除してください)`);
    }
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  for (const error of errors) console.error(`✗ ${error}`);

  if (errors.length > 0) {
    console.error(`\n検証失敗: エラー${errors.length}件、警告${warnings.length}件`);
    process.exit(1);
  }
  console.log(`検証成功: 警告${warnings.length}件`);
}

main();
